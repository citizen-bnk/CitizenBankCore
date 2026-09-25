/**
 * Citizen Bank — core data model (Drizzle ORM / Postgres).
 *
 * accounts + ledger_entries form a double-entry ledger: every transaction
 * writes entries that sum to zero, and accounts.balance is a cached running
 * total that is only changed inside the same DB transaction (see lib/ledger.ts).
 */
import {
  pgTable, pgEnum, text, varchar, numeric, boolean, timestamp, integer,
  jsonb, doublePrecision, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { createId } from "../lib/id";

const id = () => text("id").primaryKey().$defaultFn(createId);
const money = (name: string) => numeric(name, { precision: 18, scale: 2 });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["CUSTOMER", "BOARD_MEMBER", "BACK_OFFICE", "SUPER_ADMIN"]);
export const accountTypeEnum = pgEnum("account_type", ["CURRENT", "SAVINGS", "FIXED_DEPOSIT", "INTERNAL"]);
export const accountStatusEnum = pgEnum("account_status", ["ACTIVE", "DORMANT", "CLOSED"]);
export const txTypeEnum = pgEnum("tx_type", [
  "INTERNAL_TRANSFER", // between a customer's own accounts
  "TRANSFER", // to another Citizen Bank customer
  "EXTERNAL_TRANSFER", // to another bank in Lesotho
  "INTERNATIONAL", // cross-border wire
  "BILL_PAYMENT",
  "AIRTIME",
  "DEPOSIT",
  "FEE",
  "LOAN_REPAYMENT",
]);
export const txStatusEnum = pgEnum("tx_status", ["PENDING", "COMPLETED", "FAILED", "REVERSED"]);
export const beneficiaryTypeEnum = pgEnum("beneficiary_type", ["CITIZEN", "LOCAL", "INTERNATIONAL"]);
export const cardKindEnum = pgEnum("card_kind", ["DEBIT", "CREDIT", "CRYPTO"]);
export const cardFormEnum = pgEnum("card_form", ["VIRTUAL", "PHYSICAL"]);
export const cardStatusEnum = pgEnum("card_status", ["ACTIVE", "FROZEN", "BLOCKED", "ORDERED"]);
export const frequencyEnum = pgEnum("frequency", ["ONCE", "WEEKLY", "MONTHLY", "QUARTERLY"]);
export const loanTypeEnum = pgEnum("loan_type", ["PERSONAL", "BUSINESS", "MORTGAGE", "VEHICLE", "EDUCATION"]);

