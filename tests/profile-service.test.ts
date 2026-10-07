import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { profileProof } from "../lib/profile-service";

test("profile proof binds the verified person, method, exact body and short lifetime", () => {
  const secret="test-only-profile-proof-secret-32-characters";
  const body=JSON.stringify({phone:"+26650000001",version:2});
  const [encoded,signature]=profileProof("11111111-1111-4111-8111-111111111111","PATCH",body,secret,1800000000).split(".");
  assert.equal(signature,createHmac("sha256",secret).update(encoded).digest("base64url"));
  assert.deepEqual(JSON.parse(Buffer.from(encoded,"base64url").toString()),{
    use:"profile",sub:"11111111-1111-4111-8111-111111111111",method:"PATCH",
    body:createHash("sha256").update(body).digest("hex"),iat:1800000000,exp:1800000030,
  });
  assert.notEqual(profileProof("other","GET","",secret,1800000000),profileProof("person","GET","",secret,1800000000));
  assert.throws(()=>profileProof("person","GET","","short"));
});
