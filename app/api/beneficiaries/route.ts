import { authed, body } from "@/lib/api";
import { addBeneficiary, getOverview } from "@/lib/banking";
import { beneficiarySchema } from "@/lib/validators";
export const dynamic = "force-dynamic";
export const GET = authed(async (_req, s) => (await getOverview(s.userId)).beneficiaries);
export const POST = authed(async (req, s) => {
  const b = await addBeneficiary(s.userId, await body(req, beneficiarySchema));
  return { ok: true, beneficiary: { id: b.id, name: b.name, type: b.type, bankName: b.bankName, accountLast4: b.accountNumber.slice(-4) } };
});
