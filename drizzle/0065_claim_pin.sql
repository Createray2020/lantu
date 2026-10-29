CREATE TABLE "claim_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" text NOT NULL,
	"input" text DEFAULT '' NOT NULL,
	"ok" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_invites" ADD COLUMN "pin" text;--> statement-breakpoint
ALTER TABLE "claim_attempts" ADD CONSTRAINT "claim_attempts_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_attempts_user_at_idx" ON "claim_attempts" USING btree ("client_user_id","at");