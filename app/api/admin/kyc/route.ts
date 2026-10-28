import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authed, body } from "@/lib/api";
import { BankError } from "@/lib/errors";
import { missingForStage } from "@/lib/kyc";

export const dynamic = "force-dynamic";
export const POST = authed(async (req, s) => {
  if (!s.roles.some((role) => role === "SUPER_ADMIN" || role === "BACK_OFFICE")) {
    throw new BankError("FORBIDDEN", "An authorised KYC reviewer is required.", 403);
  }
  const { userId, decision, note } = await body(req, z.object({
    userId: z.string().min(1), decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().min(5).max(500),
  }));
  if (userId === s.userId) throw new BankError("SELF_REVIEW", "You cannot review your own identity evidence.", 403);
  const [subject] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!subject) throw new BankError("PROFILE_NOT_FOUND", "The customer profile could not be found.", 404);
  if (decision === "APPROVED" && missingForStage(subject.kycProfile, "standard").length) {
    throw new BankError("KYC_INCOMPLETE", "The standard identity information and evidence references are incomplete.", 422);
  }
  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ kycStatus: decision, kycReviewedAt: new Date(), kycReviewedBy: s.userId })
      .where(eq(schema.users.id, userId));
    await tx.insert(schema.notifications).values({ userId, title: decision === "APPROVED" ? "Identity review approved" : "Identity review needs attention",
      body: decision === "APPROVED" ? "You can now activate your dormant accounts from Accounts." : `Your identity review needs attention: ${note}` });
  });
  return { status: decision };
});
