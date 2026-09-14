CREATE TABLE "org_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"kind" text DEFAULT 'meeting' NOT NULL,
	"title" text NOT NULL,
	"place" text,
	"visibility" text DEFAULT 'all' NOT NULL,
	"body" text,
	"minutes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_events" ADD CONSTRAINT "org_events_created_by_coaches_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_events_date_idx" ON "org_events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "org_events_visibility_date_idx" ON "org_events" USING btree ("visibility","event_date");