import type { AIConfig } from "./ai-config";
import { BankError } from "./errors";

export async function speechWithFailover(text: string, language: "en" | "st" | "zu", cfg: AIConfig, request: typeof fetch = fetch) {
  const voice = cfg.voices[language] || cfg.voices.en;
  const candidates: { provider: string; url: string; keyHeader: Record<string, string>; body: unknown }[] = [];
  if (cfg.elevenlabs && voice) candidates.push({ provider: "elevenlabs",
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
    keyHeader: { "xi-api-key": cfg.elevenlabs }, body: { text, model_id: cfg.elevenlabsModel } });
  if (cfg.openai) candidates.push({ provider: "openai", url: "https://api.openai.com/v1/audio/speech",
    keyHeader: { Authorization: `Bearer ${cfg.openai}` }, body: { model: cfg.speechModel, voice: cfg.speechVoice,
      input: text, response_format: "mp3",
      ...(cfg.speechModel.startsWith("gpt-") ? { instructions: `Read the provided text naturally in ${{ en: "English", st: "Sesotho", zu: "isiZulu" }[language]}. Speak calmly and clearly. Do not add or change any words.` } : {}) } });
  if (!candidates.length) throw new BankError("VOICE_OFFLINE", "Voice backend not configured", 501);
  const deadline = Date.now() + 25_000;
  for (const c of candidates) {
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const res = await request(c.url, { method: "POST", signal: AbortSignal.timeout(Math.min(12_000, remaining)),
        headers: { ...c.keyHeader, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify(c.body) });
      if (!res.ok) throw Object.assign(new Error("Voice provider unavailable"), { status: res.status });
      const audio = await res.arrayBuffer();
      if (!audio.byteLength || !/^audio\//.test(res.headers.get("content-type") ?? "")) throw new Error("Invalid audio response");
      return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store",
        "X-Voice-Provider": c.provider } });
    } catch (e) {
      console.warn("[speech] provider unavailable", { provider: c.provider, status: (e as { status?: number })?.status ?? "transport_or_response" });
    }
  }
  throw new BankError("VOICE_UNAVAILABLE", "Voice is temporarily unavailable. Your reply is still shown on screen.", 503);
}
