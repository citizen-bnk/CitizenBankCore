import {and,eq,sql} from 'drizzle-orm';
import {db,schema} from '@/db';
import {BankError} from './errors';
import {bankingStatus} from './banking-status';
import {fictionalBankingAllowed,energizeCredit} from './fictional-banking-policy';
import {profileProof} from './profile-service';
import {dataScope} from './execution-context';
import {postTransaction,systemAccount} from './ledger';
import {fromCents} from './money';
import {testActivityAllowed} from './prelicensing-access';
export const energizeKey=(userId:string)=>'pre-licensing-energize:'+userId;
async function permitted(userId:string){return (dataScope()==='demo'&&fictionalBankingAllowed(process.env.DEMO_MODE,bankingStatus))||await testActivityAllowed(userId,'energize');}
async function funding(userId:string){
 const [user]=await db.select({personId:schema.users.personId}).from(schema.users).where(eq(schema.users.id,userId));
 if(!user)throw new BankError('UNAUTHENTICATED','Sign in again.',401);
 if(!user.personId)return energizeCredit(false,[]);
 const secret=process.env.PROFILE_SERVICE_SECRET,base=process.env.CITIZEN_HUB_URL||'https://hub.citizenbank.co.ls';
 if(!secret||!['https://hub.citizenbank.co.ls','https://citizen-hub-demo.vercel.app'].includes(base))throw new BankError('INVESTMENT_SOURCE_UNAVAILABLE','Your paid investment could not be checked. No fictional credit was added. Retry.',503);
 let data:{person_id:string;scope:string;shareholder:boolean;contributions:{currency:string;amount:string}[]};
 try{
  const r=await fetch(base+'/api/platform/investment-funding',{headers:{'X-Citizen-Profile-Token':profileProof(user.personId,'GET','investment-funding',secret)},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error();data=await r.json();
  if(data.person_id!==user.personId||data.scope!==(dataScope()==='demo'?'demonstration':'live')||typeof data.shareholder!=='boolean'||!Array.isArray(data.contributions))throw Error();
 }catch{throw new BankError('INVESTMENT_SOURCE_UNAVAILABLE','Your paid investment records could not be checked. Ask the Super Admin to review the test credit; no fictional credit was added.',503);}
 try{return energizeCredit(data.shareholder,data.contributions);}catch{throw new BankError('INVESTMENT_RECONCILIATION_REQUIRED','Ask an administrator to reconcile your paid investment amount and currency before energizing. Unpaid subscriptions and bonus shares do not count.',409);}
}
export async function energizeStatus(userId:string){
 if(!await permitted(userId))return {available:false};
 const [used]=await db.select({id:schema.transactions.id}).from(schema.transactions).where(eq(schema.transactions.idempotencyKey,energizeKey(userId))).limit(1);
 if(used)return {available:false};
 try{const credit=await funding(userId);return {available:true,amount:fromCents(credit.cents),source:credit.source};}
 catch(error){return {available:true,amount:null,issue:error instanceof BankError?error.code:'INVESTMENT_SOURCE_UNAVAILABLE',message:error instanceof Error?error.message:'Retry the investment lookup.'};}
}
/** The override is supplied only by the signed Super Admin endpoint. */
export async function energize(userId:string,override?:{cents:number;actorId:string;reason:string}){
 if(!await permitted(userId))throw new BankError('FICTIONAL_CREDIT_DISABLED','Super Admin approval is required for pre-licensing fictional credit.',403);
 if(override&&(!Number.isSafeInteger(override.cents)||override.cents<=0||override.cents>100_000_000||override.reason.trim().length<10))throw new BankError('BAD_AMOUNT','Check the fictional credit amount and reason.',422);
 const [used]=await db.select().from(schema.transactions).where(eq(schema.transactions.idempotencyKey,energizeKey(userId))).limit(1);
 if(used)return {ok:true,replayed:true,amount:used.amount};
 const credit=override?{cents:override.cents,source:'super_admin_test_credit'}:await funding(userId);
 return db.transaction(async tx=>{
  const locked=await tx.execute(sql`SELECT id FROM users WHERE id=${userId} AND NOT suspended FOR UPDATE`);
  if(!locked.rows.length)throw new BankError('CUSTOMER_UNAVAILABLE','Choose an active banking customer.',404);
  if(!await testActivityAllowed(userId,'energize',tx)&&!(dataScope()==='demo'&&fictionalBankingAllowed(process.env.DEMO_MODE,bankingStatus)))throw new BankError('FICTIONAL_CREDIT_DISABLED','Test access changed. Reload before continuing.',403);
  const [prior]=await tx.select().from(schema.transactions).where(eq(schema.transactions.idempotencyKey,energizeKey(userId))).limit(1);
  if(prior)return {ok:true,replayed:true,amount:prior.amount};
  const [account]=await tx.select().from(schema.accounts).where(and(eq(schema.accounts.userId,userId),eq(schema.accounts.type,'CURRENT'),eq(schema.accounts.status,'ACTIVE'))).orderBy(schema.accounts.createdAt).limit(1);
  if(!account||account.currency!=='LSL')throw new BankError('ENERGIZE_ACCOUNT_REQUIRED','Open an active pre-licensing transactional account first.',409);
  const clearing=await systemAccount(tx,'CLEARING_LOCAL');
  const transaction=await postTransaction(tx,{type:'DEPOSIT',description:'Energize account — fictional pre-licensing credit',amountCents:credit.cents,initiatedById:userId,idempotencyKey:energizeKey(userId),metadata:{kind:'pre_licensing_energize',fictional:true,source:credit.source,...(override?{approvedBy:override.actorId,reason:override.reason}:{investmentSnapshot:fromCents(credit.cents)})},legs:[{accountId:clearing.id,cents:-credit.cents,narrative:'Fictional pre-licensing credit'},{accountId:account.id,cents:credit.cents,narrative:'Energize account — fictional money'}]});
  await tx.insert(schema.notifications).values({userId,title:'Account energized',body:'One-time fictional credit added. This is not a real deposit or an investment refund.'});
  return {ok:true,amount:fromCents(credit.cents),transactionId:transaction.id,fictional:true};
 });
}
