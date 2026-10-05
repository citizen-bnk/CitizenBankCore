import { sql } from "drizzle-orm";
import { db } from "@/db";
import { resolveAIConfig } from "@/lib/ai-config";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const cfg = resolveAIConfig();
    return Response.json({ ok: true, db: "up", ai: !!(cfg.anthropic || cfg.openai),
      configuration: { anthropic: !!cfg.anthropic, openai: !!cfg.openai,
        elevenlabs: !!(cfg.elevenlabs && cfg.voices.en), openaiSpeech: !!cfg.openai },
      note: "Provider flags describe configuration; they do not verify credentials or connectivity.",
      time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
