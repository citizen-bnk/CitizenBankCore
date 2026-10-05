import { z } from "zod";
import { authed, body } from "@/lib/api";
import { resolveAIConfig } from "@/lib/ai-config";
import { speechWithFailover } from "@/lib/speech-providers";
export const maxDuration = 30;
const schemaIn = z.object({ text: z.string().trim().min(1).max(4000),
  language_code: z.enum(["en", "st", "zu"]).default("en") });
/** ElevenLabs first, OpenAI second. Provider requests stay on the server. */
export const POST = authed(async (req) => {
  const { text, language_code } = await body(req, schemaIn);
  return speechWithFailover(text, language_code, resolveAIConfig());
});
