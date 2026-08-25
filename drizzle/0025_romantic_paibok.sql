CREATE TABLE "client_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"session_id" uuid,
	"block_key" text NOT NULL,
	"kind" text DEFAULT 'basis' NOT NULL,
	"body" text NOT NULL,
	"visible" boolean DEFAULT false NOT NULL,
	"author_type" text DEFAULT 'coach' NOT NULL,
	"author_id" text,
	"author_name" text,
	"author_access" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consult_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"coach_id" text NOT NULL,
	"plan_id" uuid,
	"revision_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"close_reason" text,
	"review_id" uuid,
	"metrics_before" jsonb,
	"metrics_after" jsonb
);
--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_session_id_consult_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."consult_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consult_sessions" ADD CONSTRAINT "consult_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consult_sessions" ADD CONSTRAINT "consult_sessions_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consult_sessions" ADD CONSTRAINT "consult_sessions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consult_sessions" ADD CONSTRAINT "consult_sessions_revision_id_plan_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."plan_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consult_sessions" ADD CONSTRAINT "consult_sessions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_notes_client_block_idx" ON "client_notes" USING btree ("client_id","block_key");--> statement-breakpoint
CREATE INDEX "client_notes_session_idx" ON "client_notes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "client_notes_client_created_idx" ON "client_notes" USING btree ("client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "consult_sessions_client_started_idx" ON "consult_sessions" USING btree ("client_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "consult_sessions_one_open_per_client" ON "consult_sessions" USING btree ("client_id") WHERE ended_at is null;