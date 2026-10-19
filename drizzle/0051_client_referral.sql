ALTER TABLE "client_users" ADD COLUMN "referrer_coach_id" text;--> statement-breakpoint
ALTER TABLE "client_users" ADD COLUMN "referrer_code" text;--> statement-breakpoint
ALTER TABLE "client_users" ADD COLUMN "referred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_referrer_coach_id_coaches_id_fk" FOREIGN KEY ("referrer_coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;