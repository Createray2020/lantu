CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"author" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" text NOT NULL,
	"period" text NOT NULL,
	"income" bigint DEFAULT 0 NOT NULL,
	"income_goal" bigint DEFAULT 0 NOT NULL,
	"deals" integer DEFAULT 0 NOT NULL,
	"deals_goal" integer DEFAULT 0 NOT NULL,
	"new_clients" integer DEFAULT 0 NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"proposals" integer DEFAULT 0 NOT NULL,
	"closes" integer DEFAULT 0 NOT NULL,
	"activity_goal" integer DEFAULT 0 NOT NULL,
	"retention_rate" integer DEFAULT 0 NOT NULL,
	"ce_hours" integer DEFAULT 0 NOT NULL,
	"ce_hours_goal" integer DEFAULT 12 NOT NULL,
	"license_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recruits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_coach_id" text NOT NULL,
	"candidate_name" text NOT NULL,
	"source" text,
	"stage" text DEFAULT 'prospect' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "org_rank" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "upline_id" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "join_date" date;--> statement-breakpoint
ALTER TABLE "member_metrics" ADD CONSTRAINT "member_metrics_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruits" ADD CONSTRAINT "recruits_owner_coach_id_coaches_id_fk" FOREIGN KEY ("owner_coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_upline_id_coaches_id_fk" FOREIGN KEY ("upline_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;