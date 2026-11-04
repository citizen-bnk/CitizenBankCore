import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const email = z.object({
  to: z.string().email().max(254),
  subject: z.string().min(1).max(200),
  html: z.string().min(1).max(100000),
  text: z.string().max(20000).optional(),
}).strict();

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
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
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
