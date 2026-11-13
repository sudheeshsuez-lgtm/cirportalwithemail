import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, FileBadge2, MessageCircleQuestion, ShieldCheck, Camera } from "lucide-react";
import hero from "@/assets/hero-students.jpg";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/portal/BrandMark";
import { getPublicSettings } from "@/lib/portal.functions";

const settingsQuery = { queryKey: ["public-settings"], queryFn: () => getPublicSettings() };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Centre for International Relations — Student Portal" },
      {
        name: "description",
        content: "Register your interest in international programmes, track teacher approval and get help from CIR Guide.",
      },
      { property: "og:title", content: "Centre for International Relations — Student Portal" },
      {
        property: "og:description",
        content: "Register your interest, track approval and prepare your passport and photo for the final application.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
  component: Index,
});

const STEPS = [
  { icon: ClipboardList, title: "Register your interest", text: "Fill in the short Google Form with your college details." },
  { icon: ShieldCheck, title: "Teacher approval", text: "CIR teachers review every form. Your status updates here." },
  { icon: FileBadge2, title: "Keep your passport ready", text: "Once approved, prepare a clear scan of your passport front page." },
  { icon: Camera, title: "Passport-size photo", text: "A recent colour photo with a plain white background." },
];

function Index() {
  const { data } = useQuery(settingsQuery);
  const formUrl = data?.formUrl;
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden">
        <img src={hero} alt="Students exploring a world map" className="absolute inset-0 size-full object-cover" width={1600} height={1008} />
        <div className="bg-hero-overlay absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-6">
          <header className="flex items-center justify-between py-6">
            <BrandMark inverted />
            <div className="flex gap-2">
              <Button asChild variant="heroOutline" size="sm">
                <Link to="/teacher-login">Teacher sign in</Link>
              </Button>
              <Button asChild variant="gold" size="sm">
                <Link to="/auth">Student sign in</Link>
              </Button>
            </div>
          </header>
          <div className="max-w-2xl pb-28 pt-20 md:pb-36 md:pt-28 animate-rise">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">Centre for International Relations</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] text-primary-foreground md:text-6xl">
              Your path to international opportunities starts here.
            </h1>
            <p className="mt-6 max-w-xl text-base text-primary-foreground/80 md:text-lg">
              Register your interest, follow your approval and know exactly what to prepare next — with a helpful
              assistant you can type or talk to.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {formUrl ? (
                <Button asChild variant="gold" size="lg">
                  <a href={formUrl} target="_blank" rel="noreferrer">
                    Register my interest <ArrowRight />
                  </a>
                </Button>
              ) : (
                <Button asChild variant="gold" size="lg">
                  <Link to="/auth">
                    Get started <ArrowRight />
                  </Link>
                </Button>
              )}
              <Button asChild variant="heroOutline" size="lg">
                <Link to="/dashboard">Check my progress</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="gold-rule mb-4 w-14" />
            <h2 className="text-3xl font-semibold md:text-4xl">How it works</h2>
            <p className="mt-2 max-w-lg text-muted-foreground">Four clear steps from interest to final application.</p>
          </div>
        </div>
        <ol className="mt-10 grid gap-5 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border bg-card p-6 shadow-card">
              <span className="font-display text-5xl font-semibold text-gold/40">0{i + 1}</span>
              <s.icon className="mt-4 size-5 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid items-center gap-8 overflow-hidden rounded-3xl bg-navy-gradient p-8 text-primary-foreground shadow-elevated md:grid-cols-[1.4fr_1fr] md:p-12">
          <div>
            <MessageCircleQuestion className="size-7 text-gold" />
            <h2 className="mt-4 text-3xl font-semibold">Got a doubt? Just ask.</h2>
            <p className="mt-3 max-w-lg text-primary-foreground/75">
              CIR Guide answers questions about the form, approval, passports and photos. Tap the microphone to ask
              by voice and have answers read aloud.
            </p>
          </div>
          <div className="flex md:justify-end">
            <Button asChild variant="gold" size="lg">
              <Link to="/assistant">
                Ask CIR Guide <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <BrandMark />
          <p>© {new Date().getFullYear()} Centre for International Relations</p>
        </div>
      </footer>
    </div>
  );
}
