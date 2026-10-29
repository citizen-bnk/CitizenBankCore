import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authed, body } from "@/lib/api";
import { BankError } from "@/lib/errors";
import { localDay, PROFILE_QUESTIONS, questionFor, validateProfileAnswer, type PromptContext } from "@/lib/profile-prompts";

export const dynamic = "force-dynamic";
const contexts = ["general", "loans", "insurance", "investing", "trading"] as const;

export const GET = authed(async (req, s) => {
  const context = new URL(req.url).searchParams.get("context") || "general";
  if (!contexts.includes(context as PromptContext)) throw new BankError("INVALID_CONTEXT", "Unknown profile context.", 422);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
  if (!user) throw new BankError("PROFILE_NOT_FOUND", "Your profile could not be found.", 404);
  const question = questionFor({ ...user.kycProfile, phone: user.phone ?? "" }, user.profilePromptState, context as PromptContext);
  return { question, remainingToday: user.profilePromptState.day === localDay() ? Math.max(0, 2 - user.profilePromptState.answered) : 2 };
});

export const POST = authed(async (req, s) => {
  const input = await body(req, z.discriminatedUnion("action", [
    z.object({ action: z.literal("answer"), field: z.string(), value: z.string() }),
    z.object({ action: z.literal("defer") }),
    z.object({ action: z.literal("suppress"), field: z.string() }),
    z.object({ action: z.literal("confirm_suggestion"), field: z.string(), value: z.string() }),
  ]));
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, s.userId)).limit(1).for("update");
    if (!user) throw new BankError("PROFILE_NOT_FOUND", "Your profile could not be found.", 404);
    const today = localDay();
    const state = user.profilePromptState.day === today ? user.profilePromptState : { day: today, answered: 0, deferred: false, suppressed: user.profilePromptState.suppressed ?? [] };
    if (input.action === "defer") {
      await tx.update(schema.users).set({ profilePromptState: { ...state, deferred: true } }).where(eq(schema.users.id, s.userId));
      return { ok: true, remainingToday: 0 };
    }
    if (input.action === "suppress") {
      if (!PROFILE_QUESTIONS.some((item) => item.field === input.field)) throw new BankError("INVALID_FIELD", "That profile question is unavailable.", 422);
      await tx.update(schema.users).set({ profilePromptState: { ...state, deferred: true, suppressed: [...new Set([...(state.suppressed ?? []), input.field])] } })
        .where(eq(schema.users.id, s.userId));
      return { ok: true, remainingToday: 0 };
    }
    const question = PROFILE_QUESTIONS.find((item) => item.field === input.field);
    if (!question) throw new BankError("INVALID_FIELD", "That profile question is unavailable.", 422);
    if (input.action === "answer" && (state.answered >= 2 || state.deferred)) throw new BankError("DAILY_LIMIT", "Today's profile questions are complete. You can update your profile in Settings.", 429);
    if (input.action === "confirm_suggestion" && (state.suppressed ?? []).includes(input.field))
      throw new BankError("QUESTION_SUPPRESSED", "This question was disabled in your profile preferences.", 409);
    if (input.field === "phone" ? Boolean(user.phone) : Boolean(user.kycProfile[input.field]))
      throw new BankError("ALREADY_ANSWERED", "This detail is already on your profile.", 409);
    const error = validateProfileAnswer(input.field, input.value);
    if (error) throw new BankError("INVALID_ANSWER", error, 422);
    const changes = input.field === "phone" ? { phone: input.value.trim() } : { kycProfile: { ...user.kycProfile, [input.field]: input.value.trim() } };
    await tx.update(schema.users).set({ ...changes, profilePromptState: input.action === "answer" ? { ...state, answered: state.answered + 1 } : state })
      .where(eq(schema.users.id, s.userId));
    return { ok: true, remainingToday: input.action === "answer" ? 1 - state.answered : Math.max(0, 2 - state.answered) };
  });
});
