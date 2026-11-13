import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { speakText } from "@/lib/voice.functions";

/** Plays assistant answers aloud. One clip at a time. */
export function useSpeaker() {
  const speak = useServerFn(speakText);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeakingId(null);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    async (id: string, text: string) => {
      stop();
      setLoadingId(id);
      try {
        const { audioBase64, mimeType } = await speak({ data: { text } });
        const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
        audioRef.current = audio;
        audio.onended = () => setSpeakingId((cur) => (cur === id ? null : cur));
        setSpeakingId(id);
        await audio.play();
      } catch (e) {
        console.error(e);
        toast.error("Couldn't read that answer aloud. Please try again.");
        setSpeakingId(null);
      } finally {
        setLoadingId(null);
      }
    },
    [speak, stop],
  );

  return { play, stop, speakingId, loadingId };
}
