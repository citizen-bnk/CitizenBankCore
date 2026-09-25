import { authed } from "@/lib/api";
import { deleteBeneficiary } from "@/lib/banking";
export const DELETE = authed<{ id: string }>(async (_req, s, { params }) => {
  await deleteBeneficiary(s.userId, (await params).id);
  return { ok: true };
});
