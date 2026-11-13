import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const transcribeVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({ audioBase64: z.string().min(10).max(12_000_000), mimeType: z.string().max(100) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { transcribeAudio } = await import("@lovable.dev/ai-gateway");
    const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
    const ext = data.mimeType.includes("mp4") ? "mp4" : data.mimeType.includes("ogg") ? "ogg" : "webm";
    const file = new File([bytes], `question.${ext}`, { type: data.mimeType.split(";")[0] || "audio/webm" });
    const result = await transcribeAudio({
      model: "openai/gpt-transcribe",
      file,
      keywords: ["passport", "bonafide", "Centre for International Relations", "CIR"],
    });
    const text = typeof result === "string" ? result : (result as { text?: string }).text ?? "";
    return { text: text.trim() };
  });

function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_`>|]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2500);
}

export const speakText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ text: z.string().min(1).max(20000) }).parse(d))
  .handler(async ({ data }) => {
    const { generateSpeech } = await import("@lovable.dev/ai-gateway");
    const audio = await generateSpeech({
      model: "google/gemini-3.1-flash-tts-preview",
      contents: [{ role: "user", parts: [{ text: `Read this warmly and clearly: ${plainText(data.text)}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      },
    });
    const buf = new Uint8Array(await (await audio.blob()).arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { audioBase64: btoa(bin), mimeType: audio.contentType || "audio/wav" };
  });
