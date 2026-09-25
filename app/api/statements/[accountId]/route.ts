import { and, eq } from "drizzle-orm";
import { authed } from "@/lib/api";
import { db, schema } from "@/db";
import { listTransactions } from "@/lib/banking";
import { notFound } from "@/lib/errors";
export const dynamic = "force-dynamic";

/** Statement for a date range (defaults to the last full calendar month + month to date). */
export const GET = authed<{ accountId: string }>(async (req, s, { params }) => {
  const { accountId } = await params;
  const [acc] = await db.select().from(schema.accounts)
    .where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.userId, s.userId))).limit(1);
  if (!acc) throw notFound("account");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId));
  const q = new URL(req.url).searchParams;
  const now = new Date();
  const from = q.get("from") ? new Date(q.get("from")!) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = q.get("to") ? new Date(q.get("to")!) : now;
  const entries = (await listTransactions(s.userId, { accountId, from, to, limit: 500 })).reverse();
  const opening = entries.length ? (Number(entries[0].balanceAfter) - Number(entries[0].amount)).toFixed(2) : acc.balance;
  return {
    account: { name: acc.name, number: acc.number, type: acc.type, currency: acc.currency },
    holder: `${user.firstName} ${user.lastName}`,
    from, to, openingBalance: opening,
    closingBalance: entries.length ? entries[entries.length - 1].balanceAfter : acc.balance,
    entries,
  };
});
