ALTER TABLE "finance_categories" ADD COLUMN "debt_use" text;--> statement-breakpoint
-- 2026/10/25 負債改看目的分類：內建細類補預設用途；consumer 從此是 debt_use='消費' 的衍生值。
UPDATE "finance_categories" SET "debt_use"='投資' WHERE "kind"='liability' AND "label" IN ('投資房貸','保單借款','股票質押借款','不動產質借','企業/營運週轉貸款','融資租賃');--> statement-breakpoint
UPDATE "finance_categories" SET "debt_use"='消費' WHERE "kind"='liability' AND "debt_use" IS NULL AND ("consumer"=true OR "parent"='信貸') AND "label"<>'就學貸款';--> statement-breakpoint
UPDATE "finance_categories" SET "debt_use"='其他' WHERE "kind"='liability' AND "debt_use" IS NULL AND "label" IN ('私人借款(親友)','應付稅款','其他');--> statement-breakpoint
UPDATE "finance_categories" SET "debt_use"='自用' WHERE "kind"='liability' AND "debt_use" IS NULL AND ("parent" IN ('房貸','車貸') OR "label"='就學貸款');--> statement-breakpoint
UPDATE "finance_categories" SET "debt_use"='其他' WHERE "kind"='liability' AND "debt_use" IS NULL;--> statement-breakpoint
UPDATE "finance_categories" SET "consumer"=("debt_use"='消費') WHERE "kind"='liability';
