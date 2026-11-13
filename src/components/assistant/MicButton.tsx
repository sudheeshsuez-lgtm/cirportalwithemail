import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { transcribeVoice } from "@/lib/voice.functions";
import { cn } from "@/lib/utils";

async function blobToBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Tap to record a question, tap again to turn it into text. */
export function MicButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const transcribe = useServerFn(transcribeVoice);
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice input isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1200) {
          setState("idle");
          toast.message("That was too short — hold on a little longer while you speak.");
          return;
        }
        setState("transcribing");
        try {
          const { text } = await transcribe({ data: { audioBase64: await blobToBase64(blob), mimeType: blob.type } });
          if (text) onText(text);
          else toast.message("I couldn't hear anything. Please try again.");
        } catch (e) {
          console.error(e);
          toast.error("Couldn't understand the recording. Please try again.");
        } finally {
          setState("idle");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setState("recording");
    } catch {
      toast.error("Please allow microphone access to ask by voice.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  return (
    <PromptInputButton
      tooltip={state === "recording" ? "Stop and convert to text" : "Ask by voice"}
      onClick={state === "recording" ? stop : start}
      disabled={disabled || state === "transcribing"}
      variant={state === "recording" ? "destructive" : "ghost"}
      className={cn(state === "recording" && "animate-pulse-ring rounded-full")}
      aria-label={state === "recording" ? "Stop recording" : "Ask by voice"}
    >
      {state === "transcribing" ? <Loader2 className="animate-spin" /> : state === "recording" ? <Square /> : <Mic />}
    </PromptInputButton>
  );
}
