import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "Ask CIR Guide — CIR Portal" },
      { name: "description", content: "Clear your doubts about the international programme by typing or speaking to CIR Guide." },
      { property: "og:title", content: "Ask CIR Guide — CIR Portal" },
      { property: "og:description", content: "An AI helper for the Centre for International Relations process." },
    ],
  }),
  component: AssistantLayout,
});

function AssistantLayout() {
  const params = useParams({ strict: false }) as { threadId?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const threads = useQuery({
    queryKey: ["threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  async function remove(id: string) {
    const { error } = await supabase.from("chat_threads").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't delete that conversation.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["threads"] });
    if (params.threadId === id) navigate({ to: "/assistant" });
  }

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-0 flex-1 max-md:h-[calc(100vh-106px)]">
      <aside className="hidden w-72 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="p-4">
          <Button asChild className="w-full justify-start" variant="outline">
            <Link to="/assistant">
              <MessageSquarePlus /> New conversation
            </Link>
          </Button>
        </div>
        <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Your conversations
        </p>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {threads.data?.length === 0 && <p className="px-3 text-sm text-muted-foreground">No conversations yet.</p>}
          {threads.data?.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg pr-1 hover:bg-muted",
                params.threadId === t.id && "bg-secondary",
              )}
            >
              <Link
                to="/assistant/$threadId"
                params={{ threadId: t.id }}
                className="min-w-0 flex-1 truncate px-3 py-2 text-sm"
              >
                {t.title}
              </Link>
              <button
                aria-label="Delete conversation"
                onClick={() => void remove(t.id)}
                className="rounded p-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b bg-card px-4 py-2 lg:hidden">
          <select
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
            value={params.threadId ?? ""}
            onChange={(e) =>
              e.target.value
                ? navigate({ to: "/assistant/$threadId", params: { threadId: e.target.value } })
                : navigate({ to: "/assistant" })
            }
            aria-label="Choose conversation"
          >
            <option value="">New conversation</option>
            {threads.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <Button asChild size="icon-sm" variant="outline" aria-label="New conversation">
            <Link to="/assistant">
              <MessageSquarePlus />
            </Link>
          </Button>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
