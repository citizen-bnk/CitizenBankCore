import { authed, body, idempotencyKey } from "@/lib/api";
import { addBeneficiary, payBeneficiary } from "@/lib/banking";
import { crossBorderSchema } from "@/lib/validators";
export const POST = authed(async (req, s) => {
  const b = await body(req, crossBorderSchema);
  const ben = await addBeneficiary(s.userId, { name: b.recipientName, bankName: b.bankName, accountNumber: b.accountNumber, country: b.country, swift: b.swift });
  const tx = await payBeneficiary(s.userId, { fromAccountId: b.fromAccountId, beneficiaryId: ben.id, cents: b.amount, idempotencyKey: idempotencyKey(req) });
  return { ok: true, reference: tx.reference, fee: tx.fee, beneficiaryId: ben.id };
});
