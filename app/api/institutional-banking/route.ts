import {readSsoConfig,remoteKeys,consumeToken} from '@/lib/sso';
import {verifyCardAdministrator} from '@/lib/institutional-cards-proof';
import {withDataScope} from '@/lib/execution-context';
import {db,schema} from '@/db';
import {sql} from 'drizzle-orm';
import {rateLimit} from '@/lib/rate-limit';
import {BankError} from '@/lib/errors';
import {errorResponse} from '@/lib/api';
import {testingInput} from '@/lib/testing-input';
import {testingEnabled,openTestingAccounts} from '@/lib/prelicensing-access';
import {energize} from '@/lib/energize';
import {orderCard} from '@/lib/banking';
export async function POST(req:Request){try{
 const raw=await req.text();if(raw.length>4000)throw new BankError('VALIDATION','Shorten the request.',422);
 const cfg={issuer:process.env.HUB_ISSUER,jwksUrl:process.env.HUB_JWKS_URL};
 if(cfg.issuer!=='https://hub.citizenbank.co.ls'||cfg.jwksUrl!=='https://hub.citizenbank.co.ls/api/platform/jwks.json')throw new BankError('BANKING_ADMIN_UNAVAILABLE','The banking administration connection is unavailable.',503);
 const proof=await verifyCardAdministrator(req.headers.get('x-citizen-ai-token')||'',raw,cfg.issuer,remoteKeys(cfg.jwksUrl),undefined,'banking');
 const data=testingInput.parse(JSON.parse(raw));
 return await withDataScope(proof.scope,async()=>{
  if(!testingEnabled())throw new BankError('PRELICENSING_TESTING_DISABLED','Pre-licensing test authorisation is switched off.',403);
  if(!await consumeToken({...proof,name:'',email:'',roles:[]}))throw new BankError('REQUEST_REPLAYED','Reload before continuing.',409);
  await rateLimit(req,'banking-test-admin',30,300000,proof.personId);
  if(data.action==='list'){
   const result=await db.$client.query(`SELECT u.id,u.first_name,u.last_name,u.email,
    COALESCE((SELECT json_agg(json_build_object('id',a.id,'name',a.name,'type',a.type,'status',a.status,'balance',a.balance,'currency',a.currency)) FROM accounts a WHERE a.user_id=u.id),'[]') AS accounts,
    (SELECT e.details FROM kyc_events e WHERE e.user_id=u.id AND e.event='pre_licensing_access_changed' ORDER BY e.created_at DESC,e.id DESC LIMIT 1) AS permissions,
    EXISTS(SELECT 1 FROM transactions t WHERE t.idempotency_key='pre-licensing-energize:'||u.id) AS energized
    FROM users u WHERE NOT u.suspended AND (strpos(lower(u.email),lower($1))>0 OR strpos(lower(u.first_name||' '||u.last_name),lower($1))>0) ORDER BY u.email LIMIT 100`,[data.search]);
   return Response.json({users:result.rows,fictional:true},{headers:{'Cache-Control':'no-store'}});
  }
  const target=(await db.$client.query('SELECT id FROM users WHERE id=$1 AND NOT suspended',[data.userId])).rows[0];
  if(!target)throw new BankError('CUSTOMER_UNAVAILABLE','This customer must first sign in to banking with their Citizen identity.',404);
  if(data.action==='authorize'){
   await db.transaction(async tx=>{
    await tx.execute(sql`SELECT id FROM users WHERE id=${data.userId} FOR UPDATE`);
    // No verified KYC fields, real funds or customer roles are changed.
    await tx.insert(schema.kycEvents).values({userId:data.userId,externalActorId:proof.personId,event:'pre_licensing_access_changed',details:{accounts:data.accounts,cards:data.cards,energize:data.energize,reason:data.reason,fictional:true}});
    await tx.insert(schema.notifications).values({userId:data.userId,title:'Pre-licensing test access updated',body:'Your Super Admin has updated fictional banking access. No real-money banking or KYC verification has been enabled.'});
   });
   return Response.json({ok:true,fictional:true});
  }
  let result:unknown;
  if(data.action==='open_accounts')result=await openTestingAccounts(data.userId,{actorId:proof.personId,reason:data.reason});
  else if(data.action==='energize')result=await energize(data.userId,{cents:data.cents,actorId:proof.personId,reason:data.reason});
  else result={ok:true,fictional:true,card:await orderCard(data.userId,{accountId:data.accountId,kind:data.kind,form:data.form,deliveryAddress:data.deliveryAddress},{actorId:proof.personId,reason:data.reason,requestId:data.requestId})};
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 });
}catch(error){return errorResponse(error);}}
