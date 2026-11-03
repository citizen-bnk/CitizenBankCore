import {errorResponse} from '@/lib/api';
import {assertOrigin} from '@/lib/passkey-auth';
/** New people register with the shared identity provider; never create password-only duplicates. */
export async function POST(req:Request){try{assertOrigin(req);const base=process.env.PLATFORM_WEBSITE_URL||'https://citizenbank.co.ls';return Response.json({code:'SHARED_REGISTRATION_REQUIRED',error:'Create your Citizen account on the website, then return to banking.',registration_url:base+'/auth/sign-up'},{status:409,headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
