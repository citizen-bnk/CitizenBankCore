import {profileProof} from './profile-service';
import {BankError} from './errors';

export type IdentityAuthority={linked:true;person_id:string;provider_subject?:string;scope:'live'|'demonstration';roles:string[];email:string;credentials_revoked_before:string|null};
const websiteHosts=['https://citizenbank.co.ls','https://citizen-website-demo.vercel.app'];
const legacyHosts=['https://hub.citizenbank.co.ls','https://citizen-hub-demo.vercel.app'];

async function authorityAt(personId:string,base:string,allowed:string[],fetchImpl:typeof fetch):Promise<IdentityAuthority|null>{
 const secret=process.env.PROFILE_SERVICE_SECRET;
 if(!secret||secret.length<32||!allowed.includes(base))throw new BankError('IDENTITY_AUTHORITY_UNAVAILABLE','Current Citizen access cannot be verified. Retry shortly; no banking activity was completed.',503);
 try{
  const response=await fetchImpl(base+'/api/platform/profile-service',{headers:{'X-Citizen-Profile-Token':profileProof(personId,'GET','',secret)},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  if(response.status===404)return null;
  if(!response.ok)throw Error('Authority unavailable');
  const data=await response.json() as IdentityAuthority;
  if(data.linked!==true||data.person_id!==personId||!['live','demonstration'].includes(data.scope)||!Array.isArray(data.roles)||!data.roles.every(r=>typeof r==='string')||typeof data.email!=='string'||data.credentials_revoked_before!==null&&(!data.credentials_revoked_before||!Number.isFinite(Date.parse(data.credentials_revoked_before))))throw Error('Invalid authority response');
  return data;
 }catch{throw new BankError('IDENTITY_AUTHORITY_UNAVAILABLE','Current Citizen access could not be verified. Retry shortly; no banking activity was completed.',503);}
}

/** Existing Hub-linked sessions remain valid only while their old person ID is still verified there. */
export function readLegacyHubIdentity(personId:string,fetchImpl:typeof fetch=fetch){
 return authorityAt(personId,process.env.CITIZEN_HUB_URL||'https://hub.citizenbank.co.ls',legacyHosts,fetchImpl);
}

/** Website is authoritative for new IDs; the Hub read is temporary during verified ID migration. */
export async function readIdentityAuthority(personId:string,fetchImpl:typeof fetch=fetch):Promise<IdentityAuthority|null>{
 const website=await authorityAt(personId,process.env.PLATFORM_WEBSITE_URL||'https://citizenbank.co.ls',websiteHosts,fetchImpl);
 return website??readLegacyHubIdentity(personId,fetchImpl);
}

export function effectiveBankRoles(roles:readonly string[],identity:IdentityAuthority,scope:'live'|'demo'){
 if(identity.scope!==(scope==='demo'?'demonstration':'live'))return null;
 return [...roles];
}
export function credentialsWereRevoked(identity:IdentityAuthority,authenticatedAt:Date){return !!identity.credentials_revoked_before&&Date.parse(identity.credentials_revoked_before)>authenticatedAt.getTime();}
