import { authed, body } from "@/lib/api";
import { setCardStatus } from "@/lib/banking";
import { cardStatusSchema } from "@/lib/validators";
export const POST = authed<{ id: string }>(async (req, s, { params }) => {
  const { action } = await body(req, cardStatusSchema);
  const card = await setCardStatus(s.userId, (await params).id, action);
  return { ok: true, status: card.status };
});
