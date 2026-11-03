import {loadEnv} from './env';
loadEnv();
async function main(){
 const email=process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase(),tokenHash=process.env.SUPER_ADMIN_INVITE_HASH,deadline=process.env.SUPER_ADMIN_INVITE_EXPIRES_AT;
 if(!email || !tokenHash || !deadline || process.env.DEMO_MODE!=='true') return;
 const expiresAt=new Date(deadline);
 if(!/^[0-9a-f]{64}$/.test(tokenHash) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isFinite(expiresAt.getTime())) throw new Error('Invalid admin bootstrap configuration.');
 if(expiresAt<=new Date()) {console.log('[admin bootstrap] Invitation expired; no privilege was granted.');return;}
 const {db,schema}=await import('./index'),{eq,sql}=await import('drizzle-orm'),{createHash,randomBytes}=await import('node:crypto'),{hashPassword}=await import('../lib/auth');
 const id='admin-bootstrap-'+createHash('sha256').update(email).digest('hex').slice(0,24);
 await db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
  const [prior]=await tx.select().from(schema.adminInvites).where(eq(schema.adminInvites.id,id));
  if(prior) {console.log('[admin bootstrap] Existing invitation retained; it will not be reissued.');return;}
  let [user]=await tx.select().from(schema.users).where(eq(schema.users.email,email));
  if(!user) [user]=await tx.insert(schema.users).values({email,firstName:'KYC',lastName:'Administrator',passwordHash:await hashPassword(randomBytes(48).toString('base64url'))}).returning();
  // No elevated role until the high-entropy invitation is consumed and a password is set.
  await tx.insert(schema.adminInvites).values({id,tokenHash,userId:user.id,expiresAt});
  console.log('[admin bootstrap] Administrator profile and single-use invitation ready; activation is required.');
 });
 await (await import('./index')).closeDatabases();
}
main().catch(()=>{console.error('[admin bootstrap] Failed; no usable invitation was created.');process.exit(1)});
