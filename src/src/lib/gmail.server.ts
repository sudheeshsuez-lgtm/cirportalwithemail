import { Buffer } from "node:buffer";

export function isGmailConfigured() {
  return Boolean(process.env["GMAIL_SENDER_EMAIL"] && process.env["GMAIL_CLIENT_ID"] && process.env["GMAIL_CLIENT_SECRET"] && process.env["GMAIL_REFRESH_TOKEN"]);
}

export class GmailNotConfiguredError extends Error {
  constructor() {
    super("Gmail notifications are not configured. Add the Gmail OAuth credentials to the server environment.");
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new GmailNotConfiguredError();
  return value;
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

async function accessToken() {
  const body = new URLSearchParams({
    client_id: requiredEnv("GMAIL_CLIENT_ID"),
    client_secret: requiredEnv("GMAIL_CLIENT_SECRET"),
    refresh_token: requiredEnv("GMAIL_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Gmail OAuth failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google did not return an access token.");
  return data.access_token;
}

export async function sendStudentDecisionEmail(input: {
  to: string;
  studentName: string;
  decision: "Approved" | "Rejected";
}) {
  const sender = requiredEnv("GMAIL_SENDER_EMAIL");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender) || /[\r\n]/.test(sender)) throw new Error("GMAIL_SENDER_EMAIL is invalid.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to) || /[\r\n]/.test(input.to)) throw new Error("Student email address is missing or invalid.");
  const token = await accessToken();
  const approved = input.decision === "Approved";
  const subject = approved ? "CIR Portal application update: Approved" : "CIR Portal application update";
  const greeting = input.studentName ? `Dear ${input.studentName},` : "Dear Student,";
  const message = approved
    ? "Your application has been approved. The Centre for International Relations will share the next steps with you separately."
    : "Thank you for your interest. After review, your application was not approved at this time. Please contact the CIR office if you need clarification.";
  const text = `${greeting}\n\n${message}\n\nRegards,\nCentre for International Relations`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><p>${escapeHtml(greeting)}</p><p>${escapeHtml(message)}</p><p>Regards,<br><strong>Centre for International Relations</strong></p></div>`;
  const mime = [
    `From: CIR Portal <${sender}>`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="cir-portal-boundary"',
    "",
    "--cir-portal-boundary",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "--cir-portal-boundary",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "--cir-portal-boundary--",
  ].join("\r\n");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(mime) }),
  });
  if (!response.ok) throw new Error(`Gmail send failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  return { messageId: ((await response.json()) as { id?: string }).id ?? null };
}

/** Atomically claims one notification so a repeated teacher click cannot send duplicates. */
export async function claimNotification(input: { sheetId: string; rowNumber: number; decision: "Approved" | "Rejected" }) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for email notification tracking.");
  const response = await fetch(`${url}/rest/v1/email_notification_log?on_conflict=sheet_id,row_number,decision`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify({ sheet_id: input.sheetId, row_number: input.rowNumber, decision: input.decision, status: "sending" }),
  });
  if (!response.ok) throw new Error(`Could not record email notification (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const rows = (await response.json()) as { id: string }[];
  if (rows.length > 0) return rows[0]!.id;

  // A previous attempt may have failed. Reclaim only a failed row; the status
  // predicate makes this retry safe when two teachers act at nearly the same time.
  const retry = await fetch(
    `${url}/rest/v1/email_notification_log?sheet_id=eq.${encodeURIComponent(input.sheetId)}&row_number=eq.${input.rowNumber}&decision=eq.${input.decision}&status=eq.failed`,
    {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: "sending", error_message: null, updated_at: new Date().toISOString() }),
    },
  );
  if (!retry.ok) throw new Error(`Could not retry failed email notification (${retry.status}).`);
  const retried = (await retry.json()) as { id: string }[];
  return retried.length > 0 ? retried[0]!.id : null;
}

export async function finishNotification(id: string, status: "sent" | "failed", errorMessage?: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  const response = await fetch(`${url}/rest/v1/email_notification_log?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ status, error_message: errorMessage?.slice(0, 500) ?? null, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Could not update email notification status (${response.status}).`);
}
