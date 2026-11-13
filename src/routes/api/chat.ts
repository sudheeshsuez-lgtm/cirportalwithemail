import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { ASSISTANT_INSTRUCTIONS } from "@/lib/assistant-prompt";

const Body = z.object({ threadId: z.string().uuid(), text: z.string().trim().min(1).max(4000) });

function userClient(token: string) {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        const supabase = userClient(token);
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });
        const { threadId, text } = parsed.data;

        const { data: thread } = await supabase
          .from("chat_threads")
          .select("id, title")
          .eq("id", threadId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!thread) return new Response("Conversation not found", { status: 404 });

        const { error: insErr } = await supabase
          .from("chat_messages")
          .insert({ thread_id: threadId, user_id: userId, role: "user", content: text });
        if (insErr) {
          console.error("Saving user message failed", insErr);
          return new Response("Could not save your message", { status: 500 });
        }
        if (thread.title === "New conversation") {
          await supabase
            .from("chat_threads")
            .update({ title: text.slice(0, 60), updated_at: new Date().toISOString() })
            .eq("id", threadId);
        } else {
          await supabase.from("chat_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
        }

        const { data: history } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true })
          .limit(60);

        const { streamResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
        const encoder = new TextEncoder();

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let full = "";
            try {
              const events = await streamResponse(
                {
                  model: "openai/gpt-6-astra",
                  instructions: ASSISTANT_INSTRUCTIONS,
                  input: (history ?? []).map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                  })),
                },
                { signal: request.signal },
              );
              for await (const ev of events) {
                if (ev.type === "response.output_text.delta") {
                  full += ev.delta;
                  controller.enqueue(encoder.encode(ev.delta));
                }
              }
            } catch (e) {
              console.error("Assistant stream failed", e);
              const msg =
                e instanceof GatewayError && e.httpStatus === 402
                  ? "\n\n_The assistant is out of AI credits right now. Please try again later._"
                  : "\n\n_Sorry — I couldn't finish that answer. Please try again._";
              if (!full) full = msg.trim();
              controller.enqueue(encoder.encode(msg));
            }
            if (full.trim()) {
              const { error } = await supabase
                .from("chat_messages")
                .insert({ thread_id: threadId, user_id: userId, role: "assistant", content: full });
              if (error) console.error("Saving assistant message failed", error);
            }
            controller.close();
          },
        });

        return new Response(stream, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" },
        });
      },
    },
  },
});
