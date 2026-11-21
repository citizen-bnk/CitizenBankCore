import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../app/api/internal/invitation-email/route';
test('email diagnostics are private and never return credentials or message bodies',async()=>{
 const originalFetch=globalThis.fetch,oldSecret=process.env.CITIZEN_INVITATION_EMAIL_SECRET,oldKey=process.env.RESEND_API_KEY;
 process.env.CITIZEN_INVITATION_EMAIL_SECRET='test-shared-secret-more-than-thirty-two-characters';process.env.RESEND_API_KEY='test-provider-secret';
 const request=(query='')=>new Request('https://core.test/api/internal/invitation-email'+query,{headers:{Authorization:'Bearer '+process.env.CITIZEN_INVITATION_EMAIL_SECRET}});
 let calls=0;
 try{
  globalThis.fetch=async input=>{calls++;assert.equal(String(input),'https://api.resend.com/domains');return Response.json({data:[{name:'citizenbank.co.ls',status:'verified',internal:'private value'}]});};
  assert.equal((await GET(new Request('https://core.test/api/internal/invitation-email'))).status,403);assert.equal(calls,0);
  assert.equal((await GET(request('?message_id=invalid/id'))).status,422);assert.equal(calls,0);
  const response=await GET(request());const body=await response.json();assert.equal(body.domains[0].name,'citizenbank.co.ls');assert.equal(body.account_label,null);assert.equal(body.connection_reference.length,12);assert.doesNotMatch(JSON.stringify(body),/test-provider-secret|private value/);
  globalThis.fetch=async()=>Response.json({message:'restricted API key'},{status:403});
  const restricted=await (await GET(request())).json();assert.equal(restricted.configured,true);assert.equal(restricted.read_status,'read_permission_required');
  globalThis.fetch=async()=>Response.json({last_event:'delivered',html:'private document',to:['private@example.com']});
  const delivery=await (await GET(request('?message_id=12345678-1234-1234-1234-123456789abc'))).json();assert.equal(delivery.last_event,'delivered');assert.equal(delivery.html,undefined);assert.equal(delivery.to,undefined);
 }finally{globalThis.fetch=originalFetch;if(oldSecret===undefined)delete process.env.CITIZEN_INVITATION_EMAIL_SECRET;else process.env.CITIZEN_INVITATION_EMAIL_SECRET=oldSecret;if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;}
});
