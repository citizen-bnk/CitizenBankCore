import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateKeyPair,SignJWT} from 'jose';
import {verifyCardAdministrator} from '../lib/institutional-cards-proof';
const body=JSON.stringify({action:'list'}),issuer='https://hub.example.test',now=new Date('2026-10-11T10:00:00Z'),time=now.getTime()/1000;
async function fixture(over:Record<string,unknown>={}){const keys=await generateKeyPair('ES256'),token=await new SignJWT({use:'institutional_cards',authority:'card_admin',body:createHash('sha256').update(body).digest('hex'),data_scope:'demo',sub:'11111111-1111-4111-8111-111111111111',jti:'ai:'+'a'.repeat(32),iat:time,nbf:time,exp:time+60,iss:issuer,aud:'citizen-core-cards',...over}).setProtectedHeader({alg:'ES256'}).sign(keys.privateKey);return {token,keys};}
test('card administration accepts only purpose-bound, signed administrative authority',async()=>{const f=await fixture();const proof=await verifyCardAdministrator(f.token,body,issuer,f.keys.publicKey,now);assert.equal(proof.scope,'demo');for(const over of [{use:'institutional_ai'},{authority:'customer'},{aud:'citizen-core-ai'},{data_scope:'other'},{exp:time+180},{sub:'bad'}]){const x=await fixture(over);await assert.rejects(verifyCardAdministrator(x.token,body,issuer,x.keys.publicKey,now));}await assert.rejects(verifyCardAdministrator(f.token,body+' ',issuer,f.keys.publicKey,now));});
