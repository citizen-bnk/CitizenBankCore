import {profileProof} from './profile-service';
import {BankError} from './errors';
export type IdentityAuthority={linked:true;person_id:string;scope:'live'|'demonstration';roles:string[];email:string;credentials_revoked_before:string|null};
export async function readIdentityAuthority(personId:string,fetchImpl:typeof fetch=fetch):Promise<IdentityAuthority|null>{
 const base=process.env.CITIZEN_HUB_URL||'https://hub.citizenbank.co.ls',secret=process.env.PROFILE_SERVICE_SECRET;
 if(!secret||secret.length<32||!['https://hub.citizenbank.co.ls','https://citizen-hub-demo.vercel.app'].includes(base))throw new BankError('IDENTITY_AUTHORITY_UNAVAILABLE','Current Citizen access cannot be verified. Retry shortly; no banking activity was completed.',503);
 try{const response=await fetchImpl(base+'/api/platform/profile-service',{headers:{'X-Citizen-Profile-Token':profileProof(personId,'GET','',secret)},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});if(response.status===404)return null;if(!response.ok)throw Error('Authority unavailable');const data=await response.json() as IdentityAuthority;
 if(data.linked!==true||data.person_id!==personId||!['live','demonstration'].includes(data.scope)||!Array.isArray(data.roles)||!data.roles.every(r=>typeof r==='string')||typeof data.email!=='string'||data.credentials_revoked_before!==null&&(!data.credentials_revoked_before||!Number.isFinite(Date.parse(data.credentials_revoked_before))))throw Error('Invalid authority response');return data;
 }catch{throw new BankError('IDENTITY_AUTHORITY_UNAVAILABLE','Current Citizen access could not be verified. Retry shortly; no banking activity was completed.',503);}
}
export function effectiveBankRoles(roles:readonly string[],identity:IdentityAuthority,scope:'live'|'demo'){if(identity.scope!==(scope==='demo'?'demonstration':'live'))return null;return roles.filter(role=>role!=='CUSTOMER'||identity.roles.includes('customer'));}
export function credentialsWereRevoked(identity:IdentityAuthority,authenticatedAt:Date){return !!identity.credentials_revoked_before&&Date.parse(identity.credentials_revoked_before)>authenticatedAt.getTime();}
