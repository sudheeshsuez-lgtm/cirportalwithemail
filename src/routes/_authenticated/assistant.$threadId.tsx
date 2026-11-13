import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatWindow, type ChatMsg } from "@/components/assistant/ChatWindow";

export const Route = createFileRoute("/_authenticated/assistant/$threadId")({
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const q = useQuery({
    queryKey: ["thread-messages", threadId],
    queryFn: async () => {
      const { data: thread } = await supabase.from("chat_threads").select("id").eq("id", threadId).maybeSingle();
      if (!thread) return null;
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMsg[];
    },
  });

  if (q.isLoading) return <div className="mx-auto w-full max-w-3xl space-y-4 p-8"><Skeleton className="h-16" /><Skeleton className="h-24" /></div>;
  if (q.data === null)
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        This conversation doesn't exist. <Link to="/assistant" className="text-primary underline">Start a new one</Link>
      </div>
    );
  return <ChatWindow key={threadId} threadId={threadId} initialMessages={q.data ?? []} />;
}
