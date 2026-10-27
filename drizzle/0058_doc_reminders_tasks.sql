CREATE TABLE "doc_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_key" text NOT NULL,
	"template_version" integer NOT NULL,
	"title" text NOT NULL,
	"deadline" date,
	"target_coach_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doc_signers" ADD COLUMN "remind_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "doc_signers" ADD COLUMN "last_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "doc_tasks" ADD CONSTRAINT "doc_tasks_created_by_coaches_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_tasks_template_key_idx" ON "doc_tasks" USING btree ("template_key");