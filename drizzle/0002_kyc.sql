ALTER TABLE "users" ADD COLUMN "kyc_profile" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "users" ADD COLUMN "kyc_status" varchar(20) NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "users" ADD COLUMN "kyc_reviewed_at" timestamptz;
ALTER TABLE "users" ADD COLUMN "kyc_reviewed_by" text;
