CREATE TABLE "code_counters" (
	"kind" text NOT NULL,
	"ym" text NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "coaches" ADD COLUMN "code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "code_counters_pk" ON "code_counters" USING btree ("kind","ym");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_code_uidx" ON "clients" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "coaches_code_uidx" ON "coaches" USING btree ("code");--> statement-breakpoint
-- ─────────────────────────────────────────────────────────────────────────────
-- 以下為手寫的資料遷移（2026/08/24 Ray 拍板）：回填既有教練／客戶的編號，
-- 並把流水號計數器 seed 到各月已用到的最大值，讓新資料從下一號接下去。
--
-- 月份一律用**台北時區**判定（`AT TIME ZONE 'Asia/Taipei'`）：Vercel 跑 UTC，
-- 用 UTC 會讓月初的資料被歸到上個月，而那個月的號很可能已經被別人用掉了。
-- ─────────────────────────────────────────────────────────────────────────────

-- ① 教練編號：FC + YYMM + 三碼流水號。
--    待審(pending)的申請不發號 —— 發號時機是「核准報聘」，被拒的申請不該佔掉一個號。
--    approved_at 停權時會被清成 null，所以這裡用 coalesce(approved_at, created_at)。
WITH numbered AS (
  SELECT id,
         to_char(coalesce(approved_at, created_at) AT TIME ZONE 'Asia/Taipei', 'YYMM') AS ym,
         row_number() OVER (
           PARTITION BY to_char(coalesce(approved_at, created_at) AT TIME ZONE 'Asia/Taipei', 'YYMM')
           ORDER BY coalesce(approved_at, created_at), id
         ) AS seq
  FROM coaches
  WHERE code IS NULL AND status <> 'pending'
)
UPDATE coaches c
SET code = 'FC' || n.ym || lpad(n.seq::text, 3, '0')
FROM numbered n
WHERE c.id = n.id;
--> statement-breakpoint

-- ② 客戶編號：YYMM + 三碼流水號（客戶身分不加前綴）。以建立月計。
WITH numbered AS (
  SELECT id,
         to_char(created_at AT TIME ZONE 'Asia/Taipei', 'YYMM') AS ym,
         row_number() OVER (
           PARTITION BY to_char(created_at AT TIME ZONE 'Asia/Taipei', 'YYMM')
           ORDER BY created_at, id
         ) AS seq
  FROM clients
  WHERE code IS NULL
)
UPDATE clients cl
SET code = n.ym || lpad(n.seq::text, 3, '0')
FROM numbered n
WHERE cl.id = n.id;
--> statement-breakpoint

-- ③ 計數器 seed：取每個月已發出的最大流水號。
--    substring 從第 5 個字元起（教練去掉 'FC' 前綴後同樣是 YYMM＋流水號）。
INSERT INTO code_counters (kind, ym, last_seq)
SELECT 'coach', substring(code from 3 for 4), max(substring(code from 7)::int)
FROM coaches WHERE code IS NOT NULL
GROUP BY 1, 2
ON CONFLICT (kind, ym) DO UPDATE SET last_seq = GREATEST(code_counters.last_seq, excluded.last_seq);
--> statement-breakpoint

INSERT INTO code_counters (kind, ym, last_seq)
SELECT 'client', substring(code from 1 for 4), max(substring(code from 5)::int)
FROM clients WHERE code IS NOT NULL
GROUP BY 1, 2
ON CONFLICT (kind, ym) DO UPDATE SET last_seq = GREATEST(code_counters.last_seq, excluded.last_seq);
--> statement-breakpoint

-- ④ 職級回填（Ray 2026/08/24 拍板）。
--    這次上線的派案閘是「未定級＝不可被指定」，而 DB 裡 25 位教練的 rank_code 全是 null，
--    不回填的話官網教練頁會一位都點不動。只補這兩群，其餘（後來加入、尚未定級的）維持 null。
--
--    真人帳號 → S1（可派案、會出現在自動建議）
UPDATE coaches SET rank_code = 'S1'
WHERE rank_code IS NULL AND id IN (
  'user_3HPH0h6QVChSmhWRIvFXSyh5UzZ',  -- 立揚 雷（核心成員）
  'user_3HPUzu8NlnJL0eZelRVdECE6CsF',  -- Grace Hsieh
  'user_3HPV8zIKtHjKbEWO88jk51SQEWP',  -- 峯羽 范
  'user_3HPVxZApNQcvFQ6edKLywkxLoQz',  -- 家慶 汪
  'user_3HQwbFmek6S7F8hOqITMiyjy6Ar'   -- 浩軍 邱
);
--> statement-breakpoint

--    示範帳號 mock_* → C1（正好拿來驗證「呈現但不可選、需輸入編號」的畫面）。
--    ⚠️ 上線前這批 mock 教練要整批清掉，見記憶「示範教練檔案/照片裁切」。
UPDATE coaches SET rank_code = 'C1'
WHERE rank_code IS NULL AND id LIKE 'mock_%';
