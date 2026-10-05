import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assess,DEMO_POLICY} from '../lib/kyc-policy';
test('exploration never requires KYC; opening an account requires reviewed contact and identity',()=>{
 assert.equal(assess('explore',0,[]).allowed,true);
 assert.deepEqual(assess('open_account',0,[]).missing,['contact','identity']);
 assert.equal(assess('open_account',0,['contact','identity']).allowed,true);
});
test('small payments request only missing baseline evidence; threshold escalates exactly at its boundary',()=>{
 assert.deepEqual(assess('payment',99_999,['contact']).missing,['identity']);
 assert.deepEqual(assess('payment',100_000,['contact','identity']).missing,['address','source_of_funds']);
 assert.equal(assess('payment',100_000,['contact','identity','address','source_of_funds']).allowed,true);
 assert.equal(assess('payment',50,['contact','identity'],{...DEMO_POLICY,enhancedAmountCents:50}).risk,'enhanced');
});
test('cross-border and schedules cannot bypass additional checks; verified fields are not requested twice',()=>{
 assert.equal(assess('cross_border',1,['contact','identity']).allowed,false);
 assert.deepEqual(assess('cross_border',1,['contact','identity','address']).missing,['source_of_funds']);
 assert.deepEqual(assess('schedule',1,['contact','identity']).missing,['address']);
});
test('invalid amounts cannot downgrade risk',()=>{
 for(const amount of [NaN,Infinity,-1,0.5,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>assess('payment',amount,[]));
});
