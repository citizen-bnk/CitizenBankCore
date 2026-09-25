import { authed } from "@/lib/api";
import { loanQuote } from "@/lib/banking";
export const GET = authed(async (req) => {
  const q = new URL(req.url).searchParams;
  return loanQuote(q.get("type") ?? "PERSONAL", Number(q.get("amount")), Number(q.get("months")));
});
