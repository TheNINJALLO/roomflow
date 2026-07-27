import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-roomflow-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => values[key] ?? "");
}

async function sendWithResend(apiKey: string, from: string, to: string, subject: string, body: string) {
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text: body }),
  });
  const payload = await result.json();
  if (!result.ok) throw new Error(payload?.message ?? `Email provider returned ${result.status}`);
  return payload;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const cronSecret = Deno.env.get("ROOMFLOW_CRON_SECRET");
  if (!cronSecret || request.headers.get("x-roomflow-cron-secret") !== cronSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("ROOMFLOW_FROM_EMAIL");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase configuration missing" }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const now = new Date().toISOString();

  const { data: messages, error } = await supabase
    .from("outreach_messages")
    .select(`
      id, organization_id, job_id, estimate_id, recipient, subject, body, status,
      jobs!inner(id, status, followup_status, customer_id),
      estimates(id, estimate_number, status)
    `)
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .limit(100);

  if (error) return json({ error: "Could not load scheduled messages", details: error.message }, 500);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const message of messages ?? []) {
    const job = Array.isArray(message.jobs) ? message.jobs[0] : message.jobs;
    const estimate = Array.isArray(message.estimates) ? message.estimates[0] : message.estimates;
    const stopStatuses = new Set(["Customer Replied", "Approved", "Declined", "Work Scheduled", "In Progress", "Completed", "Invoiced", "Paid", "Service Not Needed"]);
    const estimateStop = new Set(["accepted", "declined", "void", "expired"]);

    if (!job || job.followup_status !== "active" || stopStatuses.has(job.status) || (estimate && estimateStop.has(estimate.status))) {
      await supabase.from("outreach_messages").update({ status: "cancelled", error_message: "Stopped by current job/estimate state" }).eq("id", message.id);
      skipped++;
      continue;
    }

    if (!resendApiKey || !fromEmail) {
      await supabase.from("outreach_messages").update({ status: "ready_for_zapier" }).eq("id", message.id);
      skipped++;
      continue;
    }

    try {
      const providerResult = await sendWithResend(
        resendApiKey,
        fromEmail,
        message.recipient,
        substitute(message.subject ?? "Estimate follow-up", { estimate_number: estimate?.estimate_number ?? "" }),
        substitute(message.body, { estimate_number: estimate?.estimate_number ?? "" }),
      );
      await supabase.from("outreach_messages").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: providerResult.id ?? null,
        error_message: null,
      }).eq("id", message.id);
      sent++;
    } catch (sendError) {
      await supabase.from("outreach_messages").update({
        status: "failed",
        error_message: sendError instanceof Error ? sendError.message : String(sendError),
      }).eq("id", message.id);
      failed++;
    }
  }

  return json({ ok: true, processed: messages?.length ?? 0, sent, skipped, failed });
});
