import { eq } from "drizzle-orm";
import { authed } from "@/lib/api";
import { db, schema } from "@/db";
import { LOAN_RATES } from "@/lib/banking";
export const dynamic = "force-dynamic";
export const GET = authed(async (_req, s) => ({
  loans: await db.select().from(schema.loans).where(eq(schema.loans.userId, s.userId)),
  rates: LOAN_RATES,
}));
