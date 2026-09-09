CREATE TABLE "client_login_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_user_id" text NOT NULL,
	"session_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_modules" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notice" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "client_users" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_users" ADD COLUMN "login_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_users" ADD COLUMN "last_session_id" text;--> statement-breakpoint
ALTER TABLE "client_login_events" ADD CONSTRAINT "client_login_events_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_modules" ADD CONSTRAINT "platform_modules_updated_by_coaches_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cle_user_at_idx" ON "client_login_events" USING btree ("client_user_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cle_at_idx" ON "client_login_events" USING btree ("at" DESC NULLS LAST);