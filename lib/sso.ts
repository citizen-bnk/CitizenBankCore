/**
 * Single sign-on from the Citizen Bank website.
 *
 * The website signs a short-lived "handoff" token (ES256) and publishes its public keys. Core verifies
 * the token with those keys only, accepts it once, and starts its normal session. Core never trusts
 * the token for privileges: SSO users get the CUSTOMER role and nothing else, whatever roles the
 * website says they hold.
 */
import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey, type CryptoKey, type KeyObject } from "jose";
import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { BankError } from "./errors";
import { openCustomer } from "./onboarding";

export const HANDOFF_USE = "handoff";
/** The website issues 60-second tokens. Anything signed with a longer life is refused even if the signature is good. */
export const MAX_LIFETIME_SECONDS = 120;
const DEMO_OPENING_DEPOSIT_CENTS = 500_000;

export type SsoConfig = { jwksUrl: string; issuer: string; audiences: string[] };

export function readSsoConfig(env: Record<string, string | undefined> = process.env): SsoConfig | null {
  const jwksUrl = env.PLATFORM_JWKS_URL?.trim();
  const issuer = env.PLATFORM_ISSUER?.trim().replace(/\/+$/, "");
  if (!jwksUrl || !issuer) return null;
  // In production the signing keys must come over TLS, or whoever sits on the path could swap them.
  if (env.NODE_ENV === "production" && !/^https:\/\//i.test(jwksUrl)) {
    console.error("[sso] PLATFORM_JWKS_URL must be https in production; SSO is switched off.");
    return null;
  }
  const audiences = (env.SSO_AUDIENCES ?? "banking,app").split(",").map((s) => s.trim()).filter(Boolean);
  return { jwksUrl, issuer, audiences };
}

const keySets = new Map<string, JWTVerifyGetKey>();
export function remoteKeys(url: string): JWTVerifyGetKey {
  let set = keySets.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(url), { cooldownDuration: 30_000, cacheMaxAge: 300_000, timeoutDuration: 4_000 });
    keySets.set(url, set);
  }
  return set;
}

export type HandoffClaims = { personId: string; jti: string; expiresAt: Date; name: string; email: string; roles: string[] };

const INVALID = new BankError(
  "SSO_INVALID", "This sign-in link is not valid or has expired. Please start again from the Citizen Bank website.", 401,
);

export async function verifyHandoff(
  token: string,
  cfg: Pick<SsoConfig, "issuer" | "audiences">,
  keys: JWTVerifyGetKey | CryptoKey | KeyObject,
  now?: Date,
): Promise<HandoffClaims> {
  const options = {
    issuer: cfg.issuer, audience: cfg.audiences, algorithms: ["ES256"], clockTolerance: 5, currentDate: now,
    requiredClaims: ["exp", "iat", "jti", "sub", "aud", "iss"],
  };
  let payload;
  try {
    ({ payload } = typeof keys === "function" ? await jwtVerify(token, keys, options) : await jwtVerify(token, keys, options));
  } catch (e) {
    if (e instanceof errors.JWKSTimeout) {
      throw new BankError("SSO_UNAVAILABLE", "Sign-in is temporarily unavailable. Please try again shortly.", 503);
    }
    throw INVALID;
  }
  const { sub, jti, exp, iat } = payload;
  const roles = payload.roles;
  if (
    payload.use !== HANDOFF_USE || typeof sub !== "string" || !sub || sub.length > 64 ||
    typeof jti !== "string" || !jti || jti.length > 100 || typeof exp !== "number" || typeof iat !== "number" ||
    exp - iat > MAX_LIFETIME_SECONDS || !Array.isArray(roles) || !roles.every((r) => typeof r === "string")
  ) throw INVALID;
  return {
    personId: sub, jti, expiresAt: new Date(exp * 1000),
    name: typeof payload.name === "string" ? payload.name.trim() : "",
    email: typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "",
    roles: roles as string[],
  };
}

/** Records the token as used. Returns false if it was redeemed before. Also purges rows that expired over a day ago. */
export async function consumeToken(claims: HandoffClaims): Promise<boolean> {
  const rows = await db.insert(schema.ssoTokensUsed)
    .values({ jti: claims.jti, expiresAt: claims.expiresAt })
    .onConflictDoNothing().returning({ jti: schema.ssoTokensUsed.jti });
  if (rows.length === 0) return false;
  await db.delete(schema.ssoTokensUsed).where(lt(schema.ssoTokensUsed.expiresAt, new Date(Date.now() - 86_400_000)));
  return true;
}

function splitName(name: string, email: string) {
  const parts = (name || email.split("@")[0]).split(/\s+/).filter(Boolean);
  return { firstName: parts[0].slice(0, 100), lastName: (parts.slice(1).join(" ") || "-").slice(0, 100) };
}

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && ((e as { code?: string }).code === "23505" ||
    (e as { cause?: { code?: string } }).cause?.code === "23505");

/** The Core user for this person, created on first visit. Never adopts a profile just because the email matches. */
export async function userForHandoff(claims: HandoffClaims, opts: { demo: boolean }) {
  if (!claims.roles.includes("customer")) {
    throw new BankError("SSO_NOT_CUSTOMER", "Your account does not include banking.", 403);
  }
  const byPerson = async () =>
    (await db.select().from(schema.users).where(eq(schema.users.personId, claims.personId)).limit(1))[0];

  let user = await byPerson();
  if (!user) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(claims.email) || claims.email.length > 255) {
      throw new BankError("SSO_NO_EMAIL", "Your profile has no valid email address yet.", 422);
    }
    const [sameEmail] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.email, claims.email)).limit(1);
    if (sameEmail) {
      throw new BankError("SSO_EMAIL_IN_USE",
        "A banking profile with this email already exists and has not been linked to your account. Please contact support.", 409);
    }
    try {
      user = await openCustomer({
        ...splitName(claims.name, claims.email), email: claims.email, personId: claims.personId,
        password: randomBytes(32).toString("base64url"), // nobody knows it: this profile signs in through the website only
        openingDepositCents: opts.demo ? DEMO_OPENING_DEPOSIT_CENTS : 0,
      });
    } catch (e) {
      // Two first-time visits at once: the other one won, use its profile.
      if (!(isUniqueViolation(e) || (e instanceof BankError && e.code === "EMAIL_TAKEN"))) throw e;
      user = await byPerson();
      if (!user) throw e;
    }
  }
  if (user.suspended) throw new BankError("SUSPENDED", "This profile is suspended. Please contact support.", 403);
  await db.update(schema.users).set({ lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null })
    .where(eq(schema.users.id, user.id));
  return user;
}
