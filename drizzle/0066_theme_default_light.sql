ALTER TABLE "coaches" ALTER COLUMN "theme" SET DEFAULT 'light';--> statement-breakpoint
-- 2026/11/01 Ray 拍板：改版上線時全部切成晨嵐一次（舊的 'dark' 多半是欄位預設值，不是本人選的）。想要深色的人上線後自己切回去。
UPDATE "coaches" SET "theme" = 'light' WHERE "theme" = 'dark';
