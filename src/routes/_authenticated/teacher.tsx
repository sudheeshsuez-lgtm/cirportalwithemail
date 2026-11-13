import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ExternalLink, Hourglass, Link2, RefreshCw, Search, Sheet, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet as Drawer, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/portal/PageHeader";
import {
  listResponses,
  listTeacherRequests,
  reviewResponse,
  reviewTeacherRequest,
  updateSettings,
} from "@/lib/portal.functions";
import { statusLabel, type ReviewStatus, type StudentRow } from "@/lib/progress";
import { useAccount } from "@/hooks/use-account";

export const Route = createFileRoute("/_authenticated/teacher")({
  head: () => ({
    meta: [
      { title: "Teacher dashboard — CIR Portal" },
      { name: "description", content: "Review and approve student expressions of interest for international programmes." },
      { property: "og:title", content: "Teacher dashboard — CIR Portal" },
      { property: "og:description", content: "Approve student interest and manage the CIR Google Form." },
    ],
  }),
  component: TeacherPage,
});

function TeacherPage() {
  const account = useAccount();
  const qc = useQueryClient();

  if (account.isLoading) return <div className="p-10"><Skeleton className="h-40 w-full" /></div>;
  if (!account.data?.isTeacher) {
    return (
      <div>
        <PageHeader title="Teacher access" />
        <div className="mx-auto max-w-xl p-10">
          <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
            <Hourglass className="mx-auto size-8 text-gold" />
            {account.data?.teacherRequest === "pending" ? (
              <>
                <h2 className="mt-4 text-xl font-semibold">Waiting for approval</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your request for teacher access has been sent. An existing CIR teacher needs to approve it — you'll
                  get the teacher dashboard as soon as they do.
                </p>
              </>
            ) : account.data?.teacherRequest === "rejected" ? (
              <>
                <h2 className="mt-4 text-xl font-semibold">Request declined</h2>
                <p className="mt-2 text-sm text-muted-foreground">Please contact the CIR office if you think this is a mistake.</p>
              </>
            ) : (
              <>
                <h2 className="mt-4 text-xl font-semibold">This account isn't a teacher yet</h2>
                <p className="mt-2 text-sm text-muted-foreground">Ask for teacher access and an existing teacher will review it.</p>
                <Button
                  className="mt-6"
                  onClick={async () => {
                    const { error } = await supabase.rpc("request_teacher_access", {});
                    if (error) toast.error(error.message);
                    else qc.invalidateQueries({ queryKey: ["account"] });
                  }}
                >
                  Request teacher access
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
  return <TeacherDashboard />;
}

function TeacherDashboard() {
  const fetchRows = useServerFn(listResponses);
  const rows = useQuery({ queryKey: ["responses"], queryFn: () => fetchRows(), staleTime: 30_000 });
  const data = rows.data;
  const counts = useMemo(() => {
    const r = data?.rows ?? [];
    return {
      total: r.length,
      pending: r.filter((x) => x.status === "pending").length,
      approved: r.filter((x) => x.status === "approved").length,
      rejected: r.filter((x) => x.status === "rejected").length,
    };
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Teacher dashboard"
        subtitle="Approve student interest — decisions are saved straight into the Google Sheet."
        actions={
          <div className="flex gap-2">
            {data?.sheetUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={data.sheetUrl} target="_blank" rel="noreferrer">
                  <Sheet /> Open sheet
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => rows.refetch()} disabled={rows.isFetching}>
              <RefreshCw className={rows.isFetching ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>
        }
      />
      <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-10">
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            ["Total interest", counts.total, "default"],
            ["Waiting for review", counts.pending, "pending"],
            ["Approved", counts.approved, "approved"],
            ["Not approved", counts.rejected, "rejected"],
          ].map(([label, n, v]) => (
            <div key={label as string} className="rounded-2xl border bg-card p-5 shadow-card">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 font-display text-3xl font-semibold">{rows.isLoading ? "–" : (n as number)}</p>
              {v !== "default" && <div className="gold-rule mt-3 w-10" />}
            </div>
          ))}
        </div>

        <Tabs defaultValue="students">
          <TabsList>
            <TabsTrigger value="students">Student interest</TabsTrigger>
            <TabsTrigger value="teachers">Teacher access</TabsTrigger>
            <TabsTrigger value="settings">Google Form & Sheet</TabsTrigger>
          </TabsList>
          <TabsContent value="students" className="mt-4">
            {rows.isLoading ? (
              <Skeleton className="h-64 w-full rounded-2xl" />
            ) : data?.state === "ok" ? (
              <StudentsTable rows={data.rows} />
            ) : (
              <SetupNotice state={data?.state ?? "error"} error={data && "error" in data ? data.error : undefined} />
            )}
          </TabsContent>
          <TabsContent value="teachers" className="mt-4">
            <TeacherRequests />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <SettingsPanel formUrl={data?.formUrl ?? ""} sheetUrl={data?.sheetUrl ?? ""} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SetupNotice({ state, error }: { state: string; error?: string | undefined }) {
  const text =
    state === "not_connected"
      ? "The Google account that owns the responses sheet hasn't been connected to this website yet. Once it's connected, every Google Form response will appear here."
      : state === "no_sheet"
        ? "Paste the link to the Google Sheet that collects your Google Form responses in the “Google Form & Sheet” tab."
        : `We couldn't read the sheet. ${error ?? ""}`;
  return (
    <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
      <Link2 className="mx-auto size-7 text-gold" />
      <h3 className="mt-3 text-lg font-semibold">Connect your responses sheet</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function StudentsTable({ rows }: { rows: StudentRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ReviewStatus>("pending");
  const [open, setOpen] = useState<StudentRow | null>(null);
  const qc = useQueryClient();
  const review = useServerFn(reviewResponse);
  const mutation = useMutation({
    mutationFn: (v: { rowNumber: number; decision: "Approved" | "Rejected" | "Pending" }) => review({ data: v }),
    onSuccess: (result, v) => {
      toast.success(v.decision === "Approved" ? "Application approved." : v.decision === "Rejected" ? "Application marked as not approved." : "Moved back to pending.");
      if (result.emailMessage) {
        if (result.emailSent) toast.success(result.emailMessage);
        else toast.warning(result.emailMessage);
      }
      qc.invalidateQueries({ queryKey: ["responses"] });
      setOpen(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const visible = rows
    .filter((r) => filter === "all" || r.status === filter)
    .filter((r) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [r.name, r.roll, r.department, r.college, r.email].some((v) => v.toLowerCase().includes(q));
    })
    .slice()
    .reverse();

  const Actions = ({ r }: { r: StudentRow }) => (
    <div className="flex justify-end gap-2">
      {r.status !== "approved" && (
        <Button size="sm" variant="success" disabled={mutation.isPending} onClick={() => mutation.mutate({ rowNumber: r.rowNumber, decision: "Approved" })}>
          <Check /> Approve
        </Button>
      )}
      {r.status !== "rejected" && (
        <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ rowNumber: r.rowNumber, decision: "Rejected" })}>
          <X /> Decline
        </Button>
      )}
      {r.status !== "pending" && (
        <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate({ rowNumber: r.rowNumber, decision: "Pending" })}>
          Undo
        </Button>
      )}
    </div>
  );

  return (
    <div className="rounded-2xl border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, roll number, department…" className="pl-9" />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === f ? "bg-card shadow-sm" : "text-muted-foreground"}`}
            >
              {f === "all" ? "All" : statusLabel(f)}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 size-6" /> No students here yet.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead className="hidden md:table-cell">Roll no.</TableHead>
              <TableHead className="hidden lg:table-cell">Department · College</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.rowNumber}>
                <TableCell>
                  <button className="text-left" onClick={() => setOpen(r)}>
                    <span className="font-medium underline-offset-4 hover:underline">{r.name || "(no name)"}</span>
                    <span className="block text-xs text-muted-foreground">{r.email}</span>
                  </button>
                </TableCell>
                <TableCell className="hidden md:table-cell">{r.roll}</TableCell>
                <TableCell className="hidden text-sm lg:table-cell">
                  {r.department}
                  <span className="block text-xs text-muted-foreground">{r.college}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={r.status}>{statusLabel(r.status)}</Badge>
                </TableCell>
                <TableCell>
                  <Actions r={r} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-2xl">{open.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-2 px-4">
                <Badge variant={open.status}>{statusLabel(open.status)}</Badge>
                {open.reviewedBy && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    By {open.reviewedBy} · {open.reviewedOn}
                  </p>
                )}
                <dl className="mt-6 space-y-3 text-sm">
                  {open.answers.map((a) => (
                    <div key={a.question} className="border-b pb-2">
                      <dt className="text-xs text-muted-foreground">{a.question}</dt>
                      <dd className="mt-0.5 font-medium">{a.answer || "—"}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-6 pb-6">
                  <Actions r={open} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Drawer>
    </div>
  );
}

function TeacherRequests() {
  const fetchReqs = useServerFn(listTeacherRequests);
  const review = useServerFn(reviewTeacherRequest);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["teacher-requests"], queryFn: () => fetchReqs() });
  const m = useMutation({
    mutationFn: (v: { userId: string; status: "approved" | "rejected" }) => review({ data: v }),
    onSuccess: () => {
      toast.success("Updated teacher access");
      qc.invalidateQueries({ queryKey: ["teacher-requests"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (q.isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const list = q.data ?? [];
  return (
    <div className="rounded-2xl border bg-card shadow-card">
      {list.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No teacher requests yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Teacher</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={r.user_id}>
                <TableCell>
                  <span className="font-medium">{r.full_name || r.email}</span>
                  <span className="block text-xs text-muted-foreground">{r.email}</span>
                </TableCell>
                <TableCell className="text-sm">
                  {new Date(r.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                </TableCell>
                <TableCell>
                  <Badge variant={r.status as ReviewStatus}>{r.status === "rejected" ? "Declined" : r.status === "approved" ? "Approved" : "Pending"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {r.status !== "approved" && (
                      <Button size="sm" variant="success" onClick={() => m.mutate({ userId: r.user_id, status: "approved" })}>
                        Approve
                      </Button>
                    )}
                    {r.status !== "rejected" && (
                      <Button size="sm" variant="outline" onClick={() => m.mutate({ userId: r.user_id, status: "rejected" })}>
                        {r.status === "approved" ? "Remove" : "Decline"}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

const FORM_FIELDS = [
  "Full Name",
  "Department",
  "Roll Number",
  "Place / City",
  "College Name",
  "Mobile Number",
  "Date of Birth",
];

function SettingsPanel({ formUrl, sheetUrl }: { formUrl: string; sheetUrl: string }) {
  const [form, setForm] = useState(formUrl);
  const [sheet, setSheet] = useState(sheetUrl);
  useEffect(() => {
    setForm(formUrl);
    setSheet(sheetUrl);
  }, [formUrl, sheetUrl]);
  const save = useServerFn(updateSettings);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => save({ data: { formUrl: form.trim(), sheetUrl: sheet.trim() } }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <form
        className="space-y-5 rounded-2xl border bg-card p-6 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="formUrl">Google Form link (shared with students)</Label>
          <Input id="formUrl" value={form} onChange={(e) => setForm(e.target.value)} placeholder="https://forms.gle/…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sheetUrl">Responses Google Sheet link</Label>
          <Input id="sheetUrl" value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
          <p className="text-xs text-muted-foreground">
            Approvals are written into an “Approval Status” column in this sheet, so you can download it as Excel any time.
          </p>
        </div>
        <Button type="submit" disabled={m.isPending}>
          {m.isPending ? "Saving…" : "Save links"}
        </Button>
        {form && (
          <a href={form} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Preview form <ExternalLink className="size-3" />
          </a>
        )}
      </form>
      <div className="rounded-2xl border bg-gold-soft p-6">
        <h3 className="text-lg font-semibold">Setting up the Google Form</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-foreground/80">
          <li>
            Create a form titled “International Relations – Student Expression of Interest” and turn on{" "}
            <strong>Settings → Collect email addresses → Verified</strong>.
          </li>
          <li>
            Add these questions: <span className="font-medium">{FORM_FIELDS.join(", ")}</span>.
          </li>
          <li>
            Open <strong>Responses → Link to Sheets</strong> to create the responses spreadsheet.
          </li>
          <li>Paste the form link and the sheet link here and save.</li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Students must sign in to this website with the same email they used on the form to see their progress.
        </p>
      </div>
    </div>
  );
}
