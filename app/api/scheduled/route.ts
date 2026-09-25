import { authed, body } from "@/lib/api";
import { createScheduled, listScheduled } from "@/lib/banking";
import { scheduledSchema } from "@/lib/validators";
export const dynamic = "force-dynamic";
export const GET = authed(async (_req, s) => listScheduled(s.userId));
export const POST = authed(async (req, s) => {
  const b = await body(req, scheduledSchema);
  return { ok: true, scheduled: await createScheduled(s.userId, { ...b, cents: b.amount }) };
});
