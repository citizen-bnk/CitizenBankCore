import { authed } from "@/lib/api";
import { listNotifications, markNotificationsRead } from "@/lib/banking";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const GET = authed(async (_req, s) => listNotifications(s.userId));
export const POST = authed(async (req, s) => {
  const { ids } = z.object({ ids: z.array(z.string()).optional() }).parse(await req.json().catch(() => ({})));
  await markNotificationsRead(s.userId, ids);
  return { ok: true };
});
