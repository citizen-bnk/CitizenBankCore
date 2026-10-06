import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";

// lib/sso imports the database module, which needs a URL to exist (it never connects in these tests).
type Sso = typeof import("../lib/sso");
type Errors = typeof import("../lib/errors");
let verifyHandoff: Sso["verifyHandoff"], readSsoConfig: Sso["readSsoConfig"], MAX_LIFETIME_SECONDS: number;
let BankError: Errors["BankError"];
let publicKey: CryptoKey, privateKey: CryptoKey, other: { privateKey: CryptoKey };

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://unused@127.0.0.1:1/unused";
  ({ verifyHandoff, readSsoConfig, MAX_LIFETIME_SECONDS } = await import("../lib/sso"));
  ({ BankError } = await import("../lib/errors"));
  ({ publicKey, privateKey } = (await generateKeyPair("ES256")) as { publicKey: CryptoKey; privateKey: CryptoKey });
  other = (await generateKeyPair("ES256")) as { privateKey: CryptoKey };
});

const ISS = "https://demo-site.example.test";
const cfg = { issuer: ISS, audiences: ["banking", "app"] };
const NOW = 1_800_000_000;
const at = (offset: number) => new Date((NOW + offset) * 1000);


async function sign(over: Record<string, unknown> = {}, opts: { key?: CryptoKey; alg?: string; kid?: string } = {}) {
  const claims = {
    iss: ISS, aud: "banking", sub: "person-1", jti: "jti-1", iat: NOW, nbf: NOW, exp: NOW + 60,
    use: "handoff", roles: ["customer"], name: "Demo Customer", email: "Demo@Example.test", ...over,
  };
  const payload = Object.fromEntries(Object.entries(claims).filter(([, v]) => v !== undefined));
  return new SignJWT(payload).setProtectedHeader({ alg: opts.alg ?? "ES256", kid: opts.kid ?? "k1" })
    .sign((opts.key ?? privateKey) as CryptoKey);
}
const rejects = (p: Promise<unknown>) =>
  assert.rejects(p, (e: unknown) => e instanceof BankError && e.code === "SSO_INVALID" && e.status === 401);

test("a token signed by the website's Python signer verifies in Core (cross-language fixture)", async () => {
  const f = JSON.parse(readFileSync(new URL("./fixtures/website-handoff.json", import.meta.url), "utf8"));
  const keys = createLocalJWKSet(f.jwks);
  const claims = await verifyHandoff(f.token, { issuer: f.issuer, audiences: ["banking", "app"] }, keys, new Date((f.issuedAt + 10) * 1000));
  assert.equal(claims.personId, "11111111-1111-4111-8111-111111111111");
  assert.equal(claims.email, "palesa@demo.test"); // lower-cased
  assert.deepEqual(claims.roles, ["customer", "investor"]);
  assert.equal(claims.expiresAt.getTime(), (f.issuedAt + 60) * 1000);
  // and the same token fails once it has expired, or before it was issued
  await rejects(verifyHandoff(f.token, { issuer: f.issuer, audiences: ["banking"] }, keys, new Date((f.issuedAt + 70) * 1000)));
  await rejects(verifyHandoff(f.token, { issuer: f.issuer, audiences: ["banking"] }, keys, new Date((f.issuedAt - 100) * 1000)));
  // wrong audience / issuer configured in Core
  await rejects(verifyHandoff(f.token, { issuer: f.issuer, audiences: ["app"] }, keys, new Date((f.issuedAt + 10) * 1000)));
  await rejects(verifyHandoff(f.token, { issuer: "https://evil.example.test", audiences: ["banking"] }, keys, new Date((f.issuedAt + 10) * 1000)));
});

test("a valid token is accepted and its claims are normalised", async () => {
  const c = await verifyHandoff(await sign(), cfg, publicKey, at(5));
  assert.deepEqual([c.personId, c.jti, c.email, c.name, c.roles], ["person-1", "jti-1", "demo@example.test", "Demo Customer", ["customer"]]);
});

test("expired, premature, wrong audience and wrong issuer are refused", async () => {
  await rejects(verifyHandoff(await sign(), cfg, publicKey, at(120)));
  await rejects(verifyHandoff(await sign(), cfg, publicKey, at(-60)));
  await rejects(verifyHandoff(await sign({ aud: "hub" }), cfg, publicKey, at(5)));
  await rejects(verifyHandoff(await sign({ iss: "https://evil.example.test" }), cfg, publicKey, at(5)));
});

test("a token signed by a different key is refused", async () => {
  await rejects(verifyHandoff(await sign({}, { key: other.privateKey }), cfg, publicKey, at(5)));
});

