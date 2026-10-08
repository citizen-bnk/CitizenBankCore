import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse, type RegistrationResponseJSON, type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { cookies } from 'next/headers';
import { and,eq,gt,sql } from 'drizzle-orm';
import { db,schema } from '@/db';
import { getSession,setSessionCookie } from './auth';
import { BankError } from './errors';
import { rateLimit } from './rate-limit';
import { SignJWT, jwtVerify } from 'jose';
import { dataScope, scopeFromVerifiedClaim, withDataScope } from './execution-context';
const COOKIE='cb_challenge';
function challengeSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('Authentication is not configured');
  return new TextEncoder().encode(secret);
}
async function readChallengeToken(token:string) {
  const {payload}=await jwtVerify(token,challengeSecret(),{algorithms:['HS256']});
  if(payload.use!=='challenge' || typeof payload.sub!=='string') throw new Error('Invalid ceremony');
  return {id:payload.sub,scope:scopeFromVerifiedClaim(payload.data_scope)};
}
export function assertOrigin(req:Request) {
  const origin=req.headers.get('origin');
  const allowed=(process.env.AUTH_ALLOWED_ORIGINS || 'https://citizenbankapp.vercel.app,https://citizeninternetbanking.vercel.app').split(',').map(x=>x.trim());
  if(process.env.NODE_ENV!=='production') allowed.push('http://localhost:3000','http://localhost:3001');
  if(!origin || !allowed.includes(origin)) throw new BankError('BAD_ORIGIN','This sign-in origin is not allowed.',403);
  return origin;
}
async function saveChallenge(challenge:string,purpose:string,origin:string,userId?:string) {
  // Expired challenges are bounded in storage; each browser retains just one active ceremony.
  const jar=await cookies(); const old=jar.get(COOKIE)?.value;
  if(old) {try{const prior=await readChallengeToken(old);if(prior.scope===dataScope()) await db.delete(schema.authChallenges).where(eq(schema.authChallenges.id,prior.id));}catch{ /* Expired ceremonies cannot be reused. */ }}
  const [row]=await db.insert(schema.authChallenges).values({challenge,purpose,origin,userId,expiresAt:new Date(Date.now()+120_000)}).returning();
  const token=await new SignJWT({use:'challenge',data_scope:dataScope()}).setProtectedHeader({alg:'HS256'}).setSubject(row.id).setIssuedAt().setExpirationTime('120s').sign(challengeSecret());
  jar.set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:120});
}
async function consumeChallenge(origin:string,purpose:string,userId?:string) {
  const jar=await cookies(); const token=jar.get(COOKIE)?.value;jar.delete(COOKIE);
  if(!token) throw new BankError('CHALLENGE_EXPIRED','Please start secure unlock again.',401);
  let id:string;
  try{const ceremony=await readChallengeToken(token);if(ceremony.scope!==dataScope()) throw new Error('Wrong context');id=ceremony.id;}catch{throw new BankError('CHALLENGE_EXPIRED','Please start secure unlock again.',401);}
  const [row]=await db.delete(schema.authChallenges).where(and(eq(schema.authChallenges.id,id),eq(schema.authChallenges.origin,origin),eq(schema.authChallenges.purpose,purpose),gt(schema.authChallenges.expiresAt,new Date()))).returning();
  if(!row || (purpose==='register' && row.userId!==userId)) throw new BankError('CHALLENGE_EXPIRED','Please start secure unlock again.',401);
  return row;
}
async function optionsInContext(req:Request,purpose:'login'|'register'|'reauth') {
  const origin=assertOrigin(req),rpID=new URL(origin).hostname;
  await rateLimit(req,'passkey-options');
  await db.execute(sql`DELETE FROM auth_challenges WHERE expires_at < now()`);
  if(purpose==='login' || purpose==='reauth') {
    const session=purpose==='reauth'?await getSession():null;
    if(purpose==='reauth' && !session) throw new BankError('UNAUTHENTICATED','Please sign in again.',401);
    const options=await generateAuthenticationOptions({rpID,userVerification:'required'});
    await saveChallenge(options.challenge,purpose,origin,session?.userId);return options;
  }
  const session=await getSession();
  if(!session || Date.now()/1000-(session.authenticatedAt ?? 0)>300) throw new BankError('REAUTH_REQUIRED','Sign in again before enabling secure unlock.',401);
  const [user]=await db.select().from(schema.users).where(eq(schema.users.id,session.userId));
  if(!user || user.suspended) throw new BankError('UNAUTHENTICATED','Please sign in again.',401);
  const keys=await db.select().from(schema.passkeys).where(and(eq(schema.passkeys.userId,user.id),eq(schema.passkeys.rpId,rpID)));
  if(keys.length>=5) throw new BankError('PASSKEY_LIMIT','You already have five secure unlock credentials for this site.',409);
  const options=await generateRegistrationOptions({rpName:'Citizen Bank',rpID,userID:new TextEncoder().encode(user.id),userName:user.email,
    userDisplayName:user.firstName,attestationType:'none',excludeCredentials:keys.map(k=>({id:k.id})),
    authenticatorSelection:{residentKey:'required',userVerification:'required'}});
  await saveChallenge(options.challenge,purpose,origin,user.id);return options;
}
async function verifyInContext(req:Request,purpose:'login'|'register'|'reauth',response:RegistrationResponseJSON|AuthenticationResponseJSON) {
  const origin=assertOrigin(req),rpID=new URL(origin).hostname;
  await rateLimit(req,'passkey-verify');
  const session=purpose==='register' ? await getSession() : null;
  const challenge=await consumeChallenge(origin,purpose,session?.userId);
  try {
    if(purpose==='register') {
      if(!session) throw new Error('Missing session');
      const verified=await verifyRegistrationResponse({response:response as RegistrationResponseJSON,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});
      if(!verified.verified || !verified.registrationInfo) throw new Error('Invalid credential');
      const credential=verified.registrationInfo.credential;
      await db.insert(schema.passkeys).values({id:credential.id,userId:session.userId,publicKey:Buffer.from(credential.publicKey).toString('base64url'),counter:credential.counter,rpId:rpID});
      return {ok:true};
    }
    const user=await db.transaction(async tx=>{
      await tx.execute(sql`SELECT id FROM passkeys WHERE id=${response.id} FOR UPDATE`);
      const [key]=await tx.select().from(schema.passkeys).where(and(eq(schema.passkeys.id,response.id),eq(schema.passkeys.rpId,rpID)));
      if(!key) throw new Error('Unknown credential');
      if(purpose==='reauth' && key.userId!==challenge.userId) throw new Error('Different account');
      const [user]=await tx.select().from(schema.users).where(eq(schema.users.id,key.userId));
      if(!user || user.suspended) throw new Error('Inactive user');
      const userHandle=(response as AuthenticationResponseJSON).response.userHandle;
      if(userHandle && Buffer.from(userHandle,'base64url').toString('utf8')!==user.id) throw new Error('Invalid user handle');
      const verified=await verifyAuthenticationResponse({response:response as AuthenticationResponseJSON,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,
        credential:{id:key.id,publicKey:new Uint8Array(Buffer.from(key.publicKey,'base64url')),counter:key.counter},requireUserVerification:true});
      if(!verified.verified) throw new Error('Invalid assertion');
      await tx.update(schema.passkeys).set({counter:verified.authenticationInfo.newCounter}).where(eq(schema.passkeys.id,key.id));
      return user;
    });
    await setSessionCookie({userId:user.id,roles:user.roles});
    return {ok:true};
  } catch {throw new BankError('PASSKEY_FAILED','Secure unlock was not completed. Please try again or use your password.',401);}
}

export async function passkeyOptions(req:Request,purpose:'login'|'register'|'reauth') {
  assertOrigin(req);
  const session=await getSession();
  return withDataScope(session?.scope ?? 'live',()=>optionsInContext(req,purpose));
}

export async function verifyPasskey(req:Request,purpose:'login'|'register'|'reauth',response:RegistrationResponseJSON|AuthenticationResponseJSON) {
  assertOrigin(req);
  const token=(await cookies()).get(COOKIE)?.value;
  if(!token) throw new BankError('CHALLENGE_EXPIRED','Please start secure unlock again.',401);
  let ceremony:Awaited<ReturnType<typeof readChallengeToken>>;
  try{ceremony=await readChallengeToken(token);}catch{throw new BankError('CHALLENGE_EXPIRED','Please start secure unlock again.',401);}
  return withDataScope(ceremony.scope,()=>verifyInContext(req,purpose,response));
}
