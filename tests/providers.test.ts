import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { answerWithFailover } from "../lib/assistant-providers";
import { speechWithFailover } from "../lib/speech-providers";
import { resolveAIConfig } from "../lib/ai-config";

const config = () => resolveAIConfig({ ANTHROPIC_API_KEY: "primary-test", OPENAI_API_KEY: "backup-test",
  ELEVENLABS_API_KEY: "voice-test", ELEVENLABS_VOICE_EN: "voice-id" });
const tools: Anthropic.Tool[] = [
  { name: "get_accounts", input_schema: { type: "object", properties: {} } },
  { name: "propose_action", input_schema: { type: "object", properties: {} } },
];
const context = (runTool = async (_name: string, _args: Record<string, unknown>): Promise<unknown> => []) => ({
  input: { messages: [{ role: "user" as const, content: "What is my balance?" }] },
  system: "Read-only banking; mutations require customer confirmation.", tools, runTool,
});
const json = (output: unknown[]) => Response.json({ status: "completed", output });
const text = (reply: string) => json([{ type: "message", content: [{ type: "output_text", text: reply }] }]);
const call = (name: string, args: unknown = {}, id = "call-1") => ({ type: "function_call", name, call_id: id, arguments: JSON.stringify(args) });
const failingAnthropic = () => ({ messages: { create: async () => { throw Object.assign(new Error("invalid credentials"), { status: 401 }); } } }) as unknown as Anthropic;

