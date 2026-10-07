import { createHash, createHmac } from "node:crypto";

export function profileProof(personId: string, method: "GET" | "PATCH", body: string, secret: string, now = Math.floor(Date.now()/1000)) {
  if (secret.length < 32) throw new Error("Profile service is not configured");
  const payload = Buffer.from(JSON.stringify({ use:"profile", sub:personId, method, body:createHash("sha256").update(body).digest("hex"), iat:now, exp:now+30 })).toString("base64url");
  return payload + "." + createHmac("sha256",secret).update(payload).digest("base64url");
}
