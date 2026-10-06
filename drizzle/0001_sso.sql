CREATE TABLE "sso_tokens_used" (
	"jti" varchar(100) PRIMARY KEY NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "person_id" varchar(64);--> statement-breakpoint
CREATE INDEX "sso_tokens_used_expires_idx" ON "sso_tokens_used" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_person_id_unique" UNIQUE("person_id");