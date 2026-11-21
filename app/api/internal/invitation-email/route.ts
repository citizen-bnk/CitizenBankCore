import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const email = z.object({
  to: z.string().email().max(254),
  subject: z.string().min(1).max(200),
  html: z.string().min(1).max(100000),
  text: z.string().max(20000).optional(),
}).strict();

/** Private read-only diagnostics; never returns keys, message contents or recipient lists. */
export async function GET(request:Request){
 const secret=process.env.CITIZEN_INVITATION_EMAIL_SECRET;
 const supplied=Buffer.from(request.headers.get('authorization')||''),expected=Buffer.from(`Bearer ${secret||''}`);
 if(!secret||secret.length<32||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return Response.json({code:'ACCESS_DENIED'},{status:403});
 const key=process.env.RESEND_API_KEY;
 const messageId=new URL(request.url).searchParams.get('message_id');
 if(messageId&&!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(messageId))return Response.json({code:'INVALID_MESSAGE_ID'},{status:422});
 const headers={'Cache-Control':'private, no-store'};
 const connection={provider:'Resend',project:'citizenbankcore',service:'https://ai.citizenbank.co.ls',sender:'Citizen Bank Invitations <invitations@citizenbank.co.ls>',reply_to:'admin@citizenbank.co.ls',configured:!!key,account_label:process.env.RESEND_ACCOUNT_LABEL||null,connection_reference:key?createHash('sha256').update(key).digest('hex').slice(0,12):null,dashboard:'https://resend.com/emails'};
 if(!key)return Response.json({...connection,read_status:'not_configured'},{headers});
 try{
  const response=await fetch('https://api.resend.com/'+(messageId?'emails/'+messageId:'domains'),{headers:{Authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)return Response.json({...connection,read_status:[401,403].includes(response.status)?'read_permission_required':response.status===404?'message_not_found':'provider_unavailable'},{headers});
  const result=await response.json();
  if(messageId)return Response.json({...connection,read_status:'available',message_id:messageId,last_event:typeof result.last_event==='string'?result.last_event:'unknown'},{headers});
  const domains=Array.isArray(result.data)?result.data.map((d:{name:string;status:string})=>({name:d.name,status:d.status})):[];
  return Response.json({...connection,read_status:'available',domains},{headers});
 }catch{return Response.json({...connection,read_status:'provider_unavailable'},{headers});}
}

export async function POST(request: Request) {
  const secret = process.env.CITIZEN_INVITATION_EMAIL_SECRET;
  const supplied = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret || ''}`);
  if (!secret || secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ code: 'ACCESS_DENIED' }, { status: 403 });
  }
  const raw = await request.text();
  if (raw.length > 125000) return Response.json({ code: 'EMAIL_TOO_LARGE' }, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return Response.json({ code: 'INVALID_EMAIL_REQUEST' }, { status: 422 }); }
  const data = email.safeParse(payload);
  if (!data.success) return Response.json({ code: 'INVALID_EMAIL_REQUEST' }, { status: 422 });
  const key = process.env.RESEND_API_KEY;
  if (!key) return Response.json({ code: 'EMAIL_NOT_CONFIGURED' }, { status: 503 });
  const deliveryKey = request.headers.get('x-citizen-email-key');
  if (deliveryKey && !/^[a-zA-Z0-9:_-]{1,128}$/.test(deliveryKey)) {
    return Response.json({ code: 'INVALID_DELIVERY_KEY' }, { status: 422 });
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        ...(deliveryKey ? { 'Idempotency-Key': deliveryKey } : {}) },
      body: JSON.stringify({ ...data.data, to: [data.data.to], from: 'Citizen Bank Invitations <invitations@citizenbank.co.ls>', reply_to: 'admin@citizenbank.co.ls' }),
    });
    if (!response.ok) {
      console.warn('Invitation email provider rejected request', response.status);
      return Response.json({ code: 'EMAIL_DELIVERY_FAILED' }, { status: 502 });
    }
    const result = await response.json();
    return Response.json({ id: result.id });
  } catch {
    return Response.json({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }, { status: 503 });
  }
}
