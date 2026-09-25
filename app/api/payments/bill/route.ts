import { authed, body, idempotencyKey } from "@/lib/api";
import { payBill } from "@/lib/banking";
import { payBillSchema } from "@/lib/validators";
export const POST = authed(async (req, s) => {
  const b = await body(req, payBillSchema);
  const tx = await payBill(s.userId, { fromAccountId: b.fromAccountId, billerId: b.billerId, cents: b.amount, customerRef: b.customerRef, idempotencyKey: idempotencyKey(req), kind: "BILL_PAYMENT" });
  return { ok: true, reference: tx.reference };
});
