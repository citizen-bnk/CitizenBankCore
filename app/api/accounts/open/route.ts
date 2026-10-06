import { eq,sql } from 'drizzle-orm';
import { authed } from '@/lib/api';
import { db,schema } from '@/db';
import { requireKyc } from '@/lib/kyc';
import { assertOrigin } from '@/lib/passkey-auth';
import { newAccountNumber } from '@/lib/onboarding';
export const POST=authed(async (req,s)=>{
  assertOrigin(req);
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT id FROM users WHERE id=${s.userId} FOR UPDATE`);
    await requireKyc(s.userId,'open_account',0,tx);
    const existing=await tx.select({id:schema.accounts.id}).from(schema.accounts).where(eq(schema.accounts.userId,s.userId));
    if(existing.length) return {ok:true,alreadyOpen:true,demoOnly:true};
    for(const type of ['CURRENT','SAVINGS'] as const) await tx.insert(schema.accounts).values({userId:s.userId,type,name:type==='CURRENT'?'Current Account':'Savings Account',number:await newAccountNumber(tx,type)});
    return {ok:true,demoOnly:true};
  });
});
