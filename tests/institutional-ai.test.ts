import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateKeyPair,SignJWT} from 'jose';
import {verifyInstitutionalAI} from '../lib/institutional-ai-proof';
const issuer='https://hub.example.test',body=JSON.stringify({mode:'status'}),now=new Date('2026-10-09T10:00:00Z'),time=now.getTime()/1000;
async function fixture(over:Record<string,unknown>={}){const keys=await generateKeyPair('ES256');const token=await new SignJWT({use:'institutional_ai',body:createHash('sha256').update(body).digest('hex'),data_scope:'live',iat:time,nbf:time,exp:time+60,sub:'11111111-1111-4111-8111-111111111111',iss:issuer,aud:'citizen-core-ai',jti:'ai:'+'a'.repeat(32),...over}).setProtectedHeader({alg:'ES256'}).sign(keys.privateKey);return {token,keys};}
test('institutional AI accepts a purpose-bound signed identity without granting a banking role',async()=>{const {token,keys}=await fixture();const p=await verifyInstitutionalAI(token,body,issuer,keys.publicKey,now);assert.equal(p.scope,'live');assert.equal(p.personId,'11111111-1111-4111-8111-111111111111');assert.equal('roles' in p,false);});
test('banking tokens, altered requests, expired/future proofs and malformed scope are rejected',async()=>{for(const over of [{use:'handoff'},{aud:'banking'},{exp:time-1},{iat:time+20,exp:time+80},{exp:time+200},{data_scope:'other'},{sub:'other'},{jti:'handoff-token'}]){const {token,keys}=await fixture(over);await assert.rejects(verifyInstitutionalAI(token,body,issuer,keys.publicKey,now));}const {token,keys}=await fixture();await assert.rejects(verifyInstitutionalAI(token,body+' ',issuer,keys.publicKey,now));const other=await generateKeyPair('ES256');await assert.rejects(verifyInstitutionalAI(token,body,issuer,other.publicKey,now));});
