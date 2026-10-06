import { z } from 'zod';
import { authed,body } from '@/lib/api';
import { kycState,submitKyc,DEMO_POLICY } from '@/lib/kyc';
import { assertOrigin } from '@/lib/passkey-auth';
const input=z.object({legalName:z.string().trim().min(2).max(150).optional(),dateOfBirth:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
 nationality:z.string().trim().min(2).max(60).optional(),email:z.string().email().max(255).optional(),phone:z.string().regex(/^\+[0-9]{8,15}$/).optional(),
 address:z.string().trim().min(8).max(300).optional(),sourceOfFunds:z.string().trim().min(3).max(250).optional()}).strict().refine(x=>Object.keys(x).length>0,'Please provide the requested details.');
export const GET=authed(async (_req,s)=>({profile:await kycState(s.userId) ?? null,policy:DEMO_POLICY,demoOnly:true,canReview:process.env.DEMO_MODE==='true' && s.roles.some(r=>['BACK_OFFICE','SUPER_ADMIN'].includes(r))}));
export const POST=authed(async (req,s)=>{assertOrigin(req);await submitKyc(s.userId,await body(req,input));return {ok:true,status:'pending',message:'Details saved for review. Submission does not verify your identity.'};});
