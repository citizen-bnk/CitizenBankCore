/**
 * Session auth: bcrypt password hashes + a signed JWT in an httpOnly cookie.
 * The same session works for the mobile PWA and internet banking because both
 * are served from the same origin.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { and,eq,gt } from "drizzle-orm";
import { db, schema } from "@/db";

export const SESSION_COOKIE = "cb_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h absolute; 5-minute idle timeout enforced server-side

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

export type Session = { userId: string; roles: string[]; authenticatedAt?: number };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSessionToken(s: Session) {
  const [record]=await db.insert(schema.authSessions).values({userId:s.userId,expiresAt:new Date(Date.now()+SESSION_TTL_SECONDS*1000)}).returning();
  return new SignJWT({ roles: s.roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setJti(record.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || !payload.jti) return null;
    const [record]=await db.update(schema.authSessions).set({lastSeenAt:new Date()}).where(and(
      eq(schema.authSessions.id,payload.jti),eq(schema.authSessions.userId,payload.sub),gt(schema.authSessions.expiresAt,new Date()),
      gt(schema.authSessions.lastSeenAt,new Date(Date.now()-300_000)))).returning();
    if(!record) return null;
    const [user]=await db.select().from(schema.users).where(eq(schema.users.id,payload.sub));
    if(!user || user.suspended) return null;
    return { userId: payload.sub, roles: user.roles, authenticatedAt:Math.floor(record.authenticatedAt.getTime()/1000) };
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
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  if(token) {try{const {payload}=await jwtVerify(token,secret(),{algorithms:['HS256']});if(payload.jti) await db.delete(schema.authSessions).where(eq(schema.authSessions.id,payload.jti));}catch{ /* Invalid or expired token has no usable session. */ }}
  (await cookies()).delete(SESSION_COOKIE);
  (await cookies()).delete('cb_explorer');
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
