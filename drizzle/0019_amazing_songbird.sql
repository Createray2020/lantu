CREATE TABLE "learn_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"category" text DEFAULT '' NOT NULL,
	"cover_url" text,
	"min_rank_seq" integer,
	"training_hours" double precision,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learn_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'video' NOT NULL,
	"url" text,
	"body" text,
	"duration_min" integer,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "learn_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" text NOT NULL,
	"lesson_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "license_from" date;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "license_until" date;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "license_unit" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "license_qty" integer;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "client_cap_override" integer;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "ui_scale" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "comp_ranks" ADD COLUMN "client_cap" integer;--> statement-breakpoint
ALTER TABLE "comp_ranks" ADD COLUMN "price_month" bigint;--> statement-breakpoint
ALTER TABLE "comp_ranks" ADD COLUMN "price_year" bigint;--> statement-breakpoint
ALTER TABLE "learn_lessons" ADD CONSTRAINT "learn_lessons_course_id_learn_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."learn_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learn_progress" ADD CONSTRAINT "learn_progress_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learn_progress" ADD CONSTRAINT "learn_progress_lesson_id_learn_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."learn_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learn_progress" ADD CONSTRAINT "learn_progress_course_id_learn_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."learn_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learn_courses_published_idx" ON "learn_courses" USING btree ("published","sort_order");--> statement-breakpoint
CREATE INDEX "learn_lessons_course_seq_idx" ON "learn_lessons" USING btree ("course_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "learn_progress_coach_lesson_uidx" ON "learn_progress" USING btree ("coach_id","lesson_id");--> statement-breakpoint
CREATE INDEX "learn_progress_coach_course_idx" ON "learn_progress" USING btree ("coach_id","course_id");