import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SignJWT } from "jose";

process.env.AUTH_SECRET = "test-only-secret-for-idle-session-checks-12345";
process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test";
const key = new TextEncoder().encode(process.env.AUTH_SECRET);

test("an active signed session is accepted", async () => {
  const { createSessionToken, verifySessionToken } = await import("../lib/auth");
  const token = await createSessionToken({ userId: "customer-1", roles: ["CUSTOMER"] });
  assert.equal((await verifySessionToken(token))?.userId, "customer-1");
});
test("a signed session idle beyond ten minutes is rejected", async () => {
  const { verifySessionToken } = await import("../lib/auth");
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ roles: ["CUSTOMER"], startedAt: now - 700 })
    .setProtectedHeader({ alg: "HS256" }).setSubject("customer-1")
    .setIssuedAt(now - 700).setExpirationTime(now + 3600).sign(key);
  assert.equal(await verifySessionToken(token), null);
});
test("renewing activity preserves the absolute session start", async () => {
  const { createSessionToken, verifySessionToken } = await import("../lib/auth");
  const now = Math.floor(Date.now() / 1000);
  const token = await createSessionToken({ userId: "customer-1", roles: ["CUSTOMER"], startedAt: now - 120 });
  assert.equal((await verifySessionToken(token))?.startedAt, now - 120);
});
