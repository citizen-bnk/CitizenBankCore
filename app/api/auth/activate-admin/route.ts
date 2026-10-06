import {createHash} from 'node:crypto';
import {and,eq,gt,isNull} from 'drizzle-orm';
import {z} from 'zod';
import {db,schema} from '@/db';
import {body,errorResponse} from '@/lib/api';
import {assertOrigin} from '@/lib/passkey-auth';
import {rateLimit} from '@/lib/rate-limit';
import {hashPassword,setSessionCookie} from '@/lib/auth';
import {BankError} from '@/lib/errors';
export async function POST(req:Request){try{
 assertOrigin(req);await rateLimit(req,'admin-activation',5,3600_000);
 if(process.env.DEMO_MODE!=='true')throw new BankError('DEMO_ONLY','Administrator activation is available only in this demonstration.',403);
 const input=await body(req,z.object({token:z.string().regex(/^[0-9a-f]{64}$/),password:z.string().min(15).max(72).regex(/[A-Za-z]/).regex(/[0-9]/)}).strict());
 const tokenHash=createHash('sha256').update(input.token).digest('hex'),passwordHash=await hashPassword(input.password);
 const user=await db.transaction(async tx=>{
  const [invite]=await tx.update(schema.adminInvites).set({consumedAt:new Date()}).where(and(eq(schema.adminInvites.tokenHash,tokenHash),isNull(schema.adminInvites.consumedAt),gt(schema.adminInvites.expiresAt,new Date()))).returning();
  if(!invite)throw new BankError('INVITE_INVALID','This activation link is invalid, expired or already used.',401);
  const [u]=await tx.select().from(schema.users).where(eq(schema.users.id,invite.userId));
  if(!u || u.suspended)throw new BankError('INVITE_INVALID','This account is unavailable. Please contact the administrator.',403);
  const roles=[...new Set([...u.roles,'SUPER_ADMIN' as const])];
  const [updated]=await tx.update(schema.users).set({roles,passwordHash,failedLogins:0,lockedUntil:null}).where(eq(schema.users.id,u.id)).returning();
  await tx.delete(schema.authSessions).where(eq(schema.authSessions.userId,u.id));
  await tx.delete(schema.passkeys).where(eq(schema.passkeys.userId,u.id));
  await tx.insert(schema.kycEvents).values({userId:u.id,actorId:u.id,event:'admin_invite_activated',details:{source:'owner-authorised-deployment-invite',demoOnly:true}});
  return updated;
 });
 await setSessionCookie({userId:user.id,roles:user.roles});return Response.json({ok:true});
}catch(e){return errorResponse(e)}}
