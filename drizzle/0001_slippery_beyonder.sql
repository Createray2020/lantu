ALTER TABLE "coaches" ADD COLUMN "role" text DEFAULT 'coach' NOT NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "approved_at" timestamp with time zone;