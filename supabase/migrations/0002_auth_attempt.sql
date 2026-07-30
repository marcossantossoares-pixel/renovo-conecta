CREATE TYPE "public"."auth_attempt_kind" AS ENUM('login', 'password_reset', 'invitation');--> statement-breakpoint
CREATE TYPE "public"."auth_attempt_scope" AS ENUM('account', 'origin');--> statement-breakpoint
CREATE TABLE "auth_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "auth_attempt_kind" NOT NULL,
	"scope" "auth_attempt_scope" NOT NULL,
	"identifier_hash" text NOT NULL,
	"succeeded" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_attempt_lookup_idx" ON "auth_attempt" USING btree ("kind","scope","identifier_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "auth_attempt_occurred_idx" ON "auth_attempt" USING btree ("occurred_at");