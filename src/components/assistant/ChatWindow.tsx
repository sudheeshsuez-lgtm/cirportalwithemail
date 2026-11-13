import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatStatus } from "ai";
import { Copy, Loader2, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import emblem from "@/assets/guide-emblem.png";
import { supabase } from "@/integrations/supabase/client";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Switch } from "@/components/ui/switch";
import { MicButton } from "./MicButton";
import { useSpeaker } from "./useSpeaker";

export type ChatMsg = { id: string; role: "user" | "assistant"; content: string };

// First message typed on the "new conversation" page, handed to the new thread page.
const pendingFirstMessage = new Map<string, string>();

const SUGGESTIONS = [
  "What documents do I need after approval?",
  "How do I apply for a passport?",
  "What size should my passport photo be?",
  "How will I know if my interest is approved?",
];

const AUTO_READ_KEY = "cir-auto-read";

export function ChatWindow({ threadId, initialMessages }: { threadId: string | null; initialMessages: ChatMsg[] }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [autoRead, setAutoRead] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const speaker = useSpeaker();
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    setAutoRead(window.localStorage.getItem(AUTO_READ_KEY) === "1");
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!threadId) return;
    const pending = pendingFirstMessage.get(threadId);
    if (pending) {
      pendingFirstMessage.delete(threadId);
      void send(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    if (!threadId) {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ user_id: auth.user.id })
        .select("id")
        .single();
      if (error || !data) {
        toast.error("Couldn't start a conversation. Please try again.");
        return;
      }
      pendingFirstMessage.set(data.id, trimmed);
      setInput("");
      qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/assistant/$threadId", params: { threadId: data.id } });
      return;
    }

    setInput("");
    speaker.stop();
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, userMsg]);
    setStatus("submitted");

    const controller = new AbortController();
    abortRef.current = controller;
    let full = "";
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${sess.session?.access_token ?? ""}` },
        body: JSON.stringify({ threadId, text: trimmed }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setStatus("streaming");
        setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: full } : x)));
      }
      setStatus("ready");
      if (autoRead && full.trim()) void speaker.play(assistantId, full);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStatus("ready");
      } else {
        console.error(e);
        setStatus("error");
        setMessages((m) => m.filter((x) => x.id !== assistantId || x.content));
        toast.error("The assistant couldn't answer just now. Please try again.");
        setInput(trimmed);
      }
    } finally {
      abortRef.current = null;
      qc.invalidateQueries({ queryKey: ["threads"] });
      textareaRef.current?.focus();
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="min-h-0">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-8">
          {messages.length === 0 && (
            <div className="flex flex-col items-center py-10 text-center animate-rise">
              <img src={emblem} alt="CIR Guide" width={816} height={816} className="size-20" />
              <h2 className="mt-4 text-2xl font-semibold">Ask CIR Guide</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Type or tap the microphone to ask anything about the international programme — the form, approval,
                passport, photos and next steps.
              </p>
              <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-xl border bg-card px-4 py-3 text-left text-sm shadow-card transition-colors hover:border-gold"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} from={m.role}>
              {m.role === "assistant" ? (
                <div className="flex gap-3">
                  <img src={emblem} alt="" width={816} height={816} className="mt-0.5 size-7 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <MessageContent>
                      <MessageResponse>{m.content}</MessageResponse>
                    </MessageContent>
                    {m.content && !(busy && m.id === messages.at(-1)?.id) && (
                      <MessageActions className="mt-1">
                        <MessageAction
                          tooltip={speaker.speakingId === m.id ? "Stop reading" : "Read aloud"}
                          onClick={() => (speaker.speakingId === m.id ? speaker.stop() : void speaker.play(m.id, m.content))}
                        >
                          {speaker.loadingId === m.id ? (
                            <Loader2 className="animate-spin" />
                          ) : speaker.speakingId === m.id ? (
                            <Square />
                          ) : (
                            <Volume2 />
                          )}
                        </MessageAction>
                        <MessageAction
                          tooltip="Copy"
                          onClick={() => {
                            void navigator.clipboard.writeText(m.content);
                            toast.success("Copied");
                          }}
                        >
                          <Copy />
                        </MessageAction>
                      </MessageActions>
                    )}
                  </div>
                </div>
              ) : (
                <MessageContent>{m.content}</MessageContent>
              )}
            </Message>
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-3">
              <img src={emblem} alt="" width={816} height={816} className="size-7" />
              <Shimmer>Thinking…</Shimmer>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t bg-card/80 px-4 py-4 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl">
          <PromptInput onSubmit={() => void send(input)} className="rounded-2xl bg-card shadow-card">
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder="Ask about the form, approval, passport, photo…"
              autoFocus
            />
            <PromptInputFooter>
              <PromptInputTools>
                <MicButton disabled={busy} onText={(t) => setInput((cur) => (cur ? `${cur} ${t}` : t))} />
                <label className="ml-1 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={autoRead}
                    onCheckedChange={(v) => {
                      setAutoRead(v);
                      window.localStorage.setItem(AUTO_READ_KEY, v ? "1" : "0");
                      if (!v) speaker.stop();
                    }}
                    aria-label="Read answers aloud automatically"
                  />
                  Read answers aloud
                </label>
              </PromptInputTools>
              <PromptInputSubmit
                status={status}
                disabled={!busy && !input.trim()}
                onStop={() => abortRef.current?.abort()}
              />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            CIR Guide can make mistakes. Official dates and decisions come from the CIR office.
          </p>
        </div>
      </div>
    </div>
  );
}
