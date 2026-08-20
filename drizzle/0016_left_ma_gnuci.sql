DROP INDEX "plans_client_id_year_uidx";--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "track" text DEFAULT 'coach' NOT NULL;--> statement-breakpoint
--> 回填：既有的客戶人生護照份改掛 client 軌（其餘吃 default 'coach'）。
--> 這一步必須在建新唯一索引之前，否則同客戶同年的兩份會在建索引時撞鍵。
UPDATE "plans" SET "track" = 'client' WHERE "label" = '人生護照';--> statement-breakpoint
CREATE UNIQUE INDEX "plans_client_id_year_track_uidx" ON "plans" USING btree ("client_id","year","track");
