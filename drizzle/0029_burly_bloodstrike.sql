ALTER TABLE "consult_sessions" ADD COLUMN "draft_summary" text;
--> statement-breakpoint
-- 2026/08/28：支出表的人身保費改由保單表投影，補兩個新細類。
-- ⚠️ 冪等：finance_categories 有 (kind,label) 唯一鍵，重跑不會多列。
-- ⚠️ sort_order 接在「保險」大類現有的最後一個之後，才不會插到別的大類中間。
INSERT INTO "finance_categories" ("kind","parent","label","sort_order","is_system")
SELECT 'expense','保險', v.label,
       COALESCE((SELECT MAX(sort_order) FROM "finance_categories" WHERE kind='expense'),0) + v.ord,
       true
FROM (VALUES ('人身保險(保障型)',1),('人身保險(理財型)',2)) AS v(label,ord)
ON CONFLICT ("kind","label") DO NOTHING;
