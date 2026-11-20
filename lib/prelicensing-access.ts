import {and,desc,eq,sql} from 'drizzle-orm';
import {db,schema,type Tx} from '@/db';
import {bankingStatus} from './banking-status';
import {BankError} from './errors';
import {newAccountNumber} from './onboarding';
export type TestPermissions={accounts:boolean;cards:boolean;energize:boolean};
export function testingEnabled(env:Record<string,string|undefined>=process.env){
  return env.PRELICENSING_TESTING_ENABLED==='true'&&bankingStatus.phase==='pre_licensing'&&bankingStatus.money==='fictional'&&!bankingStatus.realMoneyEnabled;
}
export function permissionForActivity(activity:string):keyof TestPermissions{
  return activity==='card'?'cards':activity==='energize'?'energize':'accounts';
}
export async function testPermissions(userId:string,tx:Tx|typeof db=db):Promise<TestPermissions>{
  if(!testingEnabled())return {accounts:false,cards:false,energize:false};
  const [record]=await tx.select({details:schema.kycEvents.details}).from(schema.kycEvents)
    .where(and(eq(schema.kycEvents.userId,userId),eq(schema.kycEvents.event,'pre_licensing_access_changed')))
    .orderBy(desc(schema.kycEvents.createdAt),desc(schema.kycEvents.id)).limit(1);
  const value=record?.details;
  return {accounts:value?.accounts===true,cards:value?.cards===true,energize:value?.energize===true};
}
export async function testActivityAllowed(userId:string,activity:string,tx:Tx|typeof db=db){
  return (await testPermissions(userId,tx))[permissionForActivity(activity)];
}
export async function openTestingAccounts(userId:string,audit?:{actorId:string;reason:string}){
  return db.transaction(async tx=>{
    const locked=await tx.execute(sql`SELECT id FROM users WHERE id=${userId} AND NOT suspended FOR UPDATE`);
    if(!locked.rows.length)throw new BankError('CUSTOMER_UNAVAILABLE','Choose an active banking customer.',404);
    if(!await testActivityAllowed(userId,'open_account',tx))throw new BankError('TEST_APPROVAL_REQUIRED','Super Admin approval is required for pre-licensing accounts.',403);
    for(const type of ['CURRENT','SAVINGS'] as const){
      const [account]=await tx.select().from(schema.accounts).where(and(eq(schema.accounts.userId,userId),eq(schema.accounts.type,type),sql`${schema.accounts.status}<>'CLOSED'`)).limit(1).for('update');
      if(account){if(account.status==='DORMANT')await tx.update(schema.accounts).set({status:'ACTIVE'}).where(eq(schema.accounts.id,account.id));}
      else await tx.insert(schema.accounts).values({userId,type,name:type==='CURRENT'?'Current Account':'Savings Account',number:await newAccountNumber(tx,type),status:'ACTIVE'});
    }
    if(audit)await tx.insert(schema.kycEvents).values({userId,externalActorId:audit.actorId,event:'pre_licensing_admin_action',details:{action:'open_accounts',reason:audit.reason,fictional:true}});
    return {ok:true,fictional:true};
  });
}
