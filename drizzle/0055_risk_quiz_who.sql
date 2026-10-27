-- 2026/10/27 B-2 配偶風險屬性：一位客戶兩份（who = self / spouse），PK 改成 (client_id, who)。
-- 既有 3 列全部視為本人（who 預設 'self'），資料不動。
ALTER TABLE "client_risk_quiz" ADD COLUMN "who" text DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_risk_quiz" DROP CONSTRAINT "client_risk_quiz_pkey";--> statement-breakpoint
ALTER TABLE "client_risk_quiz" ADD CONSTRAINT "client_risk_quiz_client_id_who_pk" PRIMARY KEY("client_id","who");
