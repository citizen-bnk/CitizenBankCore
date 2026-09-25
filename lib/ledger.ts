/**
 * Double-entry posting engine.
 *
 * postTransaction() is the ONLY code path that changes account balances. It:
 *  1. locks every affected account row (SELECT … FOR UPDATE, in id order to avoid deadlocks),
 *  2. checks the legs balance to zero and that no customer account goes negative,
 *  3. writes one transactions row + one ledger_entries row per leg, and updates the cached balances,
 * all inside the caller's database transaction.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { createReference } from "./id";
import { fromCents, toCents } from "./money";
import { BankError } from "./errors";

export type Leg = { accountId: string; cents: number; narrative: string };

export type PostInput = {
  type: (typeof schema.txTypeEnum.enumValues)[number];
  description: string;
  amountCents: number;
  feeCents?: number;
  legs: Leg[];
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  initiatedById?: string | null;
  /** Backdating is only used by the seed script. */
  at?: Date;
};

export async function postTransaction(tx: Tx, input: PostInput) {
  const sum = input.legs.reduce((a, l) => a + l.cents, 0);
  if (sum !== 0) throw new Error(`Unbalanced transaction (${sum} cents)`);
  if (input.legs.some((l) => !Number.isInteger(l.cents) || l.cents === 0)) throw new Error("Invalid leg amount");

  // Idempotency backstop: if we've already posted this key, return the original.
  // Payment services call priorPosting() first, which also checks the request matches.
  if (input.idempotencyKey) {
    await lockKey(tx, input.idempotencyKey);
    const [existing] = await tx
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      if (existing.initiatedById !== (input.initiatedById ?? null)) throw idempotencyConflict();
      return existing;
    }
  }

  const ids = [...new Set(input.legs.map((l) => l.accountId))].sort();
  const locked = await tx
    .select()
    .from(schema.accounts)
    .where(inArray(schema.accounts.id, ids))
    .orderBy(schema.accounts.id)
    .for("update");
  if (locked.length !== ids.length) throw new BankError("ACCOUNT_NOT_FOUND", "One of the accounts could not be found.");

  const balances = new Map(locked.map((a) => [a.id, toCents(a.balance)]));
  const byId = new Map(locked.map((a) => [a.id, a]));

  for (const leg of input.legs) {
    const acc = byId.get(leg.accountId)!;
    if (acc.status !== "ACTIVE") throw new BankError("ACCOUNT_INACTIVE", `The ${acc.name} is not active.`);
    balances.set(leg.accountId, balances.get(leg.accountId)! + leg.cents);
  }
  for (const [accId, bal] of balances) {
    const acc = byId.get(accId)!;
    if (acc.type !== "INTERNAL" && bal < 0) {
      throw new BankError(
        "INSUFFICIENT_FUNDS",
        `Your ${acc.name} doesn't have enough available balance for this.`,
      );
    }
  }

  const [txRow] = await tx
    .insert(schema.transactions)
    .values({
      reference: createReference(),
      type: input.type,
      description: input.description,
      amount: fromCents(input.amountCents),
      fee: fromCents(input.feeCents ?? 0),
      metadata: input.metadata,
      idempotencyKey: input.idempotencyKey ?? null,
      initiatedById: input.initiatedById ?? null,
      ...(input.at ? { createdAt: input.at } : {}),
    })
    .returning();

  // Apply legs in order, recording the running balance after each.
  const running = new Map(locked.map((a) => [a.id, toCents(a.balance)]));
  for (const leg of input.legs) {
    const after = running.get(leg.accountId)! + leg.cents;
    running.set(leg.accountId, after);
    await tx.insert(schema.ledgerEntries).values({
      transactionId: txRow.id,
      accountId: leg.accountId,
      amount: fromCents(leg.cents),
      balanceAfter: fromCents(after),
      narrative: leg.narrative,
      ...(input.at ? { createdAt: input.at } : {}),
    });
  }
  for (const [accId, bal] of running) {
    await tx.update(schema.accounts).set({ balance: fromCents(bal) }).where(eq(schema.accounts.id, accId));
  }
  return txRow;
}

/** Serialises concurrent requests carrying the same key until this database transaction ends. */
async function lockKey(tx: Tx, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

const idempotencyConflict = () =>
  new BankError(
    "IDEMPOTENCY_CONFLICT",
    "This Idempotency-Key was already used for a different payment. Use a new key for a new payment.",
    409,
  );

/**
 * Idempotent replay for payment services. Call it first inside the payment's database
 * transaction, before limit checks, notifications or other side effects, so a retry
 * returns the original result instead of re-running them.
 *
 * Returns the transaction this user already posted with `key`, or null if there is none.
 * A key reused for a different payment, or another customer's key, is a 409, never a replay.
 */
export async function priorPosting(
  tx: Tx,
  key: string | undefined,
  userId: string,
  expect: { cents: number; accountIds: string[]; metadata?: Record<string, unknown> },
) {
  if (!key) return null;
  await lockKey(tx, key);
  const [existing] = await tx
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.idempotencyKey, key))
    .limit(1);
  if (!existing) return null;

  const entries = await tx
    .select({ accountId: schema.ledgerEntries.accountId })
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.transactionId, existing.id));
  const touched = new Set(entries.map((e) => e.accountId));
  const same =
    existing.initiatedById === userId &&
    toCents(existing.amount) === expect.cents &&
    expect.accountIds.every((id) => touched.has(id)) &&
    Object.entries(expect.metadata ?? {}).every(([k, v]) => existing.metadata?.[k] === v);
  if (!same) throw idempotencyConflict();
  return existing;
}

/** Resolves a bank-owned internal account by system code (created by the seed). */
export async function systemAccount(tx: Tx | typeof db, code: string) {
  const [acc] = await tx.select().from(schema.accounts).where(eq(schema.accounts.systemCode, code)).limit(1);
  if (!acc) throw new Error(`System account ${code} is missing — run the seed.`);
  return acc;
}

/** Sum of money a user has sent out today (for the daily outbound limit). */
export async function outboundTodayCents(tx: Tx, userId: string): Promise<number> {
  const res = await tx.execute(sql`
    SELECT COALESCE(SUM(-le.amount), 0)::text AS total
    FROM ledger_entries le
    JOIN accounts a ON a.id = le.account_id
    JOIN transactions t ON t.id = le.transaction_id
    WHERE a.user_id = ${userId}
      AND le.amount < 0
      AND t.type NOT IN ('INTERNAL_TRANSFER', 'FEE')
      AND le.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Maseru') AT TIME ZONE 'Africa/Maseru'
  `);
  return toCents((res.rows[0] as { total: string }).total);
}
