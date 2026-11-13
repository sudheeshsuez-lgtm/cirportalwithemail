// Pure helpers shared by server and browser: reading Google Form response rows
// and turning a teacher's decision into a student-facing stage + next step.

export type ReviewStatus = "pending" | "approved" | "rejected";

export const STATUS_HEADER = "Approval Status";
export const REVIEWED_BY_HEADER = "Reviewed By";
export const REVIEWED_ON_HEADER = "Reviewed On";

export type FieldKey =
  | "timestamp"
  | "name"
  | "email"
  | "roll"
  | "department"
  | "college"
  | "place"
  | "mobile"
  | "dob";

const FIELD_PATTERNS: Record<FieldKey, RegExp> = {
  timestamp: /time\s*stamp/i,
  email: /e-?mail|gmail/i,
  roll: /roll|register\s*(no|number)|reg\.?\s*no/i,
  name: /name/i,
  department: /depart|dept|course|branch/i,
  college: /college|institut/i,
  place: /place|city|town/i,
  mobile: /mobile|phone|contact\s*(no|number)|whatsapp/i,
  dob: /birth|dob/i,
};

export type ColumnMap = Partial<Record<FieldKey, number>> & {
  status?: number;
  reviewedBy?: number;
  reviewedOn?: number;
};

export function mapColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const norm = headers.map((h) => (h ?? "").trim());
  norm.forEach((h, i) => {
    if (h.toLowerCase() === STATUS_HEADER.toLowerCase()) map.status = i;
    else if (h.toLowerCase() === REVIEWED_BY_HEADER.toLowerCase()) map.reviewedBy = i;
    else if (h.toLowerCase() === REVIEWED_ON_HEADER.toLowerCase()) map.reviewedOn = i;
  });
  // Order matters: "College Name" should map to college, not name.
  const order: FieldKey[] = ["timestamp", "email", "roll", "college", "department", "place", "mobile", "dob", "name"];
  for (const key of order) {
    const idx = norm.findIndex(
      (h, i) =>
        FIELD_PATTERNS[key].test(h) &&
        i !== map.status &&
        i !== map.reviewedBy &&
        i !== map.reviewedOn &&
        !Object.values(map).includes(i),
    );
    if (idx >= 0) map[key] = idx;
  }
  return map;
}

export function parseStatus(value: string | undefined): ReviewStatus {
  const v = (value ?? "").trim().toLowerCase();
  if (v.startsWith("approv")) return "approved";
  if (v.startsWith("reject")) return "rejected";
  return "pending";
}

export function statusLabel(s: ReviewStatus): string {
  return s === "approved" ? "Approved" : s === "rejected" ? "Not approved" : "Pending review";
}

/** 0-based column index -> spreadsheet letters (0 -> A, 26 -> AA). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Extracts the spreadsheet ID from a Google Sheets URL (or returns a bare ID). */
export function spreadsheetIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m?.[1]) return m[1];
  if (/^[a-zA-Z0-9-_]{25,}$/.test(url.trim())) return url.trim();
  return null;
}

export type StudentRow = {
  rowNumber: number; // 1-based sheet row
  name: string;
  email: string;
  roll: string;
  department: string;
  college: string;
  place: string;
  mobile: string;
  dob: string;
  submittedAt: string;
  status: ReviewStatus;
  reviewedBy: string;
  reviewedOn: string;
  answers: { question: string; answer: string }[];
};

export function parseRows(values: string[][]): { headers: string[]; map: ColumnMap; rows: StudentRow[] } {
  const headers = (values[0] ?? []).map((h) => String(h ?? ""));
  const map = mapColumns(headers);
  const get = (row: string[], i?: number) => (i === undefined ? "" : String(row[i] ?? "").trim());
  const rows: StudentRow[] = [];
  values.slice(1).forEach((row, idx) => {
    if (!row || row.every((c) => String(c ?? "").trim() === "")) return;
    const skip = new Set([map.status, map.reviewedBy, map.reviewedOn]);
    rows.push({
      rowNumber: idx + 2,
      name: get(row, map.name),
      email: get(row, map.email).toLowerCase(),
      roll: get(row, map.roll),
      department: get(row, map.department),
      college: get(row, map.college),
      place: get(row, map.place),
      mobile: get(row, map.mobile),
      dob: get(row, map.dob),
      submittedAt: get(row, map.timestamp),
      status: parseStatus(get(row, map.status)),
      reviewedBy: get(row, map.reviewedBy),
      reviewedOn: get(row, map.reviewedOn),
      answers: headers
        .map((q, i) => ({ q, i }))
        .filter(({ q, i }) => q && !skip.has(i))
        .map(({ q, i }) => ({ question: q, answer: get(row, i) })),
    });
  });
  return { headers, map, rows };
}

export type Stage = "not_submitted" | "pending" | "approved" | "rejected";

export type StageInfo = {
  stage: Stage;
  step: number; // index in PROGRESS_STEPS that is current
  title: string;
  message: string;
  nextDocuments: { name: string; detail: string }[];
};

export const PROGRESS_STEPS = [
  "Interest form submitted",
  "Teacher review",
  "Approved",
  "Passport & photo",
] as const;

export const NEXT_DOCUMENTS = [
  { name: "Passport", detail: "A clear scan of the passport front (photo) page — PDF, JPG or PNG." },
  { name: "Passport-size photo", detail: "A recent colour photograph with a plain white background — JPG or PNG." },
];

export function stageFor(row: Pick<StudentRow, "status"> | null): StageInfo {
  if (!row) {
    return {
      stage: "not_submitted",
      step: 0,
      title: "Register your interest",
      message:
        "We haven't received your interest form yet. Fill in the Google Form using the same email you signed in with, then come back here to track your progress.",
      nextDocuments: [],
    };
  }
  if (row.status === "approved") {
    return {
      stage: "approved",
      step: 3,
      title: "Approved — next, get your passport and photo ready",
      message:
        "A teacher has approved your interest. Your next step is to keep your passport and a recent passport-size photograph ready for the final application.",
      nextDocuments: NEXT_DOCUMENTS,
    };
  }
  if (row.status === "rejected") {
    return {
      stage: "rejected",
      step: 1,
      title: "Not approved this time",
      message:
        "Your interest was reviewed but not approved for this round. Please contact the Centre for International Relations if you have questions.",
      nextDocuments: [],
    };
  }
  return {
    stage: "pending",
    step: 1,
    title: "Waiting for teacher approval",
    message:
      "Your interest form has been received. A teacher will review it soon — you'll see the next step here as soon as it's approved.",
    nextDocuments: [],
  };
}
