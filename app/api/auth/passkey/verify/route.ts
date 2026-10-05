import { z } from 'zod';
import { body,errorResponse } from '@/lib/api';
import { verifyPasskey } from '@/lib/passkey-auth';
import type {RegistrationResponseJSON,AuthenticationResponseJSON} from '@simplewebauthn/server';
export async function POST(req:Request){try{const {purpose,response}=await body(req,z.object({purpose:z.enum(['login','register','reauth']),response:z.object({id:z.string().min(1).max(2048)}).passthrough()}));return Response.json(await verifyPasskey(req,purpose,response as unknown as RegistrationResponseJSON|AuthenticationResponseJSON));}catch(e){return errorResponse(e);}}
