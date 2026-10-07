import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authed } from "@/lib/api";
import { BankError } from "@/lib/errors";
import { profileProof } from "@/lib/profile-service";

const sharedProfile = authed(async (req, session) => {
  const [user] = await db.select({personId:schema.users.personId}).from(schema.users).where(eq(schema.users.id,session.userId));
  if (!user?.personId) return {linked:false,roles:session.roles};
  const base = process.env.PLATFORM_WEBSITE_URL;
  const secret = process.env.PROFILE_SERVICE_SECRET;
  if (!base || !secret) throw new BankError("PROFILE_UNAVAILABLE","Shared profile is temporarily unavailable",503);
  const body = req.method === "PATCH" ? await req.text() : "";
  if (body.length > 16000) throw new BankError("VALIDATION","Profile update is too large",422);
  const response = await fetch(new URL("/api/platform/profile-service",base),{
    method:req.method, cache:"no-store", signal:AbortSignal.timeout(10000),
    headers:{"Content-Type":"application/json","X-Citizen-Profile-Token":profileProof(user.personId,req.method as "GET"|"PATCH",body,secret)},
    ...(req.method === "PATCH" ? {body} : {}),
  });
  if (!response.ok) throw new BankError("PROFILE_UNAVAILABLE",response.status === 409 ? "Your profile changed elsewhere. Reload before saving." : "Your shared profile could not be loaded or updated",response.status);
  const shared = await response.json();
  // Core keeps only a projection of the shared contact fields for banking operations.
  // Read the authoritative profile first, including changes made in the Hub.
  if (shared.linked && shared.profile) {
    const projection: Partial<typeof schema.users.$inferInsert> = {};
    if (typeof shared.profile.full_name === "string" && shared.profile.full_name.trim()) {
      const parts = shared.profile.full_name.trim().split(/\s+/);
      projection.firstName = parts[0].slice(0,100);
      projection.lastName = (parts.slice(1).join(" ") || "-").slice(0,100);
    }
    if (typeof shared.profile.phone === "string" && shared.profile.phone.length <= 30) projection.phone = shared.profile.phone;
    if (Object.keys(projection).length) await db.update(schema.users).set(projection).where(eq(schema.users.id,session.userId));
  }
  return shared;
});
export const GET = sharedProfile;
export const PATCH = sharedProfile;
