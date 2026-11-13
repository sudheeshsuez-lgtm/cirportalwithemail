import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "@/hooks/use-account";
import { GraduationCap, LayoutDashboard, LogOut, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark } from "@/components/portal/BrandMark";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: location.pathname.startsWith("/teacher") ? "/teacher-login" : "/auth" });
    }
    return { user: data.user };
  },
  component: PortalShell,
});

function PortalShell() {
  const { user } = Route.useRouteContext();
  const account = useAccount();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isTeacher = account.data?.isTeacher ?? false;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: isTeacher ? "/teacher-login" : "/auth", replace: true });
  }

  const nav = [
    ...(isTeacher
      ? [{ to: "/teacher" as const, label: "Teacher dashboard", icon: ShieldCheck }]
      : [{ to: "/dashboard" as const, label: "My progress", icon: LayoutDashboard }]),
    { to: "/assistant" as const, label: "Ask CIR Guide", icon: MessageCircleQuestion },
  ];

  const name = (user.user_metadata?.["full_name"] as string | undefined) || user.email || "";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex">
        <div className="px-2 py-3">
          <BrandMark inverted />
        </div>
        <div className="my-4 h-px bg-sidebar-border" />
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">
          Workspace
        </p>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
          {!isTeacher && account.data?.teacherRequest === "pending" && (
            <Link
              to="/teacher"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
            >
              <GraduationCap className="size-4" /> Teacher access
            </Link>
          )}
        </nav>
        <div className="mt-auto space-y-3">
          <div className="rounded-lg bg-sidebar-accent/60 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-sidebar-accent-foreground">{name}</p>
            <p className="text-xs text-sidebar-foreground/60">{isTeacher ? "Teacher" : "Student"}</p>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2.5 text-sm hover:bg-sidebar-accent"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
          <BrandMark inverted />
          <button onClick={signOut} aria-label="Sign out" className="rounded-md p-2 hover:bg-sidebar-accent">
            <LogOut className="size-4" />
          </button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn("flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground")}
              activeProps={{ className: "bg-secondary text-foreground font-medium" }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
