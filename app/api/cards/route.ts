import { authed, body } from "@/lib/api";
import { orderCard } from "@/lib/banking";
import { orderCardSchema } from "@/lib/validators";
export const POST = authed(async (req, s) => ({ ok: true, card: await orderCard(s.userId, await body(req, orderCardSchema)) }));
