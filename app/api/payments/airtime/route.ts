import { authed, body, idempotencyKey } from "@/lib/api";
import { payBill } from "@/lib/banking";
import { airtimeSchema } from "@/lib/validators";
export const POST = authed(async (req, s) => {
  const b = await body(req, airtimeSchema);
  const tx = await payBill(s.userId, { fromAccountId: b.fromAccountId, billerId: b.billerId, cents: b.amount, customerRef: b.phone, idempotencyKey: idempotencyKey(req), kind: "AIRTIME" });
  return { ok: true, reference: tx.reference };
});
