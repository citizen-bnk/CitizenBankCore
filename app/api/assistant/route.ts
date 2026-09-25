import { z } from "zod";
import { authed, body } from "@/lib/api";
import { askAssistant } from "@/lib/assistant";

export const maxDuration = 60;

const schemaIn = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(40),
  language: z.enum(["en", "st", "zu"]).optional(),
  image: z.object({ mediaType: z.string().max(40), data: z.string().max(7_000_000) }).optional(),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
});

/* Simple per-instance throttle (30 requests / 5 min / user). Use Upstash/Redis for a global limit. */
const hits = new Map<string, number[]>();
function throttled(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 300_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > 30;
}

export const POST = authed(async (req, s) => {
  if (throttled(s.userId)) return Response.json({ error: "You're going a bit fast for me — give it a moment and try again." }, { status: 429 });
  return askAssistant(s.userId, await body(req, schemaIn));
});
