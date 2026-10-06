import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {eq,inArray,sql} from 'drizzle-orm';
import {db,schema} from '../../db';
import {isoCBOR} from '@simplewebauthn/server/helpers';
const origin='http://localhost:3000',host='http://localhost:4015',rp='localhost';
const b64=(b:Uint8Array)=>Buffer.from(b).toString('base64url'),hash=(b:string|Uint8Array)=>createHash('sha256').update(b).digest();
test('HTTP access: limited entry, passkey unlock, replay rejection, denied self-verification/review and revoked/idle sessions', {timeout:180_000},async()=>{
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p','4015'],{env:{...process.env,DEMO_MODE:'true',AUTH_ALLOWED_ORIGINS:origin,NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>{logs=(logs+b).slice(-8000)});child.stderr.on('data',b=>{logs=(logs+b).slice(-8000)});
 const jar=new Map<string,string>();let userId='';const adminId='api-admin-'+randomBytes(6).toString('hex');
 async function request(path:string,body?:unknown,cookies?:string,browserOrigin=origin){const response=await fetch(host+path,{method:body===undefined?'GET':'POST',headers:{Origin:browserOrigin,'Content-Type':'application/json',Cookie:cookies ?? [...jar].map(([k,v])=>`${k}=${v}`).join('; ')},body:body===undefined?undefined:JSON.stringify(body)});
 for(const c of response.headers.getSetCookie()){const pair=c.split(';')[0],at=pair.indexOf('=');const k=pair.slice(0,at),v=pair.slice(at+1);if(v)jar.set(k,v);else jar.delete(k);}return {status:response.status,body:await response.json()};}
 try{
  let ready=false;for(let i=0;i<200;i++){try{const r=await fetch(host+'/api/health');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  assert.ok(ready,logs);
  assert.equal((await request('/api/auth/explore',{},undefined,'https://attacker.invalid')).status,403);
  assert.equal((await request('/api/auth/explore',{})).status,200);
  const overview=await request('/api/me');assert.equal(overview.status,200);assert.equal(overview.body.accounts.length,0);assert.equal(overview.body.cards.length,0);userId=overview.body.user.id;
  assert.equal((await request('/api/accounts/open',{})).body.code,'KYC_REQUIRED');
  assert.equal((await request('/api/kyc',{verified:['contact','identity']})).status,422);
  assert.equal((await request('/api/kyc',{legalName:'Synthetic Explorer',email:'synthetic@example.invalid',dateOfBirth:'1990-01-01',nationality:'Test'})).status,200);
  assert.equal((await request('/api/kyc')).body.profile.verified.length,0);
  assert.equal((await request('/api/kyc/review')).status,403);
  const options=(await request('/api/auth/passkey/options',{purpose:'register'})).body;
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),id=randomBytes(32);
  const cose=isoCBOR.encode(new Map<number,any>([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x!,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y!,'base64url'))]]));
  const len=Buffer.alloc(2);len.writeUInt16BE(id.length);
  const authData=Buffer.concat([hash(rp),Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),len,id,Buffer.from(cose)]);
  const response={id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin}))),attestationObject:b64(isoCBOR.encode(new Map<string,any>([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(authData)]])))}};
  const registerCookie=[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
  assert.equal((await request('/api/auth/passkey/verify',{purpose:'register',response})).status,200);
  assert.equal((await request('/api/auth/passkey/verify',{purpose:'register',response},registerCookie)).body.code,'CHALLENGE_EXPIRED');
  const loginOptions=(await request('/api/auth/passkey/options',{purpose:'login'})).body;
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:loginOptions.challenge,origin})),counter=Buffer.alloc(4);counter.writeUInt32BE(1);
  const signedData=Buffer.concat([hash(rp),Buffer.from([5]),counter]);
  const assertion={id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{authenticatorData:b64(signedData),clientDataJSON:b64(client),signature:b64(sign('sha256',Buffer.concat([signedData,hash(client)]),privateKey)),userHandle:options.user.id}};
  assert.equal((await request('/api/auth/passkey/verify',{purpose:'login',response:assertion})).status,200);
  assert.equal((await request('/api/me')).body.user.id,userId);
  const saved=[...jar].map(([k,v])=>`${k}=${v}`).join('; ');
  await db.update(schema.authSessions).set({authenticatedAt:new Date(Date.now()-360_000)}).where(eq(schema.authSessions.userId,userId));
  assert.equal((await request('/api/accounts/open',{})).body.code,'REAUTH_REQUIRED');
  await db.update(schema.authSessions).set({lastSeenAt:new Date(Date.now()-360_000)}).where(eq(schema.authSessions.userId,userId));
  assert.equal((await request('/api/me')).status,401);
  assert.equal((await request('/api/auth/logout',{},saved)).status,200);
  assert.equal((await request('/api/me',undefined,saved)).status,401);
  const adminToken=randomBytes(32).toString('hex');
  await db.insert(schema.users).values({id:adminId,email:`${adminId}@test.invalid`,passwordHash:'unusable',firstName:'Demo',lastName:'Administrator'});
  await db.insert(schema.adminInvites).values({id:adminId,userId:adminId,tokenHash:hash(adminToken).toString('hex'),expiresAt:new Date(Date.now()+60_000)});
  assert.deepEqual((await db.select().from(schema.users).where(eq(schema.users.id,adminId)))[0].roles,['CUSTOMER']);
  assert.equal((await request('/api/auth/activate-admin',{token:'0'.repeat(64),password:'SyntheticAdminPassword123!'})).status,401);
  assert.equal((await request('/api/auth/activate-admin',{token:adminToken,password:'SyntheticAdminPassword123!'})).status,200);
  assert.ok((await request('/api/me')).body.user.roles.includes('SUPER_ADMIN'));
  assert.equal((await request('/api/auth/activate-admin',{token:adminToken,password:'SyntheticAdminPassword123!'})).status,401);
  assert.equal((await request('/api/kyc/review')).status,200);
  const profile=(await db.select().from(schema.kycProfiles).where(eq(schema.kycProfiles.userId,userId)))[0];
  assert.equal((await request('/api/kyc/review',{userId,submittedAt:profile.updatedAt.toISOString(),decision:'approve',evidence:['contact','identity'],reference:'synthetic-test-evidence',demoOnly:true})).status,200);
  assert.deepEqual((await db.select().from(schema.kycProfiles).where(eq(schema.kycProfiles.userId,userId)))[0].verified,['contact','identity']);
 }catch(e){console.error(logs);throw e;}finally{
  child.kill('SIGTERM');
  if(userId){await db.delete(schema.authSessions).where(eq(schema.authSessions.userId,userId));await db.delete(schema.authChallenges).where(eq(schema.authChallenges.userId,userId));await db.delete(schema.passkeys).where(eq(schema.passkeys.userId,userId));await db.delete(schema.kycEvents).where(eq(schema.kycEvents.userId,userId));await db.delete(schema.kycProfiles).where(eq(schema.kycProfiles.userId,userId));await db.delete(schema.users).where(eq(schema.users.id,userId));}
  await db.delete(schema.authSessions).where(eq(schema.authSessions.userId,adminId));await db.delete(schema.adminInvites).where(eq(schema.adminInvites.userId,adminId));await db.delete(schema.kycEvents).where(eq(schema.kycEvents.userId,adminId));await db.delete(schema.users).where(eq(schema.users.id,adminId));
  await (globalThis as any).__cbPool?.end();
 }
});
