# Clerk 正式化切換手冊（www.lantufc.com）

準備日 2026/10/28。腳本：`scripts/clerk-migrate.ts`。
目標：把登入從 Clerk 開發實例（`pk_test` / `sk_test`）換成正式實例，**不讓任何人重新註冊、資料不掉**。
使用者端唯一感受：下次打開要再登入一次（Google 按一下；用密碼的人按「忘記密碼」）。

## 0. 事前（可提前幾天做，不影響現役系統）

1. **Clerk Dashboard → 左上實例切換 → Create production instance**，選「Clone development settings」。
2. Production 實例 → **Domains** 填 `lantufc.com`。Clerk 會列出約 5 筆 CNAME（`clerk.`、`accounts.`、`clkmail.`、`clk._domainkey.`、`clk2._domainkey.`）。
   到 name.080.net → 服務列表 → lantufc.com 管理 → 修改 IP/DNS → IP指向 → **新增CNAME**，逐筆加；回 Clerk 按 Verify。
   （每次提交 name080 會跳「成功」alert，正常。）
3. **Google 登入**：Production 不能用 Clerk 共用憑證。
   Google Cloud Console → APIs & Services → Credentials → Create OAuth client（Web）→ Authorized redirect URI 填 Clerk Production → User & Authentication → Social connections → Google 那頁給的 callback URL → 把 Client ID / Secret 貼回 Clerk，關掉「Use custom credentials」以外的預設。
   OAuth consent screen 要是「In production」狀態（不是 Testing），否則只有測試名單能登。
4. Clerk Production → **Paths**：Home URL `https://www.lantufc.com`、sign-in `/login`（對齊 `.env.local` 的 `NEXT_PUBLIC_CLERK_SIGN_IN_URL`）。
5. 拿 **`pk_live_…` / `sk_live_…`** 先存好，還不要放進 Vercel。
6. 先在本機跑 `export`（唯讀，隨時可跑）確認人數：
   ```bash
   cd ~/Desktop/dev/lantu
   npx tsx scripts/clerk-migrate.ts export
   ```

## 1. 切換當天（選沒人在用的時段，全程約 20 分鐘）

```bash
cd ~/Desktop/dev/lantu

# a. 備份（Neon 連線字串在 .env.local 的 DATABASE_URL）
pg_dump "$(grep ^DATABASE_URL .env.local | cut -d= -f2- | tr -d '"')" -Fc -f ~/Desktop/lantu_before_clerk_$(date +%Y%m%d_%H%M).dump

# b. 重新匯出一次（抓到最新註冊的人）
npx tsx scripts/clerk-migrate.ts export

# c. 在正式實例建人（冪等，中斷可續跑）
CLERK_PROD_SECRET_KEY=sk_live_xxx npx tsx scripts/clerk-migrate.ts create

# d. 先看範圍：每張表會改幾筆、哪些 DB 列對不上、有沒有漏網欄位
npx tsx scripts/clerk-migrate.ts remap --dry-run
```

dry-run 要看三件事：
- 「對不上」的列只有示範／測試帳號或已刪的人（名單會印出來）。
- 「安全網掃描」寫「乾淨」。有 ⚠ 就停，先查那個欄位。
- 外鍵條數跟 schema 對得上（2026/10/28 是 50 條）。

```bash
# e. 彩排：走完整個真寫路徑＋事後對照，最後 rollback（2026/10/28 已用假對照表彩排過，全綠）
npx tsx scripts/clerk-migrate.ts remap --rehearse

# f. 真寫（單一交易，任何錯整包回滾）
npx tsx scripts/clerk-migrate.ts remap --apply
```

事後檢查那行要是：「還留舊 id 0 筆（或等於對不上的筆數）、jsonb 還含舊 id 0 筆」。

**從這一刻起，舊金鑰的登入會對不到資料**（DB 已是新 id），所以 f 和 g 之間不要停太久。

g. **Vercel → lantu → Settings → Environment Variables**：
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → `pk_live_…`、`CLERK_SECRET_KEY` → `sk_live_…`，只改 **Production** 環境（Preview 留 test）。
   → Deployments → 最新那筆 **Redeploy**（不勾 use existing build cache）。

h. 驗證：
   - 無痕視窗開 `https://www.lantufc.com/login`，用自己的 Google 登入 → 應直接進教練端、看到原本的客戶。
   - 找一位客戶帳號（或自己的客戶測試帳）登入 `/portal` → 看到原本的人生護照。
   - 後台 `/admin` 名冊人數、帳務頁、簽署文件都在。
   - Clerk Production Dashboard → Users 應看到大家陸續「Last signed in」更新。

i. 本機 `.env.local` 也換成 live 金鑰（或留 test 指到另一個 dev 用的 Neon branch——二擇一，別讓本機 dev 實例去打生產 DB）。

j. 通知同仁：「系統換正式網址 www.lantufc.com，下次打開要再登入一次，資料都在」。手機主畫面捷徑請重新加。

## 2. 回滾（切換後 24 小時內若出大問題）

1. Vercel 環境變數改回 `pk_test` / `sk_test` → Redeploy。
2. 還原資料庫：
   ```bash
   pg_restore --clean --if-exists -d "$DATABASE_URL" ~/Desktop/lantu_before_clerk_<時間>.dump
   ```
   （只有在 remap 之後還沒有人寫入新資料時才這樣做；若已有新資料，改用 idmap.json 反向 remap——把 `scripts/tmp/idmap.json` 的 key/value 對調後再跑 `remap --apply`。）

## 3. 事後

- 注意：`scripts/tmp/idmap.json` 是 `create` 產的真對照表；準備日彩排用的假表已清成 `{}`。切換當天一定要重新跑 `create` 產生真的。
- `scripts/tmp/clerk-users.json`、`idmap.json` 留著（在 .gitignore 裡），一個月後再刪。
- Clerk 開發實例不要刪，留作本機開發用；但它的使用者從此跟生產無關。
- 密碼登入那 1 位：登入時按「忘記密碼」重設即可。
- 手機 PWA 捷徑指到 `lantu-three.vercel.app` 的照樣能用（同一部署），但建議重加成新網址。
