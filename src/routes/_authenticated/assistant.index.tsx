import { createFileRoute } from "@tanstack/react-router";
import { ChatWindow } from "@/components/assistant/ChatWindow";

export const Route = createFileRoute("/_authenticated/assistant/")({
  component: () => <ChatWindow key="new" threadId={null} initialMessages={[]} />,
});
