import { z } from 'zod';
import { eq,sql } from 'drizzle-orm';
import { authed,body } from '@/lib/api';
import { assertOrigin } from '@/lib/passkey-auth';
import { BankError } from '@/lib/errors';
import { db,schema } from '@/db';
import { DEMO_POLICY,kycState } from '@/lib/kyc';
const review=z.object({userId:z.string().min(6).max(40),decision:z.enum(['approve','reject']),
 evidence:z.array(z.enum(['contact','identity','address','source_of_funds'])).max(4),reference:z.string().trim().min(4).max(150),submittedAt:z.string().datetime(),demoOnly:z.literal(true)}).strict();
export const POST=authed(async (req,s)=>{
  assertOrigin(req);
  if(process.env.DEMO_MODE!=='true' || !s.roles.some(r=>['BACK_OFFICE','SUPER_ADMIN'].includes(r))) throw new BankError('FORBIDDEN','Review access is required.',403);
  if(Date.now()/1000-(s.authenticatedAt ?? 0)>300) throw new BankError('REAUTH_REQUIRED','Sign in again before reviewing checks.',401);
  const b=await body(req,review);
  if(b.userId===s.userId) throw new BankError('SELF_REVIEW','You cannot approve your own checks.',403);
  await db.transaction(async tx=>{
    await tx.execute(sql`SELECT id FROM users WHERE id=${b.userId} FOR UPDATE`);
    await tx.execute(sql`SELECT user_id FROM kyc_profiles WHERE user_id=${b.userId} FOR UPDATE`);
    const profile=await kycState(b.userId,tx);
    if(!profile) throw new BankError('NOT_FOUND','No submitted details were found.',404);
    if(profile.updatedAt.toISOString()!==b.submittedAt) throw new BankError('STALE_REVIEW','These details have changed. Refresh before reviewing.',409);
    const fields:Record<string,string[]>={contact:['email','phone'],identity:['legalName','dateOfBirth','nationality'],address:['address'],source_of_funds:['sourceOfFunds']};
    if(b.decision==='approve' && (!b.evidence.length || b.evidence.some(e=>e==='contact' ? !fields[e].some(f=>profile.declared[f]) : !fields[e].every(f=>profile.declared[f])))) throw new BankError('MISSING_DETAILS','The selected check has missing details.',422);
    const verified=b.decision==='reject' ? [] : [...new Set([...(profile.validUntil && profile.validUntil>new Date() ? profile.verified:[]),...b.evidence])];
    const expiry=profile.validUntil && profile.validUntil>new Date() ? profile.validUntil : new Date(Date.now()+365*86400_000);
    await tx.update(schema.kycProfiles).set({verified,status:b.decision==='approve'?'reviewed':'rejected',validUntil:b.decision==='approve'?expiry:null,updatedAt:new Date()}).where(eq(schema.kycProfiles.userId,b.userId));
    await tx.insert(schema.kycEvents).values({userId:b.userId,actorId:s.userId,event:b.decision,details:{evidence:b.evidence,reference:b.reference,policyVersion:DEMO_POLICY.version,demoOnly:true}});
  });return {ok:true,demoOnly:true};
});
export const GET=authed(async (_req,s)=>{
  if(process.env.DEMO_MODE!=='true' || !s.roles.some(r=>['BACK_OFFICE','SUPER_ADMIN'].includes(r))) throw new BankError('FORBIDDEN','Review access is required.',403);
  return {profiles:await db.select().from(schema.kycProfiles).where(eq(schema.kycProfiles.status,'pending')).limit(50),demoOnly:true};
});
