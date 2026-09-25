CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'DORMANT', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('CURRENT', 'SAVINGS', 'FIXED_DEPOSIT', 'INTERNAL');--> statement-breakpoint
CREATE TYPE "public"."beneficiary_type" AS ENUM('CITIZEN', 'LOCAL', 'INTERNATIONAL');--> statement-breakpoint
CREATE TYPE "public"."card_form" AS ENUM('VIRTUAL', 'PHYSICAL');--> statement-breakpoint
CREATE TYPE "public"."card_kind" AS ENUM('DEBIT', 'CREDIT', 'CRYPTO');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('ACTIVE', 'FROZEN', 'BLOCKED', 'ORDERED');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY');--> statement-breakpoint
CREATE TYPE "public"."loan_type" AS ENUM('PERSONAL', 'BUSINESS', 'MORTGAGE', 'VEHICLE', 'EDUCATION');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('CUSTOMER', 'BOARD_MEMBER', 'BACK_OFFICE', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."tx_type" AS ENUM('INTERNAL_TRANSFER', 'TRANSFER', 'EXTERNAL_TRANSFER', 'INTERNATIONAL', 'BILL_PAYMENT', 'AIRTIME', 'DEPOSIT', 'FEE', 'LOAN_REPAYMENT');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"number" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" varchar(3) DEFAULT 'LSL' NOT NULL,
	"balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"interest_rate" numeric(5, 2),
	"matures_at" timestamp with time zone,
	"system_code" varchar(50),
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_number_unique" UNIQUE("number"),
	CONSTRAINT "accounts_system_code_unique" UNIQUE("system_code")
);
--> statement-breakpoint
CREATE TABLE "beneficiaries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" "beneficiary_type" NOT NULL,
	"bank_name" varchar(120) NOT NULL,
	"account_number" varchar(40) NOT NULL,
	"branch_code" varchar(20),
	"country" varchar(2),
	"swift" varchar(11),
	"last_paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billers" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(20) NOT NULL,
	"ref_label" varchar(60) DEFAULT 'Account number' NOT NULL,
	"is_airtime" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"settlement_account_id" text NOT NULL,
	CONSTRAINT "billers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(60) NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"phone" varchar(30),
	"hours" text
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text,
	"label" varchar(60) NOT NULL,
	"last4" varchar(4) NOT NULL,
	"brand" varchar(20) NOT NULL,
	"kind" "card_kind" NOT NULL,
	"form" "card_form" NOT NULL,
	"expiry" varchar(5) NOT NULL,
	"status" "card_status" DEFAULT 'ACTIVE' NOT NULL,
	"daily_limit" numeric(18, 2) NOT NULL,
	"monthly_limit" numeric(18, 2) NOT NULL,
	"delivery_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"balance_after" numeric(18, 2) NOT NULL,
	"narrative" text NOT NULL,
	"transaction_id" text NOT NULL,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "loan_type" NOT NULL,
	"principal" numeric(18, 2) NOT NULL,
	"interest_rate" numeric(5, 2) NOT NULL,
	"term_months" integer NOT NULL,
	"outstanding" numeric(18, 2) NOT NULL,
	"monthly_payment" numeric(18, 2) NOT NULL,
	"next_payment_date" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"frequency" "frequency" NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"reference" varchar(60),
	"from_account_id" text NOT NULL,
	"beneficiary_id" text,
	"biller_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" varchar(30) NOT NULL,
	"type" "tx_type" NOT NULL,
	"status" "tx_status" DEFAULT 'COMPLETED' NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"fee" numeric(18, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'LSL' NOT NULL,
	"metadata" jsonb,
	"idempotency_key" varchar(80),
	"initiated_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_reference_unique" UNIQUE("reference"),
	CONSTRAINT "transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(30),
	"roles" "role"[] DEFAULT '{"CUSTOMER"}' NOT NULL,
	"preferred_language" varchar(5) DEFAULT 'en' NOT NULL,
	"preferred_theme" varchar(10) DEFAULT 'dark' NOT NULL,
	"suspended" boolean DEFAULT false NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billers" ADD CONSTRAINT "billers_settlement_account_id_accounts_id_fk" FOREIGN KEY ("settlement_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."beneficiaries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_biller_id_billers_id_fk" FOREIGN KEY ("biller_id") REFERENCES "public"."billers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_initiated_by_id_users_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "beneficiary_unique" ON "beneficiaries" USING btree ("user_id","bank_name","account_number");--> statement-breakpoint
CREATE INDEX "entries_account_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "scheduled_due_idx" ON "scheduled_payments" USING btree ("active","next_run_at");--> statement-breakpoint
CREATE INDEX "tx_initiator_idx" ON "transactions" USING btree ("initiated_by_id","created_at");