import {BankError} from './errors';
/** Credentials remain server-side; the one-use handoff is still verified by Core. */
export async function sharedSignInCode(email:string,password:string,fetchImpl:typeof fetch=fetch):Promise<string>{
 const base=process.env.CITIZEN_HUB_URL||'https://hub.citizenbank.co.ls';
 if(!['https://hub.citizenbank.co.ls','https://citizen-hub-demo.vercel.app'].includes(base))throw new BankError('IDENTITY_NOT_CONFIGURED','Shared Citizen sign-in is not configured.',503);
 let cookie:string|undefined;
 try{
  const login=await fetchImpl(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({email,password}),redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!login.ok){const body=await login.json().catch(()=>({}));throw new BankError(body.code||'SIGN_IN_REJECTED',body.error||'Check your Citizen email and password, or reset your password.',login.status);}
  cookie=login.headers.getSetCookie().find(value=>value.startsWith('citizen_hub_session='))?.split(';')[0];
  if(!cookie)throw new BankError('IDENTITY_UNAVAILABLE','The identity service did not establish a valid session. Retry sign-in.',503);
  const handoff=await fetchImpl(base+'/api/platform/handoff?audience=banking',{headers:{cookie},redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(![302,303,307,308].includes(handoff.status)){const body=await handoff.json().catch(()=>({}));throw new BankError(body.code||'SIGN_IN_UNAVAILABLE',body.error||'Citizen could not connect your banking profile.',handoff.status>=400?handoff.status:503);}
  const location=handoff.headers.get('location');
  if(!location)throw new BankError('IDENTITY_UNAVAILABLE','Citizen did not supply a banking sign-in link.',503);
  const target=new URL(location);
  if(target.protocol!=='https:'||target.pathname!=='/sso')throw new BankError('IDENTITY_UNAVAILABLE','Citizen returned an invalid banking sign-in link.',503);
  const code=target.searchParams.get('code');if(!code||code.length>4096)throw new BankError('IDENTITY_UNAVAILABLE','Citizen returned an invalid banking sign-in code.',503);
  return code;
 }catch(error){if(error instanceof BankError)throw error;throw new BankError('IDENTITY_UNAVAILABLE','Shared Citizen sign-in could not be reached. Retry; no local-password fallback is used for a linked account.',503);}
 finally{if(cookie)await fetchImpl(base+'/api/auth/logout',{method:'POST',headers:{cookie,origin:base},redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(5000)}).catch(()=>{});}
}
export function usesSharedIdentity(user:{personId:string|null}|undefined){return !user||!!user.personId;}
