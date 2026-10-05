import { z } from 'zod';
import { body,errorResponse } from '@/lib/api';
import { passkeyOptions } from '@/lib/passkey-auth';
export async function POST(req:Request){try{const {purpose}=await body(req,z.object({purpose:z.enum(['login','register','reauth'])}));return Response.json(await passkeyOptions(req,purpose),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
