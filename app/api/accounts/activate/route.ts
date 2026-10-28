import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed, body } from "@/lib/api";
import { BankError } from "@/lib/errors";
import { kycGate } from "@/lib/kyc";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const POST = authed(async (req, s) => {
  if (process.env.DEMO_MODE !== "true") throw new BankError("PRELICENSING_GATE", "Account activation is available only in the controlled demonstration environment until licensing is complete.", 403);
  const { accountId } = await body(req, z.object({ accountId: z.string().min(1) }));
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
    const [account] = await tx.select().from(schema.accounts)
      .where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.userId, s.userId))).limit(1).for("update");
    if (!user || !account) throw new BankError("ACCOUNT_NOT_FOUND", "This account could not be found.", 404);
    const gate = kycGate("activate_account", user.kycProfile, user.kycStatus);
    if (!gate.allowed) throw new BankError("KYC_REQUIRED",
      gate.missing.length ? `Complete these profile details first: ${gate.missing.join(", ")}.` : "Your identity evidence is awaiting review.", 403);
    if (account.status === "CLOSED") throw new BankError("ACCOUNT_CLOSED", "A closed account cannot be activated here.", 409);
    if (account.status === "ACTIVE") return { status: "ACTIVE" };
    await tx.update(schema.accounts).set({ status: "ACTIVE" }).where(eq(schema.accounts.id, accountId));
    return { status: "ACTIVE" };
  });
});
