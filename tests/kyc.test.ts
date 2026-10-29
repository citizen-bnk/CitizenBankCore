import { test } from "node:test";
import { strict as assert } from "node:assert";
import { kycGate } from "../lib/kyc";

const basic = { dateOfBirth: "1990-01-01", residentialAddress: "Maseru", occupation: "Teacher", idType: "National ID", idNumber: "123" };
const standard = { ...basic, idEvidenceReference: "file-1", addressEvidenceReference: "file-2", sourceOfFunds: "Salary" };

test("view access does not force the entire profile", () => {
  assert.equal(kycGate("view", {}, "NOT_STARTED").allowed, true);
});
test("investing asks for basic details only", () => {
  assert.equal(kycGate("invest", basic, "NOT_STARTED").allowed, true);
  assert.deepEqual(kycGate("invest", {}, "NOT_STARTED").missing.length, 5);
});
test("account use requires evidence and a separate approval", () => {
  assert.equal(kycGate("activate_account", basic, "APPROVED").allowed, false);
  assert.equal(kycGate("activate_account", standard, "PENDING_REVIEW").allowed, false);
  assert.equal(kycGate("activate_account", standard, "APPROVED").allowed, true);
});
test("board and cross-border actions require enhanced declarations", () => {
  assert.equal(kycGate("board_appointment", standard, "APPROVED").allowed, false);
  assert.equal(kycGate("cross_border", { ...standard, pepDeclaration: "No", taxResidence: "Lesotho", beneficialOwnershipDeclaration: "Self" }, "APPROVED").allowed, true);
});
