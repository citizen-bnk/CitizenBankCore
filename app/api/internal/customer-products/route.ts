import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {verifyEmailFlushProof,flushBankingEmails} from '@/lib/banking-email';
import {readIdentityAuthority} from '@/lib/identity-authority';
import {userForHandoff} from '@/lib/sso';
import {ensureCustomerProducts} from '@/lib/customer-products';
import {errorResponse} from '@/lib/api';
import {BankError} from '@/lib/errors';
import {testingEnabled} from '@/lib/prelicensing-access';
export async function POST(request:Request){try{
 const raw=await request.text();if(raw.length>2000)throw new BankError('VALIDATION','Invalid provisioning request.',422);
 const personId=verifyEmailFlushProof(request.headers.get('x-citizen-profile-token')||'',raw,'customer-products');
 const input=z.object({person_id:z.string().uuid(),name:z.string().max(210)}).strict().parse(JSON.parse(raw));
 if(personId!==input.person_id||!testingEnabled())throw new BankError('TESTING_UNAVAILABLE','Pre-licensing products are unavailable.',403);
 const identity=await readIdentityAuthority(personId);
 if(!identity||identity.scope!=='live'||!identity.roles.includes('customer'))throw new BankError('CUSTOMER_ROLE_REQUIRED','Assign the customer role first.',403);
 const user=await userForHandoff({personId,jti:randomUUID(),name:input.name,email:identity.email,roles:[],scope:'live',issuedAt:new Date(),expiresAt:new Date(Date.now()+30000)});
 await ensureCustomerProducts(user.id);await flushBankingEmails(2).catch(()=>null);
 return Response.json({ok:true,user_id:user.id,fictional:true,email_status:'queued'});
}catch(error){return errorResponse(error);}}
