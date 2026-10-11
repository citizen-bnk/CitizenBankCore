import {z} from 'zod';
import {randomUUID,randomInt} from 'node:crypto';
import {readSsoConfig,remoteKeys,consumeToken} from '@/lib/sso';
import {verifyCardAdministrator} from '@/lib/institutional-cards-proof';
import {withDataScope} from '@/lib/execution-context';
import {db} from '@/db';
import {rateLimit} from '@/lib/rate-limit';
import {BankError} from '@/lib/errors';
import {errorResponse} from '@/lib/api';
const input=z.discriminatedUnion('action',[z.object({action:z.literal('list')}).strict(),z.object({action:z.enum(['restore','replace','archive']),id:z.string().uuid(),expected_status:z.enum(['ACTIVE','FROZEN','BLOCKED','ORDERED']),expected_archived:z.boolean(),reason:z.string().trim().min(10).max(1000),confirmed:z.literal(true)}).strict()]);
export async function POST(req:Request){try{
 const raw=await req.text();if(raw.length>2500)throw new BankError('VALIDATION','Shorten your recovery reason.',422);const cfg=readSsoConfig();if(!cfg)throw new BankError('CARD_SERVICE_UNAVAILABLE','Administrator card service is not configured.',503);
 const proof=await verifyCardAdministrator(req.headers.get('x-citizen-ai-token')||'',raw,cfg.issuer,remoteKeys(cfg.jwksUrl)),data=input.parse(JSON.parse(raw));
 return await withDataScope(proof.scope,async()=>{if(!await consumeToken({...proof,name:'',email:'',roles:[]}))throw new BankError('CARD_ADMIN_REPLAY','This request has already been used. Reload the card.',409);await rateLimit(req,'card-admin',30,300000,proof.personId);
 if(data.action==='list'){const result=await db.$client.query(`SELECT c.id,c.label,c.last4,c.brand,c.form,c.status,c.archived_at,c.created_at,u.first_name,u.last_name,u.email,(SELECT json_agg(json_build_object('action',h.action,'reason',h.reason,'at',h.created_at) ORDER BY h.created_at DESC) FROM card_admin_history h WHERE h.card_id=c.id) AS history FROM cards c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 200`);return Response.json({cards:result.rows,scope:proof.scope},{headers:{'Cache-Control':'no-store'}});}
 const client=await db.$client.connect();try{await client.query('BEGIN');const result=await client.query('SELECT * FROM cards WHERE id=$1 FOR UPDATE',[data.id]);const c=result.rows[0];if(!c)throw new BankError('CARD_NOT_FOUND','This card record is unavailable. Permanently deleted data requires a backup; it cannot be invented.',404);if(c.status!==data.expected_status||!!c.archived_at!==data.expected_archived)throw new BankError('CARD_CHANGED','The card changed elsewhere. Reload before continuing.',409);
 let updated;
 if(data.action==='restore'){
 if(!c.archived_at&&c.status!=='FROZEN')throw new BankError('CARD_REPLACEMENT_REQUIRED','A permanently blocked card requires replacement details. Choose Replace card.',422);
 updated=(await client.query("UPDATE cards SET archived_at=NULL,status=CASE WHEN status='FROZEN' THEN 'ACTIVE'::card_status ELSE status END WHERE id=$1 RETURNING *",[c.id])).rows[0];
 }else if(data.action==='archive'){if(c.archived_at)throw new BankError('CARD_ALREADY_ARCHIVED','This card is already archived.',409);updated=(await client.query("UPDATE cards SET archived_at=now(),status=CASE WHEN status='ACTIVE' THEN 'FROZEN'::card_status ELSE status END WHERE id=$1 RETURNING *",[c.id])).rows[0];}
 else{if(c.status!=='BLOCKED')throw new BankError('CARD_REPLACEMENT_NOT_REQUIRED','Only permanently blocked cards use this replacement action.',422);let last4;do{last4=String(randomInt(1000,10000));}while(last4===c.last4);const expiry=new Date();expiry.setFullYear(expiry.getFullYear()+4);updated=(await client.query(`INSERT INTO cards(id,user_id,account_id,label,last4,brand,kind,form,expiry,status,daily_limit,monthly_limit,delivery_address) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[randomUUID(),c.user_id,c.account_id,c.label,last4,c.brand,c.kind,c.form,`${String(expiry.getMonth()+1).padStart(2,'0')}/${String(expiry.getFullYear()).slice(-2)}`,proof.scope==='demo'||c.form==='VIRTUAL'?'ACTIVE':'ORDERED',c.daily_limit,c.monthly_limit,c.delivery_address])).rows[0];}
 await client.query('INSERT INTO card_admin_history(card_id,actor_hub_id,action,reason,previous_state,resulting_state) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[c.id,proof.personId,data.action,data.reason,JSON.stringify({status:c.status,archived:!!c.archived_at,last4:c.last4}),JSON.stringify({id:updated.id,status:updated.status,archived:!!updated.archived_at,last4:updated.last4})]);await client.query('COMMIT');return Response.json({ok:true,id:updated.id,status:updated.status},{headers:{'Cache-Control':'no-store'}});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}});
 }catch(e){return errorResponse(e);}}
