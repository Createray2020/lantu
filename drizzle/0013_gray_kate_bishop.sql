CREATE TABLE "coach_profiles" (
	"coach_id" text PRIMARY KEY NOT NULL,
	"headline" text,
	"bio" text,
	"specialties" text[] DEFAULT '{}' NOT NULL,
	"photo_url" text,
	"years_exp" integer,
	"prev_role" text,
	"credentials" text[] DEFAULT '{}' NOT NULL,
	"service_modes" text[] DEFAULT '{}' NOT NULL,
	"areas" text[] DEFAULT '{}' NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_profiles_published_idx" ON "coach_profiles" USING btree ("published");