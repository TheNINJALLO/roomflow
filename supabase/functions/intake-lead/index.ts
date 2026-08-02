import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fingerprintInput,
  normalizeLead,
  parseRequestPayload,
  payloadField,
  publicLead,
} from "./lead-normalizer.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-roomflow-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

function response(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(value: unknown): string | null {
  if (value === null || value === undefined || typeof value === "object") return null;
  const result = String(value).replace(/\s+/g, " ").trim();
  return result.length ? result : null;
}

function phoneDigits(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(item => redactSecrets(item, depth + 1));
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, item]) => [
    key,
    /secret|authorization|api[_-]?key|token/i.test(key) ? "[REDACTED]" : redactSecrets(item, depth + 1),
  ]));
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return response({ error: "Server configuration is incomplete" }, 500);
  }

  let payload: JsonRecord;
  try {
    payload = await parseRequestPayload(request) as JsonRecord;
  } catch (error) {
    return response({
      error: "Request body could not be read",
      details: error instanceof Error ? error.message : String(error),
    }, 400);
  }

  const url = new URL(request.url);
  const endpointKey = payloadField(payload, ["endpoint_key", "endpointKey"])
    ?? clean(url.searchParams.get("endpoint"));
  const suppliedSecret = clean(request.headers.get("x-roomflow-webhook-secret"))
    ?? payloadField(payload, ["webhook_secret", "webhookSecret"]);
  if (!endpointKey || !suppliedSecret) {
    return response({ error: "Missing endpoint key or webhook secret" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const secretHash = await sha256Hex(suppliedSecret);
  const { data: endpointRows, error: endpointError } = await supabase.rpc("verify_integration_endpoint", {
    requested_endpoint_key: endpointKey,
    supplied_secret_hash: secretHash,
  });
  if (endpointError) {
    console.error("Endpoint verification failed", endpointError);
    return response({ error: "Endpoint verification failed" }, 500);
  }

  const endpoint = Array.isArray(endpointRows) ? endpointRows[0] : endpointRows;
  if (!endpoint?.organization_id) return response({ error: "Invalid or disabled webhook credentials" }, 401);

  const lead = normalizeLead(payload);
  const organizationId = endpoint.organization_id as string;
  if (!lead.sourceMessageId) {
    lead.sourceMessageId = `generated:${await sha256Hex(fingerprintInput(lead))}`;
  }
  if (!lead.email && !lead.phone && lead.fullName === "Unknown Customer") {
    const importError = "No caller name, email, or phone could be extracted from the delivery.";
    const { error: rejectedImportError } = await supabase.from("lead_imports").upsert({
      organization_id: organizationId,
      endpoint_id: endpoint.endpoint_id,
      source: lead.leadSource,
      source_message_id: lead.sourceMessageId,
      source_sender: lead.sourceSender,
      source_subject: lead.sourceSubject,
      raw_payload: redactSecrets(payload),
      normalized_payload: publicLead(lead),
      import_status: "failed",
      import_error: importError,
      received_at: new Date().toISOString(),
    }, { onConflict: "organization_id,source_message_id" });
    if (rejectedImportError) console.error("Rejected lead audit upsert failed", rejectedImportError);
    return response({
      error: "No caller details were found",
      hint: "Send customer_name, email, or phone, or include labeled caller details in the email body.",
      normalized: publicLead(lead),
      warnings: lead.warnings,
    }, 422);
  }

  const sourceJobResult = await supabase.from("jobs").select("id,status,name,external_key,customer_id")
    .eq("organization_id", organizationId).eq("source_email_message_id", lead.sourceMessageId).maybeSingle();
  if (sourceJobResult.error) {
    return response({ error: "Could not check for an existing email job", details: sourceJobResult.error.message }, 500);
  }

  let externalJob: JsonRecord | null = null;
  if (lead.externalKey) {
    const result = await supabase.from("jobs").select("id,status,name,external_key,customer_id")
      .eq("organization_id", organizationId).eq("external_key", lead.externalKey).maybeSingle();
    if (result.error) {
      return response({ error: "Could not check for an existing external job", details: result.error.message }, 500);
    }
    externalJob = result.data;
  }
  const sourceJob = sourceJobResult.data as JsonRecord | null;
  if (sourceJob && externalJob && sourceJob.id !== externalJob.id) {
    return response({
      error: "Lead identity conflict",
      hint: "The source_message_id and external_key already belong to different jobs.",
    }, 409);
  }

  const existingJob = sourceJob ?? externalJob;
  const matchedBy = sourceJob ? "source_message_id" : externalJob ? "external_key" : null;
  let customer: JsonRecord | null = null;

  if (existingJob?.customer_id) {
    const result = await supabase.from("customers").select("*")
      .eq("organization_id", organizationId).eq("id", existingJob.customer_id).maybeSingle();
    if (result.error) {
      return response({ error: "Could not load the existing job customer", details: result.error.message }, 500);
    }
    customer = result.data;
  }
  if (lead.externalKey) {
    const result = await supabase.from("customers").select("*")
      .eq("organization_id", organizationId).eq("external_key", lead.externalKey).maybeSingle();
    if (result.error) {
      return response({ error: "Could not find customer by external key", details: result.error.message }, 500);
    }
    customer = customer ?? result.data;
  }
  if (!customer && lead.email) {
    const result = await supabase.from("customers").select("*")
      .eq("organization_id", organizationId).ilike("email", lead.email).limit(1).maybeSingle();
    if (result.error) {
      return response({ error: "Could not find customer by email", details: result.error.message }, 500);
    }
    customer = result.data;
  }
  if (!customer && lead.phone) {
    const result = await supabase.from("customers").select("*")
      .eq("organization_id", organizationId).not("phone", "is", null).limit(1000);
    if (result.error) {
      return response({ error: "Could not find customer by phone", details: result.error.message }, 500);
    }
    customer = (result.data ?? []).find((row: JsonRecord) => phoneDigits(row.phone) === phoneDigits(lead.phone)) ?? null;
  }

  const customerId = clean(customer?.id);
  const customerFields: JsonRecord = {
    organization_id: organizationId,
    lead_source: lead.leadSource,
  };
  if (lead.fullName !== "Unknown Customer") customerFields.name = lead.fullName;
  if (lead.firstName) customerFields.first_name = lead.firstName;
  if (lead.lastName) customerFields.last_name = lead.lastName;
  if (lead.email) customerFields.email = lead.email;
  if (lead.phone) customerFields.phone = lead.phone;
  if (lead.address) customerFields.address = lead.address;
  if (lead.city) customerFields.city = lead.city;
  if (lead.state) customerFields.state = lead.state;
  if (lead.postalCode) customerFields.postal_code = lead.postalCode;
  if (lead.externalKey) customerFields.external_key = lead.externalKey;
  if (lead.issueDescription) customerFields.notes = lead.issueDescription;

  let savedCustomerId = customerId;
  if (savedCustomerId) {
    const { error } = await supabase.from("customers").update(customerFields)
      .eq("organization_id", organizationId).eq("id", savedCustomerId);
    if (error) return response({ error: "Could not update customer", details: error.message }, 500);
  } else {
    const { data, error } = await supabase.from("customers").insert({
      ...customerFields,
      name: lead.fullName,
    }).select("id").single();
    if (error) return response({ error: "Could not create customer", details: error.message }, 500);
    savedCustomerId = data.id;
  }

  const jobName = `${lead.fullName}${lead.address ? ` - ${lead.address}` : ""}`;
  let jobId: string;

  if (existingJob?.id) {
    const jobFields: JsonRecord = {
      customer_id: savedCustomerId,
      lead_source: lead.leadSource,
      source_email_message_id: lead.sourceMessageId,
    };
    if (lead.fullName !== "Unknown Customer" || lead.address) jobFields.name = jobName;
    if (lead.address) jobFields.property_address = lead.address;
    if (lead.city) jobFields.city = lead.city;
    if (lead.state) jobFields.state = lead.state;
    if (lead.postalCode) jobFields.postal_code = lead.postalCode;
    if (lead.issueDescription) jobFields.issue_description = lead.issueDescription;
    if (lead.appointmentStart) jobFields.appointment_start = lead.appointmentStart;
    if (lead.appointmentEnd) jobFields.appointment_end = lead.appointmentEnd;
    if (lead.externalKey) jobFields.external_key = lead.externalKey;

    const { data, error } = await supabase.from("jobs").update(jobFields)
      .eq("organization_id", organizationId).eq("id", existingJob.id).select("id").single();
    if (error) return response({ error: "Could not update job", details: error.message }, 500);
    jobId = data.id;
  } else {
    const { data, error } = await supabase.from("jobs").insert({
      organization_id: organizationId,
      customer_id: savedCustomerId,
      name: jobName,
      status: "New Lead",
      property_address: lead.address,
      city: lead.city,
      state: lead.state,
      postal_code: lead.postalCode,
      issue_description: lead.issueDescription,
      appointment_start: lead.appointmentStart,
      appointment_end: lead.appointmentEnd,
      lead_source: lead.leadSource,
      source_email_message_id: lead.sourceMessageId,
      external_key: lead.externalKey,
      tracking_color: "yellow",
      estimate_status: "not_started",
      followup_status: "inactive",
    }).select("id").single();
    if (error) return response({ error: "Could not create job", details: error.message }, 500);
    jobId = data.id;
  }

  const normalizedPayload = {
    ...publicLead(lead),
    customerId: savedCustomerId,
    jobId,
    organizationId,
  };
  const importStatus = matchedBy === "source_message_id" ? "duplicate" : matchedBy ? "updated" : "imported";
  const { error: importError } = await supabase.from("lead_imports").upsert({
    organization_id: organizationId,
    endpoint_id: endpoint.endpoint_id,
    customer_id: savedCustomerId,
    job_id: jobId,
    source: lead.leadSource,
    source_message_id: lead.sourceMessageId,
    source_sender: lead.sourceSender,
    source_subject: lead.sourceSubject,
    raw_payload: redactSecrets(payload),
    normalized_payload: normalizedPayload,
    import_status: importStatus,
    import_error: null,
    received_at: new Date().toISOString(),
  }, { onConflict: "organization_id,source_message_id" });
  if (importError) {
    console.error("Lead audit upsert failed", importError);
    lead.warnings.push("The job was saved, but the intake audit record could not be updated.");
  }

  if (matchedBy !== "source_message_id") {
    const { error: eventError } = await supabase.from("job_status_events").insert({
      organization_id: organizationId,
      job_id: jobId,
      event_type: existingJob ? "lead.updated" : "lead.imported",
      old_status: existingJob?.status ?? null,
      new_status: existingJob?.status ?? "New Lead",
      note: lead.sourceSubject ?? "Lead imported from email automation",
      metadata: {
        endpoint_key: endpointKey,
        source_message_id: lead.sourceMessageId,
        matched_by: matchedBy,
        assigned_estimator: lead.assignedEstimator,
      },
    });
    if (eventError) console.error("Lead timeline insert failed", eventError);
  }

  return response({
    ok: true,
    duplicate: matchedBy === "source_message_id",
    status: existingJob ? (matchedBy === "source_message_id" ? "duplicate" : "updated") : "created",
    matched_by: matchedBy,
    organization_id: organizationId,
    customer_id: savedCustomerId,
    job_id: jobId,
    normalized: publicLead(lead),
    warnings: lead.warnings,
  }, existingJob ? 200 : 201);
});
