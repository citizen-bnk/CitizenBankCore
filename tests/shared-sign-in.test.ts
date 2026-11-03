import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sharedSignInCode,usesSharedIdentity} from '../lib/shared-sign-in';
test('linked and new profiles use shared identity; only unlinked legacy profiles use local password',()=>{
 assert(usesSharedIdentity({personId:'shared'}));assert(usesSharedIdentity(undefined));assert(!usesSharedIdentity({personId:null}));
});
test('successful shared sign-in returns a code and revokes the temporary Hub session',async()=>{
 const calls:string[]=[];const http=(async(input:string|URL|Request)=>{const url=String(input);calls.push(url);if(url.endsWith('/login'))return new Response('{}',{headers:{'Set-Cookie':'citizen_hub_session=temporary; HttpOnly'}});if(url.includes('/handoff'))return new Response(null,{status:307,headers:{Location:'https://banking.citizenbank.co.ls/sso?code=signed-code'}});return new Response('{}');}) as typeof fetch;
 assert.equal(await sharedSignInCode('person@example.test','not-real',http),'signed-code');assert(calls.at(-1)?.endsWith('/logout'));
});
test('identity outage cannot produce a token or fall back to local password',async()=>{
 await assert.rejects(sharedSignInCode('person@example.test','not-real',(async()=>{throw Error('offline');}) as typeof fetch),/no local-password fallback/);
});
test('non-customer accounts are rejected and temporary sessions still close',async()=>{
 const calls:string[]=[];const http=(async(input:string|URL|Request)=>{const url=String(input);calls.push(url);if(url.endsWith('/login'))return new Response('{}',{headers:{'Set-Cookie':'citizen_hub_session=temporary; HttpOnly'}});if(url.includes('/handoff'))return new Response(JSON.stringify({code:'CUSTOMER_ROLE_REQUIRED',error:'A customer role is required.'}),{status:403});return new Response('{}');}) as typeof fetch;
 await assert.rejects(sharedSignInCode('person@example.test','not-real',http),/customer role/);assert(calls.at(-1)?.endsWith('/logout'));
});
