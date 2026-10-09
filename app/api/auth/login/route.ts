import { NextResponse } from "next/server";
import { eq,sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { body, errorResponse } from "@/lib/api";
import { loginSchema } from "@/lib/validators";

import { assertOrigin } from '@/lib/passkey-auth';
import { rateLimit } from '@/lib/rate-limit';
import {sharedSignInCode,usesSharedIdentity} from '@/lib/shared-sign-in';
import {consumeToken,readSsoConfig,remoteKeys,verifyHandoff,userForHandoff} from '@/lib/sso';
import {withDataScope} from '@/lib/execution-context';
import {BankError} from '@/lib/errors';
export const maxDuration=60;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
let dummyHash: Promise<string> | null = null;
const GENERIC = "That email and password don't match our records.";

export async function POST(req: Request) {
  try {
    assertOrigin(req);
    await rateLimit(req,'password-login',20);
    const { email, password } = await body(req, loginSchema);
    const [existing]=await db.select().from(schema.users).where(eq(schema.users.email,email)).limit(1);
    if(usesSharedIdentity(existing)){
      const cfg=readSsoConfig();if(!cfg)throw new BankError('SSO_NOT_CONFIGURED','Shared Citizen sign-in is not configured.',503);
      const claims=await verifyHandoff(await sharedSignInCode(email,password),cfg,remoteKeys(cfg.jwksUrl));
      if(claims.scope!=='live')throw new BankError('USE_DEMONSTRATION_SELECTOR','Choose a fictional account with the demo selector.',422);
      if(existing?.personId&&existing.personId!==claims.personId)throw new BankError('IDENTITY_LINK_CONFLICT','This banking profile is linked to another Citizen identity. Contact support.',409);
      return await withDataScope('live',async()=>{
        if(!(await consumeToken(claims)))throw new BankError('SSO_REPLAY','This sign-in attempt was already used. Start sign-in again.',401);
        const user=await userForHandoff(claims);
        await setSessionCookie({userId:user.id,roles:user.roles});
        return NextResponse.json({ok:true,user:{firstName:user.firstName,preferredLanguage:user.preferredLanguage,preferredTheme:user.preferredTheme}},{headers:{'Cache-Control':'no-store'}});
      });
    }
    const result=await db.transaction(async tx=>{
    await tx.execute(sql`SELECT id FROM users WHERE email=${email} FOR UPDATE`);
    const [u] = await tx.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (!u) {
      dummyHash ??= hashPassword("timing-equaliser");
      await verifyPassword(password, await dummyHash); // equalise timing so emails can't be enumerated
      return NextResponse.json({ error: GENERIC }, { status: 401 });
    }
    if (u.suspended) return NextResponse.json({ error: "This profile is suspended. Please contact support." }, { status: 403 });
    if (u.lockedUntil && u.lockedUntil > new Date()) {
      return NextResponse.json({ error: `Too many attempts. Try again after ${u.lockedUntil.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Maseru" })}.` }, { status: 429 });
    }
    if (!(await verifyPassword(password, u.passwordHash))) {
      const failed = u.failedLogins + 1;
      await tx.update(schema.users).set({
        failedLogins: failed >= MAX_ATTEMPTS ? 0 : failed,
        lockedUntil: failed >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      }).where(eq(schema.users.id, u.id));
      return NextResponse.json({ error: GENERIC }, { status: 401 });
    }
    await tx.update(schema.users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
    return {user:u};
    });
    if(result instanceof Response) return result;
    await setSessionCookie({userId:result.user.id,roles:result.user.roles});
    return NextResponse.json({ok:true,user:{firstName:result.user.firstName,preferredLanguage:result.user.preferredLanguage,preferredTheme:result.user.preferredTheme}});
  } catch (e) {
    return errorResponse(e);
  }
}
