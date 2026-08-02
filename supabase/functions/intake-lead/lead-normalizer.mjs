const BODY_KEYS = [
  "body_plain", "bodyPlain", "plain_body", "plainBody", "email_body", "emailBody",
  "body_text", "bodyText", "body_html", "bodyHtml", "html_body", "htmlBody",
  "raw_body", "rawBody", "text", "body", "message", "content", "snippet", "transcript",
];

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function primitiveText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null;
  const text = String(value).trim();
  return text || null;
}

function clean(value) {
  const text = primitiveText(value);
  return text ? text.replace(/\s+/g, " ").trim() : null;
}

function addLookupValue(lookup, key, value) {
  const normalized = normalizeKey(key);
  const text = primitiveText(value);
  if (normalized && text && !lookup.has(normalized)) lookup.set(normalized, text);
}

function flattenInto(value, lookup, path = [], depth = 0) {
  if (depth > 5 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item, index) => flattenInto(item, lookup, [...path, String(index)], depth + 1));
    return;
  }
  if (typeof value !== "object") {
    for (let start = 0; start < path.length; start += 1) {
      addLookupValue(lookup, path.slice(start).join("_"), value);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    flattenInto(child, lookup, childPath, depth + 1);
    if (typeof child === "string" && /^(data|payload|lead|fields|record|raw|request|body)$/i.test(key)) {
      const trimmed = child.trim();
      if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        try { flattenInto(JSON.parse(trimmed), lookup, childPath, depth + 1); } catch { /* Not JSON; treat as email text. */ }
      }
    }
  }
}

export function flattenPayload(payload) {
  const lookup = new Map();
  flattenInto(payload, lookup);
  return lookup;
}

function lookupValue(lookup, aliases) {
  for (const alias of aliases) {
    const value = lookup.get(normalizeKey(alias));
    if (value) return value;
  }
  return null;
}

function directValue(payload, aliases) {
  const wanted = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(payload || {})) {
    if (!wanted.has(normalizeKey(key))) continue;
    const text = clean(value);
    if (text) return text;
  }
  return null;
}

function decodeEntities(value) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "")
    .replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
      const lower = entity.toLowerCase();
      if (named[lower]) return named[lower];
      const radix = lower.startsWith("#x") ? 16 : 10;
      const numberText = lower.replace(/^#x?/, "");
      const codePoint = Number.parseInt(numberText, radix);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    });
}

function bodyToText(value) {
  return decodeEntities(String(value || ""))
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|td|th|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*(p|div|li|tr|td|th|h[1-6])(?:\s[^>]*)?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const LABEL_FIELDS = new Map(Object.entries({
  name: "fullName", caller: "fullName", callername: "fullName", callersname: "fullName",
  customer: "fullName", customername: "fullName", contact: "fullName", contactname: "fullName",
  fullname: "fullName", nameofcaller: "fullName",
  firstname: "firstName", callerfirstname: "firstName", customerfirstname: "firstName",
  lastname: "lastName", callerlastname: "lastName", customerlastname: "lastName",
  email: "email", emailaddress: "email", calleremail: "email", customeremail: "email", contactemail: "email",
  phone: "phone", phonenumber: "phone", callbacknumber: "phone", callernumber: "phone",
  callerphone: "phone", customerphone: "phone", telephone: "phone", mobile: "phone", mobilenumber: "phone",
  address: "address", streetaddress: "address", serviceaddress: "address", propertyaddress: "address",
  jobaddress: "address", location: "address",
  city: "city", servicecity: "city", state: "state", servicestate: "state", region: "state",
  zip: "postalCode", zipcode: "postalCode", zipcodepostal: "postalCode", postalcode: "postalCode",
  issue: "issueDescription", issuedescription: "issueDescription", problem: "issueDescription",
  problemreported: "issueDescription", reasonforcall: "issueDescription", reasonforcalling: "issueDescription",
  callreason: "issueDescription", serviceneeded: "issueDescription", servicerequest: "issueDescription",
  callerrequest: "issueDescription", message: "issueDescription", notes: "issueDescription",
  description: "issueDescription", detailsofthecall: "issueDescription",
  appointment: "appointmentStart", appointmentdate: "appointmentStart", appointmenttime: "appointmentStart",
  appointmentdatetime: "appointmentStart", scheduledfor: "appointmentStart", scheduledat: "appointmentStart",
  estimator: "assignedEstimator", assignedestimator: "assignedEstimator", assignedto: "assignedEstimator",
}));

function fieldForLabel(label) {
  const normalized = normalizeKey(label.replace(/^callers?/, "caller"));
  return LABEL_FIELDS.get(normalized) || null;
}

export function parseEmailBody(value) {
  const text = bodyToText(value);
  const result = { rawText: text };
  if (!text) return result;

  const lines = text.split("\n").map(line => line.replace(/^\s*[>•*\-]+\s*/, "").trim()).filter(Boolean);
  let activeField = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z][A-Za-z0-9 &'()/_-]{0,48})\s*[:=\-]\s*(.*)$/);
    if (match) {
      const field = fieldForLabel(match[1]);
      if (!field) { activeField = null; continue; }
      let fieldValue = match[2].trim();
      if (!fieldValue && lines[index + 1] && !/^[A-Za-z][A-Za-z0-9 &'()/_-]{0,48}\s*[:=\-]/.test(lines[index + 1])) {
        fieldValue = lines[index + 1];
        index += 1;
      }
      if (fieldValue && !result[field]) result[field] = fieldValue;
      activeField = field === "issueDescription" ? field : null;
      continue;
    }
    if (activeField === "issueDescription" && result.issueDescription) {
      result.issueDescription += ` ${line}`;
    }
  }

  if (!result.email) result.email = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || null;
  if (!result.phone) {
    const phone = text.match(/(?:\+?1[\s.()-]*)?(?:\d{3}[\s.()-]*){2}\d{4}\b/);
    if (phone) result.phone = phone[0];
  }
  return result;
}

function normalizePhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 7 ? digits : clean(value);
}

