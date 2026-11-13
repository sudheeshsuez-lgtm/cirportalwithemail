import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Camera, Check, ClipboardList, ExternalLink, FileBadge2, Hourglass, MessageCircleQuestion, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/portal/PageHeader";
import { getMyProgress } from "@/lib/portal.functions";
import { PROGRESS_STEPS, statusLabel, type StageInfo } from "@/lib/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "My progress — CIR Portal" },
      { name: "description", content: "Track your interest status and next steps with the Centre for International Relations." },
      { property: "og:title", content: "My progress — CIR Portal" },
      { property: "og:description", content: "See whether your interest is approved and what to prepare next." },
    ],
  }),
  component: StudentDashboard,
});

function StudentDashboard() {
  const fetchProgress = useServerFn(getMyProgress);
  const q = useQuery({ queryKey: ["my-progress"], queryFn: () => fetchProgress() });

  return (
    <div>
      <PageHeader title="My progress" subtitle="Your international programme journey, step by step." />
      <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
        {q.isLoading && <Skeleton className="h-56 w-full rounded-2xl" />}
        {q.error && <p className="text-sm text-destructive">Could not load your progress. Please refresh.</p>}
        {q.data && !q.data.ready && (
          <section className="rounded-2xl border bg-card p-8 shadow-card">
            <Hourglass className="size-6 text-gold" />
            <h2 className="mt-4 text-xl font-semibold">Progress tracking is being set up</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {q.data.error ??
                "The CIR team hasn't linked the interest responses yet. You can still fill in the interest form now — your status will appear here once it's connected."}
            </p>
            {q.data.formUrl && <FormButton url={q.data.formUrl} />}
          </section>
        )}
        {q.data?.ready && (
          <>
            <StageCard info={q.data.info} formUrl={q.data.formUrl} />
            <Stepper current={q.data.info.step} stage={q.data.info.stage} />
            {q.data.row && (
              <section className="rounded-2xl border bg-card p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Your interest form</h3>
                  <Badge variant={q.data.row.status}>{statusLabel(q.data.row.status)}</Badge>
                </div>
                <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  {[
                    ["Name", q.data.row.name],
                    ["Roll number", q.data.row.roll],
                    ["Department", q.data.row.department],
                    ["College", q.data.row.college],
                    ["Submitted", q.data.row.submittedAt],
                    ["Reviewed on", q.data.row.reviewedOn || "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-dashed pb-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-right font-medium">{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </>
        )}
        <Link
          to="/assistant"
          className="flex items-center justify-between rounded-2xl border bg-navy-gradient p-6 text-primary-foreground shadow-elevated transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-center gap-4">
            <MessageCircleQuestion className="size-6 text-gold" />
            <div>
              <p className="font-semibold">Have a doubt?</p>
              <p className="text-sm text-primary-foreground/70">Ask CIR Guide — type or speak your question.</p>
            </div>
          </div>
          <ArrowRight className="size-5" />
        </Link>
      </div>
    </div>
  );
}

function FormButton({ url }: { url: string }) {
  return (
    <Button asChild variant="gold" className="mt-6">
      <a href={url} target="_blank" rel="noreferrer">
        <ClipboardList /> Fill the interest form <ExternalLink />
      </a>
    </Button>
  );
}

function StageCard({ info, formUrl }: { info: StageInfo; formUrl: string | null }) {
  const tone =
    info.stage === "approved"
      ? "border-success/40 bg-success-soft"
      : info.stage === "rejected"
        ? "border-destructive/30 bg-destructive-soft"
        : info.stage === "pending"
          ? "border-warning/40 bg-warning-soft"
          : "border-gold/40 bg-gold-soft";
  const Icon = info.stage === "approved" ? Check : info.stage === "rejected" ? XCircle : info.stage === "pending" ? Hourglass : ClipboardList;
  return (
    <section className={cn("rounded-2xl border p-6 shadow-card md:p-8", tone)} aria-live="polite">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-card shadow-card">
          <Icon className="size-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Next step</p>
          <h2 className="mt-1 text-2xl font-semibold">{info.title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-foreground/80">{info.message}</p>
          {info.stage === "not_submitted" && formUrl && <FormButton url={formUrl} />}
        </div>
      </div>
      {info.nextDocuments.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {info.nextDocuments.map((d, i) => {
            const DocIcon = i === 0 ? FileBadge2 : Camera;
            return (
              <div key={d.name} className="rounded-xl border bg-card p-5">
                <DocIcon className="size-5 text-gold" />
                <p className="mt-3 font-semibold">{d.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{d.detail}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Stepper({ current, stage }: { current: number; stage: StageInfo["stage"] }) {
  return (
    <ol className="grid gap-3 rounded-2xl border bg-card p-6 shadow-card sm:grid-cols-4">
      {PROGRESS_STEPS.map((label, i) => {
        const done = stage !== "not_submitted" && (i < current || (stage === "approved" && i <= 2));
        const active = i === current && stage !== "rejected";
        const failed = stage === "rejected" && i === 1;
        return (
          <li key={label} className="flex items-center gap-3 sm:flex-col sm:items-start">
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                done && "border-success bg-success text-primary-foreground",
                active && !done && "border-gold bg-gold-soft text-gold-foreground",
                failed && "border-destructive bg-destructive-soft text-destructive",
              )}
            >
              {done ? <Check className="size-4" /> : failed ? <XCircle className="size-4" /> : i + 1}
            </span>
            <span className={cn("text-sm", active || done ? "font-semibold" : "text-muted-foreground")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
