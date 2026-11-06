import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/internal/invitation-email/route';

test('shared email delivery preserves idempotency and refuses untrusted requests', async () => {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.CITIZEN_INVITATION_EMAIL_SECRET;
  const originalKey = process.env.RESEND_API_KEY;
  process.env.CITIZEN_INVITATION_EMAIL_SECRET = 'test-secret-with-at-least-thirty-two-characters';
  process.env.RESEND_API_KEY = 'test-provider-key';
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    assert.equal((options!.headers as Record<string,string>)['Idempotency-Key'], 'EQ-regression');
    return Response.json({ id: 'provider-test-id' });
  };
  const request = (authorization?: string, key='EQ-regression') => new Request('https://core.test/api/internal/invitation-email', {
    method: 'POST', headers: { ...(authorization ? {authorization} : {}), 'x-citizen-email-key': key },
    body: JSON.stringify({to:'test@example.com',subject:'Test',html:'<p>Test</p>'}),
  });
  try {
    assert.equal((await POST(request())).status,403);
    const auth=`Bearer ${process.env.CITIZEN_INVITATION_EMAIL_SECRET}`;
    assert.equal((await POST(request(auth,'invalid/key'))).status,422);
    assert.equal((await POST(request(auth))).status,200);
    assert.equal(calls,1);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalSecret === undefined) delete process.env.CITIZEN_INVITATION_EMAIL_SECRET;
    else process.env.CITIZEN_INVITATION_EMAIL_SECRET=originalSecret;
    if(originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY=originalKey;
  }
});
