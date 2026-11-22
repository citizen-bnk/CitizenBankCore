import {dataScope} from './execution-context';
import {sql} from 'drizzle-orm';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {db,schema,type Tx} from '@/db';
import {eq} from 'drizzle-orm';
import {createId} from './id';
import {BankError} from './errors';
export type BankingEmailEvent='accounts_ready'|'card_created'|'access_updated'|'account_energized';
export async function queueBankingEmail(tx:Tx,userId:string,event:BankingEmailEvent,eventKey:string,details:Record<string,unknown>){
 if(dataScope()==='demo')return;
 const [user]=await tx.select().from(schema.users).where(eq(schema.users.id,userId));
 if(!user?.personId)return;
 const payload={event,event_key:eventKey,recipient_email:user.email,recipient_name:[user.firstName,user.lastName].filter(Boolean).join(' '),details,fictional:true};
 await tx.execute(sql`INSERT INTO banking_email_outbox(id,event_key,user_id,person_id,payload) VALUES(${createId()},${eventKey},${userId},${user.personId},${JSON.stringify(payload)}::jsonb) ON CONFLICT(event_key) DO NOTHING`);
}
function proof(personId:string,raw:string){
 const secret=process.env.PROFILE_SERVICE_SECRET||'';if(secret.length<32)throw Error('Email connection unavailable');
 const now=Math.floor(Date.now()/1000),encoded=Buffer.from(JSON.stringify({use:'banking-notification',sub:personId,method:'POST',body:createHash('sha256').update(raw).digest('hex'),iat:now,exp:now+30})).toString('base64url');
 return encoded+'.'+createHmac('sha256',secret).update(encoded).digest('base64url');
}
export async function flushBankingEmails(limit=5){
 let queued=0,delayed=0;
 for(let i=0;i<Math.min(limit,10);i++){
  const result=await db.transaction(async tx=>{
   const records=await tx.execute(sql`SELECT id,person_id,payload FROM banking_email_outbox WHERE status='pending' AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`);
   const row=records.rows[0];if(!row)return null;
   try{
    const raw=JSON.stringify(row.payload),base=process.env.PLATFORM_WEBSITE_URL||'https://citizenbank.co.ls';
    if(base!=='https://citizenbank.co.ls')throw Error('Email authority unavailable');
    const response=await fetch(base+'/api/platform/banking-notification',{method:'POST',headers:{'Content-Type':'application/json','X-Citizen-Profile-Token':proof(String(row.person_id),raw)},body:raw,signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw Error('Email handoff unavailable');
    await tx.execute(sql`UPDATE banking_email_outbox SET status='queued',handed_off_at=now(),attempts=attempts+1 WHERE id=${row.id}`);return true;
   }catch{
    await tx.execute(sql`UPDATE banking_email_outbox SET attempts=attempts+1,next_attempt_at=now()+interval '5 minutes' WHERE id=${row.id}`);return false;
   }
  });
  if(result===null)break;if(result)queued++;else delayed++;
 }
 return {queued,delayed};
}
export function verifyEmailFlushProof(token:string,raw:string,purpose='banking-email-flush'){
 const secret=process.env.PROFILE_SERVICE_SECRET||'';
 try{const [payload,signature]=token.split('.');if(secret.length<32||!payload||!signature||token.length>2000)throw Error();
  const expected=createHmac('sha256',secret).update(payload).digest(),actual=Buffer.from(signature,'base64url');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw Error();const claim=JSON.parse(Buffer.from(payload,'base64url').toString()),now=Math.floor(Date.now()/1000);
  if(claim.use!==purpose||claim.method!=='POST'||claim.body!==createHash('sha256').update(raw).digest('hex')||!Number.isInteger(claim.iat)||!Number.isInteger(claim.exp)||claim.iat>now+5||claim.iat<now-35||claim.exp<=now||claim.exp-claim.iat>30||claim.exp<=claim.iat||!/^[0-9a-f-]{36}$/i.test(claim.sub||''))throw Error();
  return String(claim.sub);
 }catch{throw new BankError('UNAUTHENTICATED','Service authentication required.',401);}
}
