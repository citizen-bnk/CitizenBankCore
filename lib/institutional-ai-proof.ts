import {createHash} from 'node:crypto';
import {jwtVerify,type JWTVerifyGetKey,type CryptoKey,type KeyObject} from 'jose';
import {BankError} from './errors';
export async function verifyInstitutionalAI(token:string,body:string,issuer:string,keys:JWTVerifyGetKey|CryptoKey|KeyObject,now?:Date){
 try{
  const options={issuer,audience:'citizen-core-ai',algorithms:['ES256'],currentDate:now,clockTolerance:3,requiredClaims:['iat','exp','nbf','sub','jti','iss','aud']};
  const {payload:p}=await (typeof keys==='function'?jwtVerify(token,keys,options):jwtVerify(token,keys,options));
  const time=Math.floor((now?.getTime()??Date.now())/1000);
  if(p.use!=='institutional_ai'||p.body!==createHash('sha256').update(body).digest('hex')||!/^[-a-f0-9]{36}$/i.test(p.sub??'')||!/^ai:[a-f0-9]{32}$/.test(p.jti??'')||typeof p.iat!=='number'||typeof p.exp!=='number'||p.iat>time+3||p.iat<time-63||p.exp<=p.iat||p.exp-p.iat>60||!['live','demo'].includes(String(p.data_scope)))throw Error();
  return {personId:p.sub!,jti:p.jti!,expiresAt:new Date(p.exp*1000),scope:p.data_scope as 'live'|'demo'};
 }catch{throw new BankError('AI_IDENTITY_INVALID','CitizenAI access has expired. Retry from Citizen Hub.',401);}
}