test("algorithm confusion is refused: HS256 and unsigned tokens", async () => {
  const jwk = await exportJWK(publicKey);
  const hs = await new SignJWT({ iss: ISS, aud: "banking", sub: "p", jti: "j", use: "handoff", roles: ["customer"] })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt(NOW).setExpirationTime(NOW + 60)
    .sign(new TextEncoder().encode(JSON.stringify(jwk)));
  await rejects(verifyHandoff(hs, cfg, publicKey, at(5)));
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "none" })}.${b64({ iss: ISS, aud: "banking", sub: "p", jti: "j", iat: NOW, exp: NOW + 60, use: "handoff", roles: ["customer"] })}.`;
  await rejects(verifyHandoff(unsigned, cfg, publicKey, at(5)));
});

test("a signed token that is not a handoff token, or is malformed, is refused", async () => {
  await rejects(verifyHandoff(await sign({ use: "session" }), cfg, publicKey, at(5)));
  await rejects(verifyHandoff(await sign({ use: undefined }), cfg, publicKey, at(5)));
  await rejects(verifyHandoff(await sign({ jti: undefined }), cfg, publicKey, at(5)));
  await rejects(verifyHandoff(await sign({ roles: "customer" }), cfg, publicKey, at(5)));
  await rejects(verifyHandoff(await sign({ roles: ["customer", 7] }), cfg, publicKey, at(5)));
  await rejects(verifyHandoff(await sign({ sub: "x".repeat(65) }), cfg, publicKey, at(5)));
  await rejects(verifyHandoff(await sign({ sub: "" }), cfg, publicKey, at(5)));
});

test("a token with an over-long lifetime is refused even though it is correctly signed", async () => {
  await rejects(verifyHandoff(await sign({ exp: NOW + MAX_LIFETIME_SECONDS + 1 }), cfg, publicKey, at(5)));
  const ok = await verifyHandoff(await sign({ exp: NOW + MAX_LIFETIME_SECONDS }), cfg, publicKey, at(5));
  assert.equal(ok.personId, "person-1");
});

test("tampering with the payload breaks the signature", async () => {
  const [h, p, s] = (await sign()).split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), roles: ["customer", "super_admin"] })).toString("base64url");
  await rejects(verifyHandoff(`${h}.${forged}.${s}`, cfg, publicKey, at(5)));
  await rejects(verifyHandoff("not-a-token", cfg, publicKey, at(5)));
});

test("every kind of failure gives the same message, so callers learn nothing about why", async () => {
  const messages = new Set<string>();
  for (const t of [await sign({ aud: "hub" }), "garbage", await sign({}, { key: other.privateKey }),
                   await sign({ iss: "https://evil.example.test" }), await sign({ use: "session" })]) {
    await assert.rejects(verifyHandoff(t, cfg, publicKey, at(5)), (e: unknown) => {
      assert.ok(e instanceof BankError);
      messages.add(e.message);
      return true;
    });
  }
  assert.equal(messages.size, 1);
});

test("in production the signing keys must be fetched over https, otherwise SSO stays off", () => {
  const base = { PLATFORM_ISSUER: "https://site.test" };
  assert.equal(readSsoConfig({ ...base, PLATFORM_JWKS_URL: "http://site.test/jwks", NODE_ENV: "production" }), null);
  assert.notEqual(readSsoConfig({ ...base, PLATFORM_JWKS_URL: "https://site.test/jwks", NODE_ENV: "production" }), null);
  assert.notEqual(readSsoConfig({ ...base, PLATFORM_JWKS_URL: "http://127.0.0.1:8001/jwks", NODE_ENV: "development" }), null);
});

test("readSsoConfig needs both a key URL and an issuer, trims, and defaults the audiences", () => {
  assert.equal(readSsoConfig({}), null);
  assert.equal(readSsoConfig({ PLATFORM_JWKS_URL: "https://x/jwks" }), null);
  assert.equal(readSsoConfig({ PLATFORM_ISSUER: "https://x" }), null);
  assert.deepEqual(readSsoConfig({ PLATFORM_JWKS_URL: " https://x/jwks ", PLATFORM_ISSUER: "https://x/// " }),
    { jwksUrl: "https://x/jwks", issuer: "https://x", audiences: ["banking", "app"] });
  assert.deepEqual(readSsoConfig({ PLATFORM_JWKS_URL: "u", PLATFORM_ISSUER: "i", SSO_AUDIENCES: "app, ,banking" })?.audiences, ["app", "banking"]);
});