function normalizeEmail(value) {
  const match = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function safeIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function nameFromSubject(subject) {
  if (!subject) return null;
  const match = subject.match(/(?:new\s+)?(?:caller|call|lead|inquiry)(?:\s+(?:from|for))?\s*[:\-]?\s+(.+)/i);
  if (!match) return null;
  return clean(match[1].replace(/\s*[|\-–—]\s*(?:phone|service|request|message).*$/i, ""));
}

function splitName(fullName, firstName, lastName) {
  const first = clean(firstName);
  const last = clean(lastName);
  if (first || last) return { firstName: first || "", lastName: last || "", fullName: [first, last].filter(Boolean).join(" ") };
  const normalized = clean(fullName) || "Unknown Customer";
  const parts = normalized.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "", fullName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" "), fullName: parts.join(" ") };
}

export function normalizeLead(payload) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const lookup = flattenPayload(source);
  const rawBody = lookupValue(lookup, BODY_KEYS);
  const body = parseEmailBody(rawBody);
  const sourceSubject = clean(lookupValue(lookup, ["source_subject", "sourceSubject", "email_subject", "emailSubject", "subject", "title"]));
  const suppliedName = clean(lookupValue(lookup, [
    "customer_name", "customerName", "caller_name", "callerName", "contact_name", "contactName",
    "lead_name", "leadName", "full_name", "fullName",
  ])) || directValue(source, ["name"]) || clean(body.fullName) || nameFromSubject(sourceSubject);
  const firstName = clean(lookupValue(lookup, ["caller_first_name", "customer_first_name", "contact_first_name", "first_name", "firstName"])) || clean(body.firstName);
  const lastName = clean(lookupValue(lookup, ["caller_last_name", "customer_last_name", "contact_last_name", "last_name", "lastName"])) || clean(body.lastName);
  const names = splitName(suppliedName, firstName, lastName);

  const explicitEmail = clean(lookupValue(lookup, [
    "caller_email", "callerEmail", "customer_email", "customerEmail", "contact_email", "contactEmail",
    "lead_email", "leadEmail", "reply_to", "replyTo",
  ])) || directValue(source, ["email"]);
  const explicitPhone = clean(lookupValue(lookup, [
    "caller_phone", "callerPhone", "customer_phone", "customerPhone", "contact_phone", "contactPhone",
    "lead_phone", "leadPhone", "phone_number", "phoneNumber", "callback_number", "callbackNumber",
  ])) || directValue(source, ["phone", "telephone", "mobile"]);

  const appointmentStartRaw = clean(lookupValue(lookup, [
    "appointment_start", "appointmentStart", "appointment_datetime", "appointmentDateTime", "scheduled_at",
    "scheduledAt", "appointment", "scheduled_for", "scheduledFor",
  ])) || clean(body.appointmentStart) || [
    clean(lookupValue(lookup, ["appointment_date", "appointmentDate", "scheduled_date", "scheduledDate"])),
    clean(lookupValue(lookup, ["appointment_time", "appointmentTime", "scheduled_time", "scheduledTime"])),
  ].filter(Boolean).join(" ") || null;

  const sourceMessageId = clean(lookupValue(lookup, [
    "source_message_id", "sourceMessageId", "gmail_message_id", "gmailMessageId", "email_message_id",
    "emailMessageId", "message_id", "messageId", "zap_id", "zapId", "event_id", "eventId",
  ]));
  const address = clean(lookupValue(lookup, ["service_address", "serviceAddress", "property_address", "propertyAddress", "job_address", "jobAddress", "street_address", "streetAddress"])) || directValue(source, ["address", "street"]) || clean(body.address);
  const appointmentStart = safeIso(appointmentStartRaw);
  const warnings = [];
  if (!sourceMessageId) warnings.push("No source message ID was supplied; RoomFlow generated a retry-safe fingerprint.");
  if (!address) warnings.push("No service address was found.");
  if (appointmentStartRaw && !appointmentStart) warnings.push(`Appointment value could not be parsed: ${appointmentStartRaw}`);

  return {
    sourceMessageId,
    sourceSender: clean(lookupValue(lookup, ["source_sender", "sourceSender", "from_email", "fromEmail", "sender_email", "senderEmail", "from", "sender"])),
    sourceSubject,
    firstName: names.firstName,
    lastName: names.lastName,
    fullName: names.fullName,
    email: normalizeEmail(explicitEmail || body.email),
    phone: normalizePhone(explicitPhone || body.phone),
    address,
    city: clean(lookupValue(lookup, ["service_city", "serviceCity", "property_city", "propertyCity", "city"])) || clean(body.city),
    state: clean(lookupValue(lookup, ["service_state", "serviceState", "property_state", "propertyState", "state", "region"])) || clean(body.state),
    postalCode: clean(lookupValue(lookup, ["postal_code", "postalCode", "zip_code", "zipCode", "zipcode", "zip"])) || clean(body.postalCode),
    issueDescription: clean(lookupValue(lookup, [
      "issue_description", "issueDescription", "job_description", "jobDescription", "service_request",
      "serviceRequest", "call_reason", "callReason", "reason_for_call", "reasonForCall", "problem", "notes",
    ])) || clean(body.issueDescription) || clean(body.rawText),
    appointmentStart,
    appointmentEnd: safeIso(clean(lookupValue(lookup, ["appointment_end", "appointmentEnd", "scheduled_end", "scheduledEnd"]))),
    assignedEstimator: clean(lookupValue(lookup, ["assigned_estimator", "assignedEstimator", "estimator", "assigned_to", "assignedTo"])),
    leadSource: clean(lookupValue(lookup, ["lead_source", "leadSource", "trigger_source", "triggerSource"])) || directValue(source, ["source"]) || "email",
    externalKey: clean(lookupValue(lookup, ["external_key", "externalKey", "lead_id", "leadId", "caller_id", "callerId"])),
    warnings,
    raw: source,
  };
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function payloadField(payload, aliases) {
  const lookup = flattenPayload(payload && typeof payload === "object" ? payload : {});
  return clean(lookupValue(lookup, Array.isArray(aliases) ? aliases : [aliases]));
}

export function fingerprintInput(lead) {
  return stableStringify({
    sourceSender: lead.sourceSender,
    sourceSubject: lead.sourceSubject,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    postalCode: lead.postalCode,
    issueDescription: lead.issueDescription,
    appointmentStart: lead.appointmentStart,
    externalKey: lead.externalKey,
  });
}

export function publicLead(lead) {
  const { raw: _raw, ...safe } = lead;
  return safe;
}

function normalizeParsedPayload(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.find(item => item && typeof item === "object") || { items: parsed };
  }
  if (parsed && typeof parsed === "object") return parsed;
  return { body: clean(parsed) || "" };
}

export async function parseRequestPayload(request) {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const payload = {};
    for (const [key, value] of form.entries()) {
      if (typeof value !== "string") continue;
      if (payload[key] === undefined) payload[key] = value;
      else if (Array.isArray(payload[key])) payload[key].push(value);
      else payload[key] = [payload[key], value];
    }
    return payload;
  }

  const text = await request.text();
  if (!text.trim()) return {};
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const payload = {};
    new URLSearchParams(text).forEach((value, key) => { payload[key] = value; });
    return payload;
  }

  try { return normalizeParsedPayload(JSON.parse(text)); }
  catch { return { body: text }; }
}
