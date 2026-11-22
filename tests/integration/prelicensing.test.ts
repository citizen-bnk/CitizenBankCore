import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq,sql} from 'drizzle-orm';
import {db,schema,closeDatabases} from '../../db';
import {testPermissions,openTestingAccounts} from '../../lib/prelicensing-access';
import {requireKyc,kycState} from '../../lib/kyc';
import {energize} from '../../lib/energize';
import {orderCard} from '../../lib/banking';
test('approved live identities can exercise fictional accounts and cards without verified KYC or duplicate credits',{timeout:45000},async()=>{
 const url=new URL(process.env.DATABASE_URL||'http://invalid');
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55437');assert.equal(url.pathname,'/citizen_core_tests');
 process.env.PRELICENSING_TESTING_ENABLED='true';process.env.DEMO_MODE='false';
 const userId=randomUUID(),actor=randomUUID();
 try{
  await db.insert(schema.users).values({id:userId,email:userId+'@test.invalid',passwordHash:'unused',firstName:'Synthetic',lastName:'Test',roles:['BOARD_MEMBER']});
  await assert.rejects(()=>openTestingAccounts(userId),(e:any)=>e.code==='TEST_APPROVAL_REQUIRED');
  assert.deepEqual(await testPermissions(userId),{accounts:false,cards:false,energize:false});
  await db.insert(schema.kycEvents).values({userId,externalActorId:actor,event:'pre_licensing_access_changed',details:{accounts:true,cards:true,energize:true,reason:'Synthetic local test',fictional:true}});
  await openTestingAccounts(userId,{actorId:actor,reason:'Synthetic local test'});await openTestingAccounts(userId);
  const accounts=await db.select().from(schema.accounts).where(eq(schema.accounts.userId,userId));assert.equal(accounts.length,3);
  const current=accounts.find(a=>a.type==='CURRENT')!;
  await db.insert(schema.accounts).values({type:'INTERNAL',name:'Local test clearing',number:randomUUID().replace(/-/g,'').slice(0,10),systemCode:'CLEARING_LOCAL'}).onConflictDoNothing();
  await requireKyc(userId,'card');assert.equal(await kycState(userId),undefined);
  const credits=await Promise.all([energize(userId,{cents:500000,actorId:actor,reason:'Synthetic local test'}),energize(userId,{cents:500000,actorId:actor,reason:'Synthetic local test'})]);
  assert.equal(credits.filter(c=>'replayed'in c&&c.replayed).length,1);
  assert.equal((await db.select().from(schema.accounts).where(eq(schema.accounts.id,current.id)))[0].balance,'5000.00');
  const audit={actorId:actor,reason:'Synthetic local test',requestId:randomUUID()};
  const card=await orderCard(userId,{kind:'DEBIT',accountId:current.id,form:'VIRTUAL'},audit);
  const replay=await orderCard(userId,{kind:'DEBIT',accountId:current.id,form:'VIRTUAL'},audit);assert.equal(card.id,replay.id);
  await assert.rejects(()=>orderCard(userId,{kind:'DEBIT',accountId:current.id,form:'PHYSICAL',deliveryAddress:'12 Main Street, Maseru'}),(e:any)=>e.code==='CARD_FORM_APPROVAL_REQUIRED');
  assert.equal((await db.select().from(schema.cards).where(eq(schema.cards.userId,userId))).length,1);
  assert.equal((await db.execute(sql`SELECT sum(amount) AS total FROM ledger_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE initiated_by_id=${userId})`)).rows[0].total,'0.00');
  await db.insert(schema.kycEvents).values({userId,externalActorId:actor,event:'pre_licensing_access_changed',details:{accounts:false,cards:false,energize:false}});
  await assert.rejects(()=>requireKyc(userId,'card'),(e:any)=>e.code==='TEST_APPROVAL_REQUIRED');
  assert.equal(await kycState(userId),undefined);
 }finally{await closeDatabases();}
});
