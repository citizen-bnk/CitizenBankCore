import test from 'node:test';
import assert from 'node:assert/strict';
import {testingInput} from '../lib/testing-input';
test('test authorisation requires explicit confirmation, permissions and a reason',()=>{
 const base={action:'authorize',userId:'11111111-1111-4111-8111-111111111111',reason:'Investor testing approved',confirmed:true,accounts:true,cards:true,energize:true};
 assert.ok(testingInput.safeParse(base).success);
 for(const change of [{confirmed:false},{reason:''},{userId:'another user'},{admin:true},{realMoney:true}])assert.equal(testingInput.safeParse({...base,...change}).success,false);
});
test('energize accepts bounded integer cents and cannot smuggle transaction authority',()=>{
 const base={action:'energize',userId:'11111111-1111-4111-8111-111111111111',reason:'Investor testing approved',confirmed:true,cents:500000};
 assert.ok(testingInput.safeParse(base).success);
 for(const cents of [0,-1,0.1,NaN,100000001])assert.equal(testingInput.safeParse({...base,cents}).success,false);
 assert.equal(testingInput.safeParse({...base,actorId:'forged'}).success,false);
});
