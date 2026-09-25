/**
 * Session auth: bcrypt password hashes + a signed JWT in an httpOnly cookie.
 * The same session works for the mobile PWA and internet banking because both
 * are served from the same origin.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const SESSION_COOKIE = "cb_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h absolute; idle timeout is enforced client-side

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

export type Session = { userId: string; roles: string[] };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSessionToken(s: Session) {
  return new SignJWT({ roles: s.roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { userId: payload.sub, roles: (payload.roles as string[]) ?? [] };
  } catch {
    return null;
  }
}

export async function setSessionCookie(s: Session) {
  const token = await createSessionToken(s);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Loads the signed-in user, or null if the session is missing/invalid/suspended. */
export async function getCurrentUser() {
  const s = await getSession();
  if (!s) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
  if (!u || u.suspended) return null;
  return u;
}
