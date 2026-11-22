/** Public outage classification. Never reflect provider messages or connection details. */
export const serviceTitle = 'Some services are temporarily unavailable';
export const serviceMessage = 'Sorry for the interruption. Please return later. You can still browse the Citizen Bank website.';
const codes = new Set(['DATA_QUOTA_EXHAUSTED','DATABASE_QUOTA_EXHAUSTED','DATA_CAPACITY_UNAVAILABLE','DATABASE_CAPACITY_UNAVAILABLE','DATA_CONNECTION_UNAVAILABLE','DATABASE_UNAVAILABLE','IDENTITY_AUTHORITY_UNAVAILABLE','SHARED_PROFILE_UNAVAILABLE']);
export function isServiceUnavailable(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const issue = value as {code?: unknown; issue?: unknown};
  return codes.has(String(issue.code ?? issue.issue ?? ''));
}
export function isDatabaseQuota(value: unknown): boolean {
  const visited = new Set<unknown>();
  let current = value;
  for (let i=0; i<5 && current && typeof current==='object' && !visited.has(current); i++) {
    visited.add(current);
    const issue = current as {code?:string;message?:string;cause?:unknown;sourceError?:unknown};
    if (issue.code==='53000' && /quota|allowance|compute.*limit/i.test(issue.message ?? '')) return true;
    if (/exceeded.*quota|quota.*exceeded|compute.*quota.*exhausted/i.test(issue.message ?? '')) return true;
    current=issue.cause ?? issue.sourceError;
  }
  return false;
}
