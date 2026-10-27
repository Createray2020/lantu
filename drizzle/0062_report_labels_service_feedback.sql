CREATE TABLE "service_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"term_id" uuid,
	"client_user_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avg" double precision,
	"comment" text DEFAULT '' NOT NULL,
	"low" boolean DEFAULT false NOT NULL,
	"handled_at" timestamp with time zone,
	"handled_by" text,
	"handle_note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_revisions" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "plan_revisions" ADD COLUMN "label_note" text;--> statement-breakpoint
ALTER TABLE "plan_revisions" ADD COLUMN "labeled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_feedback" ADD CONSTRAINT "service_feedback_case_id_service_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."service_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_feedback" ADD CONSTRAINT "service_feedback_client_user_id_client_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."client_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_feedback_case_idx" ON "service_feedback" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_feedback_case_term_uq" ON "service_feedback" USING btree ("case_id",coalesce("term_id"::text, ''));