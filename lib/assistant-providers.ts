import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BankError } from "./errors";
import type { AIConfig } from "./ai-config";

export const FLOWS = ["sendMoney", "payBills", "crossBorder", "airtime", "internalTransfer",
  "setLimit", "addBeneficiary", "orderCard", "freezeCard", "unfreezeCard"] as const;
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type AssistantInput = { messages: ChatMessage[]; language?: string;
  image?: { mediaType: string; data: string }; location?: { lat: number; lng: number } };
export type AssistantReply = { reply: string; provider?: "anthropic" | "openai";
  action?: { flow: (typeof FLOWS)[number]; prefill: Record<string, string> } };
type Context = { input: AssistantInput; system: string; tools: Anthropic.Tool[];
  runTool: (name: string, input: Record<string, unknown>) => Promise<unknown> };
type Dependencies = { fetch?: typeof fetch; anthropic?: (key: string) => Anthropic };
const proposal = z.object({ flow: z.enum(FLOWS), say: z.string().trim().min(1).max(1200),
  prefill: z.record(z.unknown()).optional() });
const MAX_ROUNDS = 5;

function action(input: unknown): AssistantReply {
  const p = proposal.parse(input);
  const prefill: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.prefill ?? {})) {
    if (/^[a-zA-Z]{1,30}$/.test(k) && (typeof v === "string" || (typeof v === "number" && Number.isFinite(v))))
      prefill[k] = String(v).slice(0, 120);
  }
  // Returning this proposal never executes a mutation. Clients still require confirmation.
  return { reply: p.say, action: { flow: p.flow, prefill } };
}
function timeout(deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Provider deadline exceeded");
  return Math.min(12_000, remaining);
}
async function readTool(ctx: Context, name: string, input: unknown) {
  if (name === "propose_action" || !ctx.tools.some((t) => t.name === name))
    return { error: "Unknown read-only tool" };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Invalid tool arguments" };
  try { return await ctx.runTool(name, input as Record<string, unknown>); }
  catch { return { error: "Banking data could not be retrieved. Do not guess the result." }; }
}
async function anthropic(ctx: Context, cfg: AIConfig, deadline: number, deps: Dependencies): Promise<AssistantReply> {
  const client = deps.anthropic?.(cfg.anthropic!) ?? new Anthropic({ apiKey: cfg.anthropic!, maxRetries: 0 });
  const messages: Anthropic.MessageParam[] = ctx.input.messages.map((m) => ({ ...m }));
  const extra: Anthropic.ContentBlockParam[] = [];
  if (ctx.input.image) extra.push({ type: "image", source: { type: "base64", media_type: ctx.input.image.mediaType as "image/png", data: ctx.input.image.data } });
  if (ctx.input.location) extra.push({ type: "text", text: `Customer shared location: ${ctx.input.location.lat}, ${ctx.input.location.lng}` });
  if (extra.length) messages[messages.length - 1].content = [...extra, { type: "text", text: ctx.input.messages.at(-1)!.content }];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await client.messages.create({ model: cfg.anthropicModel, max_tokens: 2000,
      system: ctx.system, tools: ctx.tools, messages }, { timeout: timeout(deadline) });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ").trim();
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const proposed = calls.find((c) => c.name === "propose_action");
    if (proposed) return action(proposed.input);
    if (!calls.length) {
      if (!text) throw new Error("Empty provider reply");
      return { reply: text };
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const c of calls) results.push({ type: "tool_result", tool_use_id: c.id,
      content: JSON.stringify(await readTool(ctx, c.name, c.input)) });
    messages.push({ role: "user", content: results });
  }
  throw new Error("Provider tool round limit exceeded");
}

type Output = { type: string; name?: string; call_id?: string; arguments?: string;
  content?: { type: string; text?: string; refusal?: string }[]; [key: string]: unknown };
async function openai(ctx: Context, cfg: AIConfig, deadline: number, deps: Dependencies): Promise<AssistantReply> {
  const input: unknown[] = ctx.input.messages.map((m) => ({ ...m }));
  const last: { type: string; text?: string; image_url?: string; detail?: string }[] = [{ type: "input_text", text: ctx.input.messages.at(-1)!.content }];
  if (ctx.input.image) last.push({ type: "input_image", image_url: `data:${ctx.input.image.mediaType};base64,${ctx.input.image.data}`, detail: "auto" });
  if (ctx.input.location) last.push({ type: "input_text", text: `Customer shared location: ${ctx.input.location.lat}, ${ctx.input.location.lng}` });
  input[input.length - 1] = { role: "user", content: last };
  const tools = ctx.tools.map((t) => ({ type: "function", name: t.name, description: t.description,
    parameters: t.input_schema, strict: false }));
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await (deps.fetch ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST", signal: AbortSignal.timeout(timeout(deadline)),
      headers: { Authorization: `Bearer ${cfg.openai}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.openaiModel, instructions: ctx.system, input, tools,
        store: false, include: ["reasoning.encrypted_content"], max_output_tokens: 2000, parallel_tool_calls: false }),
    });
    if (!response.ok) throw Object.assign(new Error("OpenAI unavailable"), { status: response.status });
    const res = await response.json() as { output?: Output[]; status?: string };
    if (!Array.isArray(res.output) || res.status === "failed" || res.status === "incomplete") throw new Error("Incomplete provider reply");
    const content = res.output.flatMap((o) => o.type === "message" ? o.content ?? [] : []);
    const refusal = content.find((c) => c.type === "refusal");
    if (refusal) return { reply: refusal.refusal || "I can't help with that request." };
    const calls = res.output.filter((o) => o.type === "function_call");
    const proposed = calls.find((c) => c.name === "propose_action");
    if (proposed) return action(JSON.parse(proposed.arguments ?? "{}"));
    if (!calls.length) {
      const text = content.filter((c) => c.type === "output_text").map((c) => c.text ?? "").join(" ").trim();
      if (!text) throw new Error("Empty provider reply");
      return { reply: text };
    }
    input.push(...res.output); // Preserve reasoning items as required by the Responses API.
    for (const c of calls) {
      let args: unknown;
      try { args = JSON.parse(c.arguments ?? "{}"); } catch { args = null; }
      if (!c.call_id) throw new Error("Missing tool call ID");
      input.push({ type: "function_call_output", call_id: c.call_id,
        output: JSON.stringify(await readTool(ctx, c.name ?? "", args)) });
    }
  }
  throw new Error("Provider tool round limit exceeded");
}

export async function answerWithFailover(ctx: Context, cfg: AIConfig, deps: Dependencies = {}): Promise<AssistantReply> {
  const candidates = [cfg.anthropic ? "anthropic" : null, cfg.openai ? "openai" : null].filter(Boolean) as ("anthropic" | "openai")[];
  if (!candidates.length) throw new BankError("AI_OFFLINE", "Citizen AI isn't connected yet. Please use the banking menus while we reconnect it.", 503);
  const deadline = Date.now() + 50_000;
  for (const provider of candidates) {
    try {
      const attemptDeadline = provider === "anthropic" && cfg.openai ? Math.min(deadline, Date.now() + 24_000) : deadline;
      const reply = await (provider === "anthropic" ? anthropic : openai)(ctx, cfg, attemptDeadline, deps);
      return { ...reply, provider };
    } catch (e) {
      // Do not log provider bodies, prompts, customer data, or credentials.
      console.warn("[assistant] provider unavailable", { provider, status: (e as { status?: number })?.status ?? "transport_or_response" });
    }
  }
  throw new BankError("AI_UNAVAILABLE", "I'm having trouble connecting right now. Please try again or use the banking menus.", 503);
}
