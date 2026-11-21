import test from 'node:test';
import assert from 'node:assert/strict';
import {isDatabaseQuota,isServiceUnavailable,serviceMessage} from '../lib/service-availability';
test('outage codes do not turn permission or feature errors into maintenance',()=>{
  for(const code of ['DATA_QUOTA_EXHAUSTED','DATABASE_QUOTA_EXHAUSTED','IDENTITY_AUTHORITY_UNAVAILABLE'])assert.equal(isServiceUnavailable({code}),true);
  for(const code of ['ACCESS_DENIED','SIGN_IN_REQUIRED','AI_CONNECTION_UNAVAILABLE','KYC_REQUIRED'])assert.equal(isServiceUnavailable({code}),false);
  assert.equal(isServiceUnavailable(null),false);
  assert.doesNotMatch(serviceMessage,/quota|database|billing|upgrade/i);
});
test('nested provider quota failures are recognised without misclassifying capacity or validation',()=>{
  assert.equal(isDatabaseQuota({cause:{code:'53000',message:'Your project has exceeded the quota'}}),true);
  assert.equal(isDatabaseQuota({sourceError:{message:'compute quota exhausted'}}),true);
  assert.equal(isDatabaseQuota({code:'53000',message:'too many connections'}),false);
  assert.equal(isDatabaseQuota({code:'23505',message:'duplicate record'}),false);
  const circular:{cause?:unknown}={};circular.cause=circular;assert.equal(isDatabaseQuota(circular),false);
});
