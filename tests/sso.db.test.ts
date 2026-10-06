import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

/**
 * Database-backed SSO tests. Run against a migrated and seeded database:
 *   DATABASE_URL=postgresql://... npm run db:migrate && npm run db:seed
 *   DATABASE_URL=postgresql://... npx tsx tests/sso.db.test.ts
 * Skipped when DATABASE_URL is not set. Every test uses fresh ids and emails, so it can be re-run.
 */
const skip = !process.env.DATABASE_URL;
type Sso = typeof import("../lib/sso");
type Dbm = typeof import("../db");
let sso: Sso, dbm: Dbm, BankError: typeof import("../lib/errors").BankError;

before(async () => {
  if (skip) return;
  sso = await import("../lib/sso");
  dbm = await import("../db");
  ({ BankError } = await import("../lib/errors"));
});
after(async () => {
  if (!skip) await (dbm.db as unknown as { $client: { end(): Promise<void> } }).$client.end();
});

const claims = (over: Partial<import("../lib/sso").HandoffClaims> = {}) => ({
  personId: randomUUID(), jti: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
  name: "Lerato Demo", email: `${randomUUID()}@demo.test`, roles: ["customer"], ...over,
});
const rejectsWith = (p: Promise<unknown>, c: string, status: number) =>
  assert.rejects(p, (e: unknown) => e instanceof BankError && e.code === c && e.status === status);
const usersWith = async (col: "personId" | "email", v: string) =>
  dbm.db.select().from(dbm.schema.users).where(eq(dbm.schema.users[col], v));
const accountsOf = (userId: string) => dbm.db.select().from(dbm.schema.accounts).where(eq(dbm.schema.accounts.userId, userId));

test("a token can be redeemed once, and only once even when raced", { skip }, async () => {
  const c = claims();
  const results = await Promise.all([sso.consumeToken(c), sso.consumeToken(c), sso.consumeToken(c)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await sso.consumeToken(c), false);
});

test("redeeming purges tokens that expired more than a day ago, and keeps recent ones", { skip }, async () => {
  const old = claims({ expiresAt: new Date(Date.now() - 3 * 86_400_000) });
  const recent = claims({ expiresAt: new Date(Date.now() - 3_600_000) });
  await dbm.db.insert(dbm.schema.ssoTokensUsed).values([{ jti: old.jti, expiresAt: old.expiresAt }, { jti: recent.jti, expiresAt: recent.expiresAt }]);
  assert.equal(await sso.consumeToken(claims()), true);
  const left = (await dbm.db.select().from(dbm.schema.ssoTokensUsed)).map((r) => r.jti);
  assert.ok(!left.includes(old.jti));
  assert.ok(left.includes(recent.jti));
});

test("first visit opens a demo customer with accounts and a demo deposit; later visits reuse it", { skip }, async () => {
  const c = claims({ name: "Lerato Mokoena Demo" });
  const first = await sso.userForHandoff(c, { demo: true });
  assert.equal(first.personId, c.personId);
  assert.equal(first.email, c.email);
  assert.deepEqual([first.firstName, first.lastName], ["Lerato", "Mokoena Demo"]);
  assert.deepEqual(first.roles, ["CUSTOMER"]);
  const accounts = await accountsOf(first.id);
  assert.deepEqual(accounts.map((a) => a.type).sort(), ["CURRENT", "SAVINGS"]);
  assert.equal(accounts.find((a) => a.type === "CURRENT")!.balance, "5000.00");
  const second = await sso.userForHandoff({ ...c, jti: randomUUID() }, { demo: true });
  assert.equal(second.id, first.id);
  assert.equal((await accountsOf(first.id)).length, 2);
});

test("outside demo mode no money is created", { skip }, async () => {
  const u = await sso.userForHandoff(claims(), { demo: false });
  assert.equal((await accountsOf(u.id)).find((a) => a.type === "CURRENT")!.balance, "0.00");
});

test("roles claimed by the website never become Core roles", { skip }, async () => {
  const u = await sso.userForHandoff(claims({ roles: ["customer", "super_admin", "back_office", "board_member"] }), { demo: false });
  assert.deepEqual(u.roles, ["CUSTOMER"]);
});

test("someone without the customer role gets no banking profile", { skip }, async () => {
  for (const roles of [[], ["investor"], ["board_member", "super_admin"]]) {
    const c = claims({ roles });
    await rejectsWith(sso.userForHandoff(c, { demo: true }), "SSO_NOT_CUSTOMER", 403);
    assert.equal((await usersWith("personId", c.personId)).length, 0);
    assert.equal((await usersWith("email", c.email)).length, 0);
  }
});

test("an existing banking profile with the same email is never adopted", { skip }, async () => {
  const c = claims({ email: "palesa@demo.citizenbank.co.ls" });
  await rejectsWith(sso.userForHandoff(c, { demo: true }), "SSO_EMAIL_IN_USE", 409);
  assert.equal((await usersWith("personId", c.personId)).length, 0);
  const [palesa] = await usersWith("email", "palesa@demo.citizenbank.co.ls");
  assert.equal(palesa.personId, null);
});

test("email addresses that are missing or malformed are refused", { skip }, async () => {
  for (const email of ["", "no-at-sign", "a@b", "x y@z.test", `${"a".repeat(250)}@x.test`]) {
    await rejectsWith(sso.userForHandoff(claims({ email }), { demo: true }), "SSO_NO_EMAIL", 422);
  }
});

test("a suspended banking profile cannot sign in through SSO", { skip }, async () => {
  const c = claims();
  const u = await sso.userForHandoff(c, { demo: false });
  await dbm.db.update(dbm.schema.users).set({ suspended: true }).where(eq(dbm.schema.users.id, u.id));
  await rejectsWith(sso.userForHandoff({ ...c, jti: randomUUID() }, { demo: false }), "SUSPENDED", 403);
});

test("two first visits at once create exactly one profile", { skip }, async () => {
  const c = claims();
  const [a, b] = await Promise.all([sso.userForHandoff(c, { demo: true }), sso.userForHandoff({ ...c, jti: randomUUID() }, { demo: true })]);
  assert.equal(a.id, b.id);
  assert.equal((await usersWith("personId", c.personId)).length, 1);
  assert.equal((await accountsOf(a.id)).length, 2);
});

test("an SSO-only profile has an unknown password, so it cannot be signed into with a password", { skip }, async () => {
  const bcrypt = await import("bcryptjs");
  const u = await sso.userForHandoff(claims(), { demo: false });
  for (const guess of ["", "password", "Citizen2026!", "Citizen-Demo-2026!"]) {
    assert.equal(await bcrypt.compare(guess, u.passwordHash), false);
  }
});

test("names without a surname still produce a valid profile", { skip }, async () => {
  const one = await sso.userForHandoff(claims({ name: "Thabo" }), { demo: false });
  assert.deepEqual([one.firstName, one.lastName], ["Thabo", "-"]);
  const local = `from-email-${randomUUID().slice(0, 8)}`;
  const none = await sso.userForHandoff(claims({ name: "", email: `${local}@demo.test` }), { demo: false });
  assert.deepEqual([none.firstName, none.lastName], [local, "-"]);
});
