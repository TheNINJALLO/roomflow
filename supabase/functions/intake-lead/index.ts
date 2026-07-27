import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-roomflow-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

type NormalizedLead = {
  sourceMessageId: string | null;
  sourceSender: string | null;
  sourceSubject: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  issueDescription: string | null;
  appointmentStart: string | null;
  appointmentEnd: string | null;
  assignedEstimator: string | null;
  leadSource: string;
  externalKey: string | null;
  raw: JsonRecord;
};

function response(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).replace(/\s+/g, " ").trim();
  return result.length ? result : null;
}

function firstValue(payload: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = clean(payload[key]);
    if (value) return value;
  }
  return null;
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 7 ? digits : value;
}

function normalizeEmail(value: string | null): string | null {
  return value ? value.toLowerCase() : null;
}

function safeIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function splitName(fullName: string | null, payload: JsonRecord): { firstName: string; lastName: string; fullName: string } {
  const first = firstValue(payload, ["first_name", "firstName", "caller_first_name", "customer_first_name"]);
  const last = firstValue(payload, ["last_name", "lastName", "caller_last_name", "customer_last_name"]);
  if (first || last) {
    return {
      firstName: first ?? "",
      lastName: last ?? "",
      fullName: [first, last].filter(Boolean).join(" ").trim() || "Unknown Customer",
    };
  }

  const parts = (fullName ?? "Unknown Customer").trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "", fullName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
    fullName: parts.join(" "),
  };
}

