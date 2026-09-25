import { authed } from "@/lib/api";
import { listTransactions } from "@/lib/banking";
export const dynamic = "force-dynamic";
export const GET = authed(async (req, s) => {
  const q = new URL(req.url).searchParams;
  const d = (v: string | null) => (v && !isNaN(Date.parse(v)) ? new Date(v) : undefined);
  return listTransactions(s.userId, {
    accountId: q.get("accountId") ?? undefined,
    limit: Number(q.get("limit") ?? 50) || 50,
    from: d(q.get("from")),
    to: d(q.get("to")),
  });
});
