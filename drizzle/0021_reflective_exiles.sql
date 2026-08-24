DROP INDEX "coach_profiles_published_idx";--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD COLUMN "self_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "coach_profiles_published_idx" ON "coach_profiles" USING btree ("published","self_hidden");