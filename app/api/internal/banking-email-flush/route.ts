import {flushBankingEmails,verifyEmailFlushProof} from '@/lib/banking-email';
import {errorResponse} from '@/lib/api';
export const maxDuration=120;
export async function POST(request:Request){try{const raw=await request.text();if(raw!=='{}')return Response.json({error:'Invalid request'},{status:422});verifyEmailFlushProof(request.headers.get('x-citizen-profile-token')||'',raw);return Response.json(await flushBankingEmails(10));}catch(error){return errorResponse(error);}}
