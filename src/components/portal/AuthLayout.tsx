import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import hero from "@/assets/hero-students.jpg";
import { BrandMark } from "./BrandMark";

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        <img src={hero} alt="" className="absolute inset-0 size-full object-cover" width={1600} height={1008} />
        <div className="bg-hero-overlay absolute inset-0" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/">
            <BrandMark inverted />
          </Link>
          <div className="max-w-md animate-rise">
            <div className="gold-rule mb-6 w-16" />
            <p className="font-display text-3xl leading-snug text-primary-foreground">
              “Every journey abroad begins with a single, well-prepared step.”
            </p>
            <p className="mt-4 text-sm text-primary-foreground/70">Centre for International Relations</p>
          </div>
        </div>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden">
            <Link to="/">
              <BrandMark />
            </Link>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-foreground">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>
        </div>
      </main>
    </div>
  );
}