test("configured Anthropic is primary and successful replies do not call OpenAI", async () => {
  const result = await answerWithFailover(context(), config(), {
    anthropic: () => ({ messages: { create: async () => ({ content: [{ type: "text", text: "Hello Palesa." }] }) } }) as unknown as Anthropic,
    fetch: async () => { throw new Error("Backup must not be called"); },
  });
  assert.equal(result.provider, "anthropic"); assert.equal(result.reply, "Hello Palesa.");
});
test("Anthropic auth failure switches to OpenAI and retains conversation and instructions", async () => {
  const ctx = context(); ctx.input.messages.push({ role: "user", content: "And savings?" });
  const result = await answerWithFailover(ctx, config(), { anthropic: failingAnthropic,
    fetch: async (_url, request) => {
      const body = JSON.parse(request!.body as string);
      assert.equal(body.store, false); assert.equal(body.instructions, ctx.system);
      assert.equal(body.input.length, 2); assert.equal(body.tools[0].strict, false);
      assert.ok(request!.signal); return text("Your savings balance is M100.");
    },
  });
  assert.equal(result.provider, "openai");
});
test("OpenAI performs read-only tool lookup, preserves reasoning items and returns actual tool data", async () => {
  let requests = 0; let reads = 0;
  const result = await answerWithFailover(context(async (name) => {
    assert.equal(name, "get_accounts"); reads++; return [{ name: "Savings", balance: "M123.00" }];
  }), { ...config(), anthropic: undefined }, { fetch: async (_url, req) => {
    if (++requests === 1) return json([{ type: "reasoning", id: "reason-1" }, call("get_accounts")]);
    const body = JSON.parse(req!.body as string);
    assert.ok(body.input.some((i: { type: string }) => i.type === "reasoning"));
    const output = body.input.find((i: { type: string }) => i.type === "function_call_output");
    assert.equal(output.call_id, "call-1"); assert.match(output.output, /M123.00/);
    return text("Your savings balance is M123.00.");
  } });
  assert.equal(reads, 1); assert.equal(result.reply, "Your savings balance is M123.00.");
});
test("payment requests return only a sanitized proposal and never run a payment tool", async () => {
  let executed = false;
  const result = await answerWithFailover(context(async () => { executed = true; }), { ...config(), anthropic: undefined }, {
    fetch: async () => json([call("propose_action", { flow: "sendMoney", say: "Review your payment.",
      prefill: { beneficiary: "Thabo", amount: 200, nested: { unsafe: true }, "bad-key": "discard" } })]),
  });
  assert.equal(executed, false);
  assert.deepEqual(result.action, { flow: "sendMoney", prefill: { beneficiary: "Thabo", amount: "200" } });
});
test("unknown provider tool names cannot invoke a banking mutation", async () => {
  let executed = false; let round = 0;
  await answerWithFailover(context(async () => { executed = true; }), { ...config(), anthropic: undefined }, {
    fetch: async () => ++round === 1 ? json([call("execute_payment")]) : text("Please review your payment in the banking menu."),
  });
  assert.equal(executed, false);
});
test("OpenAI refusal is preserved and invalid proposals are never returned", async () => {
  const result = await answerWithFailover(context(), { ...config(), anthropic: undefined }, {
    fetch: async () => json([{ type: "message", content: [{ type: "refusal", refusal: "I cannot help with that." }] }]),
  });
  assert.equal(result.reply, "I cannot help with that.");
  await assert.rejects(answerWithFailover(context(), { ...config(), anthropic: undefined }, {
    fetch: async () => json([call("propose_action", { flow: "execute_payment", say: "Done" })]),
  }), { code: "AI_UNAVAILABLE" });
});
test("missing, rate-limited and timed-out providers return safe errors without leaking keys", async () => {
  await assert.rejects(answerWithFailover(context(), resolveAIConfig({})), { code: "AI_OFFLINE" });
  for (const backup of [async () => new Response("secret error", { status: 429 }), async () => { throw new Error("timeout backup-test"); }]) {
    await assert.rejects(answerWithFailover(context(), config(), { anthropic: failingAnthropic, fetch: backup }),
      (e: unknown) => e instanceof Error && !/secret|backup-test/.test(e.message) && "code" in e && e.code === "AI_UNAVAILABLE");
  }
});
test("voice uses ElevenLabs first without invoking OpenAI on success", async () => {
  const result = await speechWithFailover("Hello", "en", config(), async (url) => {
    assert.match(String(url), /elevenlabs/); return new Response("mp3-audio", { headers: { "content-type": "audio/mpeg" } });
  });
  assert.equal(result.headers.get("X-Voice-Provider"), "elevenlabs"); assert.ok((await result.arrayBuffer()).byteLength);
});
test("voice falls back to OpenAI for failure, missing config, or truncated audio", async () => {
  for (const mode of ["failure", "missing", "truncated"]) {
    const cfg = config(); if (mode === "missing") cfg.elevenlabs = undefined;
    const result = await speechWithFailover("Dumela", "st", cfg, async (url, req) => {
      if (String(url).includes("elevenlabs")) {
        if (mode === "truncated") return new Response("", { headers: { "content-type": "audio/mpeg" } });
        return new Response(null, { status: 503 });
      }
      const body = JSON.parse(req!.body as string);
      assert.equal(body.input, "Dumela"); assert.match(body.instructions, /Sesotho/);
      return new Response("mp3-audio", { headers: { "content-type": "audio/mpeg" } });
    });
    assert.equal(result.headers.get("X-Voice-Provider"), "openai");
    assert.equal(result.headers.get("cache-control"), "no-store");
  }
});
test("both voice services unavailable returns a recoverable error", async () => {
  await assert.rejects(speechWithFailover("Hello", "en", config(), async () => new Response(null, { status: 401 })), { code: "VOICE_UNAVAILABLE" });
  await assert.rejects(speechWithFailover("Hello", "en", resolveAIConfig({})), { code: "VOICE_OFFLINE" });
});
test("configuration accepts one recognized alias, trims values, and refuses ambiguous aliases", () => {
  assert.equal(resolveAIConfig({ bank_prod_OPENAI_API_KEY: " key " }).openai, "key");
  assert.equal(resolveAIConfig({ a_OPENAI_API_KEY: "one", b_OPENAI_API_KEY: "two" }).openai, undefined);
  assert.equal(resolveAIConfig({ ANTHROPIC_MODEL: "  " }).anthropicModel, "claude-sonnet-5");
});
