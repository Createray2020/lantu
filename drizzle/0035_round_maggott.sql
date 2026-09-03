ALTER TABLE "coaches" DROP CONSTRAINT "coaches_sponsor_id_coaches_id_fk";
--> statement-breakpoint
DROP INDEX "coaches_sponsor_id_idx";--> statement-breakpoint
ALTER TABLE "coaches" DROP COLUMN "sponsor_id";