function normalizeLead(payload: JsonRecord): NormalizedLead {
  const suppliedName = firstValue(payload, [
    "customer_name", "customerName", "caller_name", "callerName", "name", "full_name", "fullName",
  ]);
  const names = splitName(suppliedName, payload);

  const appointmentStartRaw = firstValue(payload, [
    "appointment_start", "appointmentStart", "appointment_datetime", "appointmentDateTime", "scheduled_at",
  ]);
  const appointmentEndRaw = firstValue(payload, ["appointment_end", "appointmentEnd"]);

  return {
    sourceMessageId: firstValue(payload, [
      "source_message_id", "sourceMessageId", "gmail_message_id", "gmailMessageId", "message_id", "messageId",
    ]),
    sourceSender: firstValue(payload, ["source_sender", "sourceSender", "from", "sender"]),
    sourceSubject: firstValue(payload, ["source_subject", "sourceSubject", "subject"]),
    firstName: names.firstName,
    lastName: names.lastName,
    fullName: names.fullName,
    email: normalizeEmail(firstValue(payload, ["email", "customer_email", "customerEmail", "caller_email", "callerEmail"])),
    phone: normalizePhone(firstValue(payload, ["phone", "customer_phone", "customerPhone", "caller_phone", "callerPhone"])),
    address: firstValue(payload, ["address", "service_address", "serviceAddress", "property_address", "propertyAddress", "street"]),
    city: firstValue(payload, ["city", "service_city", "serviceCity"]),
    state: firstValue(payload, ["state", "region", "service_state", "serviceState"]),
    postalCode: firstValue(payload, ["postal_code", "postalCode", "zip", "zipcode", "zip_code"]),
    issueDescription: firstValue(payload, [
      "issue_description", "issueDescription", "job_description", "jobDescription", "problem", "notes", "message",
    ]),
    appointmentStart: safeIso(appointmentStartRaw),
    appointmentEnd: safeIso(appointmentEndRaw),
    assignedEstimator: firstValue(payload, ["assigned_estimator", "assignedEstimator", "estimator", "assigned_to", "assignedTo"]),
    leadSource: firstValue(payload, ["lead_source", "leadSource", "source"]) ?? "email",
    externalKey: firstValue(payload, ["external_key", "externalKey", "lead_id", "leadId"]),
    raw: payload,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
    payload = await request.json();
  } catch {
    return response({ error: "Request body must be valid JSON" }, 400);
  }

  const url = new URL(request.url);
  const endpointKey = clean(payload.endpoint_key) ?? clean(payload.endpointKey) ?? clean(url.searchParams.get("endpoint"));
  const suppliedSecret = clean(request.headers.get("x-roomflow-webhook-secret")) ?? clean(payload.webhook_secret) ?? clean(payload.webhookSecret);
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
  if (!lead.email && !lead.phone && lead.fullName === "Unknown Customer") {
    return response({ error: "Lead requires at least a name, email, or phone number" }, 422);
  }

  const organizationId = endpoint.organization_id as string;
  let customerId: string | null = null;

  // Match existing contacts by external key, email, then phone.
  if (lead.externalKey) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("external_key", lead.externalKey)
      .maybeSingle();
    customerId = data?.id ?? null;
  }
  if (!customerId && lead.email) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("email", lead.email)
      .limit(1)
      .maybeSingle();
    customerId = data?.id ?? null;
  }
  if (!customerId && lead.phone) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("phone", lead.phone)
      .limit(1)
      .maybeSingle();
    customerId = data?.id ?? null;
  }

  const customerPayload = {
    organization_id: organizationId,
    name: lead.fullName,
    first_name: lead.firstName || null,
    last_name: lead.lastName || null,
    email: lead.email,
    phone: lead.phone,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    postal_code: lead.postalCode,
    lead_source: lead.leadSource,
    external_key: lead.externalKey,
    notes: lead.issueDescription,
  };

  if (customerId) {
    const { error } = await supabase.from("customers").update(customerPayload).eq("id", customerId);
    if (error) return response({ error: "Could not update customer", details: error.message }, 500);
  } else {
    const { data, error } = await supabase.from("customers").insert(customerPayload).select("id").single();
    if (error) return response({ error: "Could not create customer", details: error.message }, 500);
    customerId = data.id;
  }

  let existingJobId: string | null = null;
  if (lead.sourceMessageId) {
    const { data } = await supabase
      .from("jobs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("source_email_message_id", lead.sourceMessageId)
      .maybeSingle();
    existingJobId = data?.id ?? null;
  }

  const jobName = `${lead.fullName}${lead.address ? ` - ${lead.address}` : ""}`;
  const jobPayload = {
    organization_id: organizationId,
    customer_id: customerId,
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
  };

  let jobId: string;
  if (existingJobId) {
    const { data, error } = await supabase.from("jobs").update(jobPayload).eq("id", existingJobId).select("id").single();
    if (error) return response({ error: "Could not update job", details: error.message }, 500);
    jobId = data.id;
  } else {
    const { data, error } = await supabase.from("jobs").insert(jobPayload).select("id").single();
    if (error) return response({ error: "Could not create job", details: error.message }, 500);
    jobId = data.id;
  }

  const normalizedPayload = {
    ...lead,
    raw: undefined,
    customerId,
    jobId,
    organizationId,
  };

  const importPayload = {
    organization_id: organizationId,
    endpoint_id: endpoint.endpoint_id,
    customer_id: customerId,
    job_id: jobId,
    source: lead.leadSource,
    source_message_id: lead.sourceMessageId,
    source_sender: lead.sourceSender,
    source_subject: lead.sourceSubject,
    raw_payload: payload,
    normalized_payload: normalizedPayload,
    import_status: existingJobId ? "updated" : "imported",
    received_at: new Date().toISOString(),
  };

  const importQuery = lead.sourceMessageId
    ? supabase.from("lead_imports").upsert(importPayload, { onConflict: "organization_id,source_message_id" })
    : supabase.from("lead_imports").insert(importPayload);
  const { error: importError } = await importQuery;
  if (importError) console.error("Lead audit insert failed", importError);

  await supabase.from("job_status_events").insert({
    organization_id: organizationId,
    job_id: jobId,
    event_type: existingJobId ? "lead.updated" : "lead.imported",
    old_status: existingJobId ? null : null,
    new_status: "New Lead",
    note: lead.sourceSubject ?? "Lead imported from email automation",
    metadata: { endpoint_key: endpointKey, source_message_id: lead.sourceMessageId },
  });

  return response({
    ok: true,
    duplicate: Boolean(existingJobId),
    organization_id: organizationId,
    customer_id: customerId,
    job_id: jobId,
    status: existingJobId ? "updated" : "created",
  }, existingJobId ? 200 : 201);
});
