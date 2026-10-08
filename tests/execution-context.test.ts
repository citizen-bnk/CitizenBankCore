import { test } from "node:test";
import assert from "node:assert/strict";
import { dataScope, demoDatabaseUrl, scopeFromVerifiedClaim, withDataScope } from "../lib/execution-context";

test("concurrent requests retain their own database scope and restore live after errors", async () => {
  const prior = process.env.DEMO_MODE;
  process.env.DEMO_MODE = "true";
  try {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const demo = withDataScope("demo", async () => {
      assert.equal(dataScope(), "demo");
      await gate;
      assert.equal(dataScope(), "demo");
      assert.throws(() => withDataScope("live", () => { throw new Error("test"); }));
      assert.equal(dataScope(), "demo");
    });
    await withDataScope("live", async () => {
      await Promise.resolve();
      assert.equal(dataScope(), "live");
      release();
    });
    await demo;
    assert.equal(dataScope(), "live");
  } finally {
    if (prior === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = prior;
  }
});

test("disabled and malformed signed scopes fail closed", () => {
  const prior = process.env.DEMO_MODE;
  process.env.DEMO_MODE = "false";
  try {
    assert.equal(scopeFromVerifiedClaim(undefined), "live");
    for (const value of ["demo", "admin", true, null, {}]) assert.throws(() => scopeFromVerifiedClaim(value));
    assert.throws(() => withDataScope("demo", () => "unsafe"));
  } finally {
    if (prior === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = prior;
  }
});

test("demo database must be distinct, including direct versus pooled Neon aliases", () => {
  const env = { DEMO_MODE: "true", DATABASE_URL: "postgresql://user:secret@ep-live.neon.tech/main" };
  assert.throws(() => demoDatabaseUrl(env));
  assert.throws(() => demoDatabaseUrl({ ...env, DEMO_DATABASE_URL: "postgresql://other:secret@ep-live-pooler.neon.tech/main?sslmode=require" }));
  assert.throws(() => demoDatabaseUrl({ ...env, DEMO_DATABASE_URL: "invalid-secret-value" }), e =>
    e instanceof Error && !e.message.includes("secret"));
  assert.equal(demoDatabaseUrl({ ...env, DEMO_DATABASE_URL: "postgresql://demo:password@ep-demo.neon.tech/main" }),
    "postgresql://demo:password@ep-demo.neon.tech/main");
});
