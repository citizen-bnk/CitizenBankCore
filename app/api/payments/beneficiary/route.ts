import { authed, body, idempotencyKey } from "@/lib/api";
import { payBeneficiary } from "@/lib/banking";
import { payBeneficiarySchema } from "@/lib/validators";
export const POST = authed(async (req, s) => {
  const b = await body(req, payBeneficiarySchema);
  const tx = await payBeneficiary(s.userId, { fromAccountId: b.fromAccountId, beneficiaryId: b.beneficiaryId, cents: b.amount, reference: b.reference, idempotencyKey: idempotencyKey(req) });
  return { ok: true, reference: tx.reference, fee: tx.fee };
});
