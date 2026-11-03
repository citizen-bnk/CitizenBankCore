import {bankingStatus} from './banking-status';
import {fictionalBankingAllowed,declaredSimulationChecks} from './fictional-banking-policy';
import { eq, sql } from 'drizzle-orm';
import { db, schema, type Tx } from '@/db';
import { BankError } from './errors';
import { dataScope } from './execution-context';
import { assess, DEMO_POLICY, type Activity, type Evidence } from './kyc-policy';
export { assess, DEMO_POLICY };
export class KycRequired extends BankError {
  constructor(public assessment: ReturnType<typeof assess>) { super('KYC_REQUIRED', assessment.activity==='card'?'Complete your pre-licensing profile checks before adding a card. No card was created.':assessment.activity==='open_account'?'Complete your pre-licensing profile checks before opening an account.':'Complete your pre-licensing profile checks. No fictional payment was sent.', 403); }
}
export async function kycState(userId: string, tx: Tx | typeof db = db) {
  const [record] = await tx.select().from(schema.kycProfiles).where(eq(schema.kycProfiles.userId,userId)).limit(1);
  return record;
}
export async function requireKyc(userId: string, activity: Activity, cents = 0, tx: Tx | typeof db = db) {
  // All released banking is fictional, including live-profile customers. No real-money policy is enabled.
  if (!fictionalBankingAllowed(process.env.DEMO_MODE,bankingStatus)) throw new BankError('POLICY_NOT_APPROVED','Real-money activities are unavailable. This policy is for demonstration only.',403);
  await tx.execute(sql`SELECT user_id FROM kyc_profiles WHERE user_id=${userId} FOR SHARE`);
  const [user] = await tx.select({suspended:schema.users.suspended,email:schema.users.email}).from(schema.users).where(eq(schema.users.id,userId));
  if (!user || user.suspended) throw new BankError('UNAUTHENTICATED','Please sign in again.',401);
  const record = await kycState(userId,tx);
  // Simulation declarations enable fictional exercises only; persisted verification is never modified.
  const verified = [...new Set([...(record?.validUntil&&record.validUntil>new Date()?record.verified:[]),...declaredSimulationChecks(record?.declared||{},user.email)])];
  const configured = Number(process.env.KYC_DEMO_ENHANCED_AMOUNT_CENTS ?? DEMO_POLICY.enhancedAmountCents);
  const threshold = Number.isSafeInteger(configured) && configured > 0 ? configured : DEMO_POLICY.enhancedAmountCents;
  const result = assess(activity,cents,verified,{...DEMO_POLICY,version:`${DEMO_POLICY.version}-${threshold}`,enhancedAmountCents:threshold});
  if (!result.allowed) throw new KycRequired(result);
}
export async function submitKyc(userId:string, data: Record<string,string>) {
  // Only self-declared fields. No client can assign verified evidence or a risk tier.
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT id FROM users WHERE id=${userId} FOR UPDATE`);
    await tx.execute(sql`SELECT user_id FROM kyc_profiles WHERE user_id=${userId} FOR UPDATE`);
    const prior=await kycState(userId,tx);
    const merged={...(prior?.declared ?? {}),...data};
    const changed=Object.keys(data).filter(k=>prior?.declared?.[k]!==data[k]);
    const mapping:Record<string,Evidence>={email:'contact',phone:'contact',legalName:'identity',dateOfBirth:'identity',nationality:'identity',address:'address',sourceOfFunds:'source_of_funds'};
    const invalidated=new Set(changed.map(k=>mapping[k]));
    const verified=(prior?.verified ?? []).filter(x=>!invalidated.has(x));
    await tx.insert(schema.kycProfiles).values({userId,declared:merged,verified,status:'pending',updatedAt:new Date()})
      .onConflictDoUpdate({target:schema.kycProfiles.userId,set:{declared:merged,verified,status:'pending',updatedAt:new Date()}});
    await tx.insert(schema.kycEvents).values({userId,actorId:userId,event:'submitted',details:{fields:changed,policyVersion:DEMO_POLICY.version}});
  });
}
