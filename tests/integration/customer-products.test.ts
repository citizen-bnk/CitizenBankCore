import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq,sql} from 'drizzle-orm';
import {db,schema,closeDatabases} from '../../db';
import {createId} from '../../lib/id';
import {ensureCustomerProducts} from '../../lib/customer-products';
import {energize} from '../../lib/energize';
import {testPermissions} from '../../lib/prelicensing-access';

test('customer role provisions three products and virtual cards once, then energizes exactly once',{timeout:45000},async()=>{
 const url=new URL(process.env.DATABASE_URL||'http://invalid');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55437');assert.equal(url.pathname,'/citizen_core_tests');
 process.env.PRELICENSING_TESTING_ENABLED='true';process.env.DEMO_MODE='false';
 const userId=createId();
 try{
  await db.insert(schema.users).values({id:userId,personId:randomUUID(),email:userId+'@test.invalid',passwordHash:'unused',firstName:'Synthetic',lastName:'Customer',roles:['CUSTOMER']});
  assert.deepEqual(await testPermissions(userId),{accounts:true,cards:true,energize:true});
  const bootstrap=await Promise.all([ensureCustomerProducts(userId),ensureCustomerProducts(userId)]);
  assert.equal(bootstrap.filter(r=>r.changed).length,1);
  const accounts=await db.select().from(schema.accounts).where(eq(schema.accounts.userId,userId));
  assert.deepEqual(accounts.map(a=>a.type).sort(),['CRYPTO','CURRENT','SAVINGS']);
  const cards=await db.select().from(schema.cards).where(eq(schema.cards.userId,userId));assert.equal(cards.length,3);assert.ok(cards.every(c=>c.form==='VIRTUAL'));
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM banking_email_outbox WHERE user_id=${userId}`)).rows[0].n,1);
  await db.insert(schema.accounts).values({type:'INTERNAL',name:'Local clearing',number:randomUUID().replace(/-/g,'').slice(0,10),systemCode:'CLEARING_LOCAL'}).onConflictDoNothing();
  const credits=await Promise.all([energize(userId),energize(userId)]);assert.equal(credits.filter(r=>'replayed' in r&&r.replayed).length,1);
  const current=accounts.find(a=>a.type==='CURRENT')!;assert.equal((await db.select().from(schema.accounts).where(eq(schema.accounts.id,current.id)))[0].balance,'5000.00');
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM banking_email_outbox WHERE user_id=${userId}`)).rows[0].n,2);
  assert.equal((await db.execute(sql`SELECT sum(amount) AS n FROM ledger_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE initiated_by_id=${userId})`)).rows[0].n,'0.00');
  await db.insert(schema.kycEvents).values({userId,actorId:userId,event:'pre_licensing_access_changed',details:{accounts:false,cards:false,energize:false}});
  assert.deepEqual(await testPermissions(userId),{accounts:false,cards:false,energize:false});
 }finally{
  await db.execute(sql`DELETE FROM banking_email_outbox WHERE user_id=${userId}`);
  await db.execute(sql`DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE initiated_by_id=${userId})`);
  await db.execute(sql`DELETE FROM transactions WHERE initiated_by_id=${userId}`);
  await db.execute(sql`DELETE FROM notifications WHERE user_id=${userId}`);
  await db.execute(sql`DELETE FROM kyc_events WHERE user_id=${userId}`);
  await db.execute(sql`DELETE FROM cards WHERE user_id=${userId}`);
  await db.execute(sql`DELETE FROM accounts WHERE user_id=${userId}`);
  await db.execute(sql`DELETE FROM users WHERE id=${userId}`);
  await closeDatabases();
 }
});
