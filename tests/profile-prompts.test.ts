import { test } from "node:test";
import { strict as assert } from "node:assert";
import { questionFor, validateProfileAnswer } from "../lib/profile-prompts";

const day = "2026-10-29";
const state = { day, answered: 0, deferred: false, suppressed: [] as string[] };

test("one missing question is selected without repeating completed answers", () => {
  assert.equal(questionFor({}, state, "general", day)?.field, "phone");
  assert.equal(questionFor({ phone: "+266 5000 0000" }, state, "general", day)?.field, "employmentStatus");
});
test("skip waits until another day and suppression avoids that question", () => {
  assert.equal(questionFor({}, { ...state, deferred: true }, "general", day), null);
  assert.equal(questionFor({}, { ...state, deferred: true }, "general", "2026-10-30")?.field, "phone");
  assert.equal(questionFor({}, { ...state, suppressed: ["phone"] }, "general", day)?.field, "employmentStatus");
});
test("daily budget stops after two answers", () => {
  assert.equal(questionFor({}, { ...state, answered: 2 }, "general", day), null);
});
test("loan, insurance and investment questions appear only in context", () => {
  const p = { phone: "+266 5000 0000", employmentStatus: "full-time" };
  assert.equal(questionFor(p, state, "general", day), null);
  assert.equal(questionFor(p, state, "loans", day)?.field, "employerName");
  assert.equal(questionFor(p, state, "insurance", day)?.field, "dependants");
  assert.equal(questionFor(p, state, "investing", day)?.field, "investmentExperience");
});
test("mobile and employment answers are validated", () => {
  assert.ok(validateProfileAnswer("phone", "abc"));
  assert.equal(validateProfileAnswer("phone", "+266 5000 0000"), null);
  assert.ok(validateProfileAnswer("employmentStatus", "unknown"));
});
