import { authed } from "@/lib/api";
import { cancelScheduled } from "@/lib/banking";
export const DELETE = authed<{ id: string }>(async (_req, s, { params }) => {
  await cancelScheduled(s.userId, (await params).id);
  return { ok: true };
});
