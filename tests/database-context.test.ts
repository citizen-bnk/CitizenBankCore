import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { withDataScope } from "../lib/execution-context";

process.env.DATABASE_URL = "postgresql://fixture@127.0.0.1:1/business";
process.env.DEMO_DATABASE_URL = "postgresql://fixture@127.0.0.1:1/fictional";
process.env.DEMO_MODE = "true";
let db: typeof import("../db").db, closeDatabases: typeof import("../db").closeDatabases;
before(async () => { ({ db, closeDatabases } = await import("../db")); });
after(() => closeDatabases());

test("concurrent scopes use distinct pools and return to the business pool", async () => {
  const business = db.$client;
  await Promise.all([
    withDataScope("demo", async () => {
      const fictional = db.$client;
      assert.notEqual(fictional, business);
      await Promise.resolve();
      assert.equal(db.$client, fictional);
      assert.equal(new URL(fictional.options.connectionString!).pathname, "/fictional");
    }),
    withDataScope("live", async () => {
      await Promise.resolve();
      assert.equal(db.$client, business);
    }),
  ]);
  assert.equal(db.$client, business);
});

test("switching demo off prevents access even to an already cached fictional pool", async () => {
  await withDataScope("demo", async () => {
    assert.ok(db.$client);
    process.env.DEMO_MODE = "false";
    try {
      assert.throws(() => db.$client, /disabled/);
    } finally {
      process.env.DEMO_MODE = "true";
    }
  });
});
