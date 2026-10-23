import {errorResponse} from '@/lib/api';
import {assertOrigin} from '@/lib/passkey-auth';
/** New people register with the shared identity provider; never create password-only duplicates. */
export async function POST(req:Request){try{assertOrigin(req);const base=process.env.CITIZEN_HUB_URL||'https://hub.citizenbank.co.ls';return Response.json({code:'SHARED_REGISTRATION_REQUIRED',error:'Create or sign in to your shared Citizen account, then complete pre-licensing banking enrollment.',registration_url:base+'/register?next='+encodeURIComponent('/banking-onboarding')},{status:409,headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
