import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authed, body } from "@/lib/api";
import { BankError } from "@/lib/errors";
import { ACTION_STAGE, KYC_FIELDS, kycGate } from "@/lib/kyc";

export const dynamic = "force-dynamic";
const fields = [...KYC_FIELDS.basic, ...KYC_FIELDS.standard, ...KYC_FIELDS.enhanced] as string[];
const update = z.object({ field: z.string(), value: z.string().trim().max(500) });

export const GET = authed(async (_req, s) => {
  const [user] = await db.select({ profile: schema.users.kycProfile, status: schema.users.kycStatus })
    .from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
  if (!user) throw new BankError("PROFILE_NOT_FOUND", "Your profile could not be found.", 404);
  return { profile: user.profile, status: user.status, gates: Object.fromEntries(
    Object.keys(ACTION_STAGE).map((action) => [action, kycGate(action as keyof typeof ACTION_STAGE, user.profile, user.status)]),
  ) };
});

export const PATCH = authed(async (req, s) => {
  const { field, value } = await body(req, update);
  if (!fields.includes(field)) throw new BankError("KYC_FIELD_UNKNOWN", "That profile field cannot be changed here.", 422);
  const [user] = await db.select({ profile: schema.users.kycProfile }).from(schema.users)
    .where(eq(schema.users.id, s.userId)).limit(1);
  if (!user) throw new BankError("PROFILE_NOT_FOUND", "Your profile could not be found.", 404);
  const profile = { ...user.profile, [field]: value };
  await db.update(schema.users).set({ kycProfile: profile, kycStatus: "PENDING_REVIEW", kycReviewedAt: null, kycReviewedBy: null })
    .where(eq(schema.users.id, s.userId));
  return { profile, status: "PENDING_REVIEW" };
});
