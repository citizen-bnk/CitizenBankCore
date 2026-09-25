import { sql } from "drizzle-orm";
import { db } from "@/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up", ai: !!process.env.ANTHROPIC_API_KEY, time: new Date().toISOString() });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
