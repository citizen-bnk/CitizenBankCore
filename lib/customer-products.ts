import {createHash,randomInt} from 'node:crypto';
import {and,eq,isNull,sql} from 'drizzle-orm';
import {db,schema} from '@/db';
import {newAccountNumber} from './onboarding';
import {testingEnabled,testPermissions} from './prelicensing-access';
import {CUSTOMER_PRODUCTS,shouldCreateVirtualCard} from './customer-products-policy';
import {queueBankingEmail} from './banking-email';
/** One transaction serialises bootstrap, preserving closed accounts and blocked cards. */
export async function ensureCustomerProducts(userId:string){
 if(!testingEnabled())return {changed:false};
 return db.transaction(async tx=>{
  await tx.execute(sql`SELECT id FROM users WHERE id=${userId} FOR UPDATE`);
  const [user]=await tx.select({roles:schema.users.roles,suspended:schema.users.suspended}).from(schema.users).where(eq(schema.users.id,userId));
  if(!user||user.suspended||!user.roles.includes('CUSTOMER'))return {changed:false};
  const permissions=await testPermissions(userId,tx);if(!permissions.accounts)return {changed:false};
  const changed:string[]=[],newCards:string[]=[];
  for(const type of CUSTOMER_PRODUCTS){
   let [account]=await tx.select().from(schema.accounts).where(and(eq(schema.accounts.userId,userId),eq(schema.accounts.type,type))).limit(1);
   if(account?.status==='CLOSED')continue;
   if(!account){[account]=await tx.insert(schema.accounts).values({userId,type,name:type==='CURRENT'?'Cheque Account':type==='SAVINGS'?'Savings Account':'Crypto sandbox account',number:await newAccountNumber(tx,type),status:'ACTIVE',currency:'LSL'}).returning();changed.push(account.name);}
   else if(account.status==='DORMANT'){await tx.update(schema.accounts).set({status:'ACTIVE'}).where(eq(schema.accounts.id,account.id));changed.push(account.name);}
   if(!permissions.cards)continue;
   const cards=await tx.select().from(schema.cards).where(and(eq(schema.cards.accountId,account.id),isNull(schema.cards.archivedAt)));
   if(!shouldCreateVirtualCard(cards,account.allowMixedCardForms))continue;
   const date=new Date();date.setFullYear(date.getFullYear()+4);
   await tx.insert(schema.cards).values({userId,accountId:account.id,label:account.name,kind:type==='CRYPTO'?'CRYPTO':'DEBIT',brand:type==='CRYPTO'?'CRYPTO':'VISA',form:'VIRTUAL',status:'ACTIVE',last4:String(randomInt(1000,10000)),expiry:String(date.getMonth()+1).padStart(2,'0')+'/'+String(date.getFullYear()).slice(2),dailyLimit:'5000.00',monthlyLimit:'50000.00'});newCards.push(account.name);
  }
  if(changed.length||newCards.length){
   await tx.insert(schema.notifications).values({userId,title:'Your pre-licensing accounts are ready',body:'Accounts and virtual cards are ready for fictional banking. Energize your cheque account once with M5,000.'});
   await tx.insert(schema.kycEvents).values({userId,externalActorId:'customer_role_policy',event:'customer_products_prepared',details:{accounts:changed,cards:newCards,fictional:true}});
   await queueBankingEmail(tx,userId,'accounts_ready','customer-products:'+userId+':'+createHash('sha256').update(JSON.stringify({changed,newCards})).digest('hex'),{accounts:changed,cards:newCards});
  }
  return {changed:Boolean(changed.length||newCards.length)};
 });
}
