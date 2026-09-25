import { z } from "zod";
import { authed, body } from "@/lib/api";

export const maxDuration = 30;

/**
 * Text-to-speech proxy for ElevenLabs (keeps the API key server-side).
 * Returns 501 when ELEVENLABS_API_KEY isn't configured; the app then falls back
 * to its animated word-pulse voice preview.
 */
const schemaIn = z.object({
  text: z.string().min(1).max(600),
  language_code: z.enum(["en", "st", "zu"]).default("en"),
});

export const POST = authed(async (req) => {
  const key = process.env.ELEVENLABS_API_KEY;
  const { text, language_code } = await body(req, schemaIn);
  const voice = {
    en: process.env.ELEVENLABS_VOICE_EN,
    st: process.env.ELEVENLABS_VOICE_ST,
    zu: process.env.ELEVENLABS_VOICE_ZU,
  }[language_code] || process.env.ELEVENLABS_VOICE_EN;
  if (!key || !voice) return Response.json({ error: "Voice backend not configured" }, { status: 501 });

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2" }),
  });
  if (!r.ok || !r.body) return Response.json({ error: "Voice service unavailable" }, { status: 502 });
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
});
