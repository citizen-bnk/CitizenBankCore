import { authed, body, idempotencyKey } from "@/lib/api";
import { internalTransfer } from "@/lib/banking";
import { internalTransferSchema } from "@/lib/validators";
export const POST = authed(async (req, s) => {
  const b = await body(req, internalTransferSchema);
  const tx = await internalTransfer(s.userId, { fromAccountId: b.fromAccountId, toAccountId: b.toAccountId, cents: b.amount, idempotencyKey: idempotencyKey(req) });
  return { ok: true, reference: tx.reference };
});
