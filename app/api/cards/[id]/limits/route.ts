import { authed, body } from "@/lib/api";
import { setCardLimits } from "@/lib/banking";
import { cardLimitSchema } from "@/lib/validators";
export const PATCH = authed<{ id: string }>(async (req, s, { params }) => {
  const b = await body(req, cardLimitSchema);
  const card = await setCardLimits(s.userId, (await params).id, { dailyCents: b.daily, monthlyCents: b.monthly });
  return { ok: true, dailyLimit: card.dailyLimit, monthlyLimit: card.monthlyLimit };
});
