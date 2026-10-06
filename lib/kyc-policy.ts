export type Activity = 'explore' | 'open_account' | 'internal_transfer' | 'payment' | 'cross_border' | 'beneficiary' | 'card' | 'schedule';
export type Evidence = 'contact' | 'identity' | 'address' | 'source_of_funds';
export const DEMO_POLICY = { version: 'demo-2026-10-v1', enhancedAmountCents: 100_000,
  rules: { explore: [], open_account: ['contact','identity'], internal_transfer: ['contact','identity'],
    payment: ['contact','identity'], cross_border: ['contact','identity','address','source_of_funds'],
    beneficiary: ['contact','identity'], card: ['contact','identity','address'], schedule: ['contact','identity','address'] } as Record<Activity,Evidence[]> };
export function assess(activity: Activity, cents: number, verified: Evidence[], policy = DEMO_POLICY) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Invalid activity amount');
  const required = [...policy.rules[activity]];
  if (['payment','schedule'].includes(activity) && cents >= policy.enhancedAmountCents) required.push('address','source_of_funds');
  const missing = [...new Set(required)].filter(x => !verified.includes(x));
  return { activity, policyVersion: policy.version, risk: required.includes('source_of_funds') ? 'enhanced' : required.length ? 'standard' : 'low', required: [...new Set(required)], missing, allowed: missing.length === 0 };
}
