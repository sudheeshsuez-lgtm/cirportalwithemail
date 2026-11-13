import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { stageFor, type StudentRow } from "./progress";
import { isSheetsConnected, readResponses, SheetsNotConnectedError, writeReview } from "./sheets.server";
import { claimNotification, finishNotification, isGmailConfigured, sendStudentDecisionEmail } from "./gmail.server";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getPublicSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await publicClient().from("portal_settings").select("form_url").eq("id", 1).maybeSingle();
  return { formUrl: data?.form_url ?? null };
});

export const getMyAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: roles }, { data: request }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("teacher_requests").select("status").eq("user_id", userId).maybeSingle(),
    ]);
    const list = (roles ?? []).map((r) => r.role);
    return {
      isTeacher: list.includes("teacher"),
      teacherRequest: request?.status ?? null,
      email: (context.claims as { email?: string }).email ?? "",
    };
  });

async function assertTeacher(supabase: SupabaseClient<Database>, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "teacher" });
  if (!data) throw new Error("Only approved teachers can do this.");
}

export const getMyProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = ((context.claims as { email?: string }).email ?? "").toLowerCase();
    const { data: settings } = await context.supabase
      .from("portal_settings")
      .select("form_url, sheet_url")
      .eq("id", 1)
      .maybeSingle();
    const formUrl = settings?.form_url ?? null;
    if (!isSheetsConnected() || !settings?.sheet_url) {
      return { ready: false as const, formUrl, email };
    }
    try {
      const sheet = await readResponses(settings.sheet_url);
      const row: StudentRow | null = sheet?.rows.filter((r) => r.email === email).at(-1) ?? null;
      return { ready: true as const, formUrl, email, row, info: stageFor(row) };
    } catch (e) {
      console.error(e);
      return { ready: false as const, formUrl, email, error: "We couldn't read the responses sheet right now." };
    }
  });

export const listResponses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertTeacher(context.supabase, context.userId);
    const { data: settings } = await context.supabase
      .from("portal_settings")
      .select("form_url, sheet_url")
      .eq("id", 1)
      .maybeSingle();
    const base = { formUrl: settings?.form_url ?? null, sheetUrl: settings?.sheet_url ?? null };
    if (!isSheetsConnected()) return { ...base, state: "not_connected" as const, rows: [] as StudentRow[] };
    if (!settings?.sheet_url) return { ...base, state: "no_sheet" as const, rows: [] as StudentRow[] };
    try {
      const sheet = await readResponses(settings.sheet_url);
      return { ...base, state: "ok" as const, rows: sheet?.rows ?? [] };
    } catch (e) {
      if (e instanceof SheetsNotConnectedError) return { ...base, state: "not_connected" as const, rows: [] };
      return { ...base, state: "error" as const, error: (e as Error).message, rows: [] as StudentRow[] };
    }
  });

export const reviewResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({ rowNumber: z.number().int().min(2).max(100000), decision: z.enum(["Approved", "Rejected", "Pending"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTeacher(context.supabase, context.userId);
    const { data: settings } = await context.supabase.from("portal_settings").select("sheet_url").eq("id", 1).maybeSingle();
    if (!settings?.sheet_url) throw new Error("Add the Google Sheet link in Settings first.");
    const reviewer = (context.claims as { email?: string }).email ?? "Teacher";
    const result = await writeReview(settings.sheet_url, data.rowNumber, data.decision, reviewer);
    if (data.decision === "Pending" || result.previousStatus === data.decision) {
      return { ok: true, emailSent: false, emailMessage: null };
    }
    if (!isGmailConfigured()) {
      return { ok: true, emailSent: false, emailMessage: "Decision saved, but Gmail notifications are not configured." };
    }
    if (!result.student.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.student.email)) {
      return { ok: true, emailSent: false, emailMessage: "Decision saved, but the student's Gmail address is missing or invalid in the response sheet." };
    }
    let notificationId: string | null = null;
    try {
      notificationId = await claimNotification({ sheetId: result.sheetId, rowNumber: data.rowNumber, decision: data.decision });
      if (!notificationId) return { ok: true, emailSent: false, emailMessage: "A notification for this decision was already sent or is currently being processed." };
      await sendStudentDecisionEmail({ to: result.student.email, studentName: result.student.name, decision: data.decision });
      await finishNotification(notificationId, "sent");
      return { ok: true, emailSent: true, emailMessage: `Notification sent to ${result.student.email}.` };
    } catch (error) {
      if (notificationId) {
        try { await finishNotification(notificationId, "failed", (error as Error).message); } catch (trackingError) { console.error("Could not update notification log", trackingError); }
      }
      console.error("Student decision email failed", error);
      return { ok: true, emailSent: false, emailMessage: `Decision saved, but the email could not be sent: ${(error as Error).message}` };
    }
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        formUrl: z.string().trim().max(500).url().or(z.literal("")),
        sheetUrl: z
          .string()
          .trim()
          .max(500)
          .refine((v) => v === "" || /docs\.google\.com\/spreadsheets\/d\//.test(v), "Paste a Google Sheets link"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTeacher(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("portal_settings")
      .update({ form_url: data.formUrl || null, sheet_url: data.sheetUrl || null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTeacherRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertTeacher(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("teacher_requests")
      .select("user_id, email, full_name, status, created_at, reviewed_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const reviewTeacherRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ userId: z.string().uuid(), status: z.enum(["approved", "rejected"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertTeacher(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You can't change your own access.");
    const { data: updated, error } = await context.supabase
      .from("teacher_requests")
      .update({ status: data.status })
      .eq("user_id", data.userId)
      .select("user_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Teacher access request not found.");
    return { ok: true };
  });