export const users = pgTable("users", {
  id: id(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  roles: roleEnum("roles").array().notNull().default(["CUSTOMER"]),
  preferredLanguage: varchar("preferred_language", { length: 5 }).notNull().default("en"),
  preferredTheme: varchar("preferred_theme", { length: 10 }).notNull().default("dark"),
  suspended: boolean("suspended").notNull().default(false),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const accounts = pgTable("accounts", {
  id: id(),
  number: varchar("number", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  type: accountTypeEnum("type").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("LSL"),
  balance: money("balance").notNull().default("0"),
  status: accountStatusEnum("status").notNull().default("ACTIVE"),
  interestRate: numeric("interest_rate", { precision: 5, scale: 2 }),
  maturesAt: timestamp("matures_at", { withTimezone: true }),
  /** Bank-owned INTERNAL accounts carry a stable code, e.g. CLEARING_LOCAL. */
  systemCode: varchar("system_code", { length: 50 }).unique(),
  userId: text("user_id").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("accounts_user_idx").on(t.userId)]);

export const transactions = pgTable("transactions", {
  id: id(),
  reference: varchar("reference", { length: 30 }).notNull().unique(),
  type: txTypeEnum("type").notNull(),
  status: txStatusEnum("status").notNull().default("COMPLETED"),
  description: text("description").notNull(),
  amount: money("amount").notNull(),
  fee: money("fee").notNull().default("0"),
  currency: varchar("currency", { length: 3 }).notNull().default("LSL"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  /** Makes client retries safe: the same key never posts twice. */
  idempotencyKey: varchar("idempotency_key", { length: 80 }).unique(),
  initiatedById: text("initiated_by_id").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("tx_initiator_idx").on(t.initiatedById, t.createdAt)]);

export const ledgerEntries = pgTable("ledger_entries", {
  id: id(),
  /** Negative = debit (money out), positive = credit (money in). */
  amount: money("amount").notNull(),
  balanceAfter: money("balance_after").notNull(),
  narrative: text("narrative").notNull(),
  transactionId: text("transaction_id").notNull().references(() => transactions.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  createdAt: createdAt(),
}, (t) => [index("entries_account_idx").on(t.accountId, t.createdAt)]);

export const beneficiaries = pgTable("beneficiaries", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  type: beneficiaryTypeEnum("type").notNull(),
  bankName: varchar("bank_name", { length: 120 }).notNull(),
  accountNumber: varchar("account_number", { length: 40 }).notNull(),
  branchCode: varchar("branch_code", { length: 20 }),
  /** ISO-3166 alpha-2, for INTERNATIONAL beneficiaries. */
  country: varchar("country", { length: 2 }),
  swift: varchar("swift", { length: 11 }),
  lastPaidAt: timestamp("last_paid_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("beneficiary_unique").on(t.userId, t.bankName, t.accountNumber)]);

export const billers = pgTable("billers", {
  id: id(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  /** ELECTRICITY | WATER | TELECOM | TV | INSURANCE | EDUCATION | GOVERNMENT */
  category: varchar("category", { length: 20 }).notNull(),
  refLabel: varchar("ref_label", { length: 60 }).notNull().default("Account number"),
  isAirtime: boolean("is_airtime").notNull().default(false),
  active: boolean("active").notNull().default(true),
  settlementAccountId: text("settlement_account_id").notNull().references(() => accounts.id),
});

export const scheduledPayments = pgTable("scheduled_payments", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  amount: money("amount").notNull(),
  frequency: frequencyEnum("frequency").notNull(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  reference: varchar("reference", { length: 60 }),
  fromAccountId: text("from_account_id").notNull().references(() => accounts.id),
  beneficiaryId: text("beneficiary_id").references(() => beneficiaries.id, { onDelete: "set null" }),
  billerId: text("biller_id").references(() => billers.id),
  active: boolean("active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
}, (t) => [index("scheduled_due_idx").on(t.active, t.nextRunAt)]);

export const cards = pgTable("cards", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").references(() => accounts.id),
  label: varchar("label", { length: 60 }).notNull(),
  last4: varchar("last4", { length: 4 }).notNull(),
  /** VISA | MASTERCARD | CRYPTO */
  brand: varchar("brand", { length: 20 }).notNull(),
  kind: cardKindEnum("kind").notNull(),
  form: cardFormEnum("form").notNull(),
  expiry: varchar("expiry", { length: 5 }).notNull(),
  status: cardStatusEnum("status").notNull().default("ACTIVE"),
  dailyLimit: money("daily_limit").notNull(),
  monthlyLimit: money("monthly_limit").notNull(),
  deliveryAddress: text("delivery_address"),
  createdAt: createdAt(),
});

export const loans = pgTable("loans", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: loanTypeEnum("type").notNull(),
  principal: money("principal").notNull(),
  interestRate: numeric("interest_rate", { precision: 5, scale: 2 }).notNull(),
  termMonths: integer("term_months").notNull(),
  outstanding: money("outstanding").notNull(),
  monthlyPayment: money("monthly_payment").notNull(),
  nextPaymentDate: timestamp("next_payment_date", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  startedAt: createdAt(),
});

export const notifications = pgTable("notifications", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("notif_user_idx").on(t.userId, t.read)]);

export const branches = pgTable("branches", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 60 }).notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  phone: varchar("phone", { length: 30 }),
  hours: text("hours"),
});

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Beneficiary = typeof beneficiaries.$inferSelect;
