import {
  REVIEWED_BY_HEADER,
  REVIEWED_ON_HEADER,
  STATUS_HEADER,
  columnLetter,
  parseRows,
  spreadsheetIdFromUrl,
} from "./progress";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

export class SheetsNotConnectedError extends Error {
  constructor() {
    super("Google Sheets is not connected yet.");
  }
}

function headers() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovableKey || !sheetsKey) throw new SheetsNotConnectedError();
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": sheetsKey,
    "Content-Type": "application/json",
  };
}

export function isSheetsConnected() {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["GOOGLE_SHEETS_API_KEY"]);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google Sheets request failed [${res.status}]: ${body}`);
    throw new Error(`Google Sheets request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function rangeFor(tab: string, a1: string) {
  // Encode only the tab name; ':' in the A1 range must stay unencoded.
  return `'${encodeURIComponent(tab.replace(/'/g, "''"))}'!${a1}`;
}

async function pickTab(spreadsheetId: string): Promise<string> {
  const meta = await call<{ sheets?: { properties: { title: string } }[] }>(
    `/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
  );
  const titles = (meta.sheets ?? []).map((s) => s.properties.title);
  return titles.find((t) => /^form responses/i.test(t)) ?? titles[0] ?? "Sheet1";
}

export async function readResponses(sheetUrl: string | null | undefined) {
  const id = spreadsheetIdFromUrl(sheetUrl);
  if (!id) return null;
  const tab = await pickTab(id);
  const data = await call<{ values?: string[][] }>(`/spreadsheets/${id}/values/${rangeFor(tab, "A1:ZZ5000")}`);
  return { id, tab, ...parseRows(data.values ?? []) };
}

export async function writeReview(
  sheetUrl: string,
  rowNumber: number,
  status: "Approved" | "Rejected" | "Pending",
  reviewer: string,
) {
  const sheet = await readResponses(sheetUrl);
  if (!sheet) throw new Error("The Google Sheet link is not set or is invalid.");
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || !sheet.rows.some((row) => row.rowNumber === rowNumber)) {
    throw new Error("The selected response no longer exists. Refresh the student list and try again.");
  }
  const { id, tab, headers: hdrs, map } = sheet;
  const student = sheet.rows.find((row) => row.rowNumber === rowNumber);
  if (!student) throw new Error("The selected response no longer exists.");
  const previousStatus = student.status;
  const updates: { range: string; values: string[][] }[] = [];
  const quoteTab = `'${encodeURIComponent(tab.replace(/'/g, "''"))}'!`;
  let next = hdrs.length;
  const ensure = (idx: number | undefined, name: string) => {
    if (idx !== undefined) return idx;
    const i = next++;
    updates.push({ range: `${quoteTab}${columnLetter(i)}1`, values: [[name]] });
    return i;
  };
  const sCol = ensure(map.status, STATUS_HEADER);
  const bCol = ensure(map.reviewedBy, REVIEWED_BY_HEADER);
  const oCol = ensure(map.reviewedOn, REVIEWED_ON_HEADER);
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  updates.push({ range: `${quoteTab}${columnLetter(sCol)}${rowNumber}`, values: [[status]] });
  updates.push({ range: `${quoteTab}${columnLetter(bCol)}${rowNumber}`, values: [[status === "Pending" ? "" : reviewer]] });
  updates.push({ range: `${quoteTab}${columnLetter(oCol)}${rowNumber}`, values: [[status === "Pending" ? "" : when]] });
  await call(`/spreadsheets/${id}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data: updates }),
  });
  return { sheetId: id, student, previousStatus };
}
