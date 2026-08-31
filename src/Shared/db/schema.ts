// 嵐途資料表（Drizzle / Neon Postgres）
// 三層：coaches → clients → plans(年度版本) / reviews(諮詢，掛客戶層) → action_items
import { sql } from 'drizzle-orm';
import {
  pgTable, text, integer, bigint, boolean, jsonb, timestamp, uuid, date,
  doublePrecision, index, uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
// 報聘申請的 jsonb 形狀住在純函式層（client component 也要 import，不能把 drizzle 拖進 bundle）。
import type { ApplyLicense, ChecklistItem } from '@/lib/coachApply';

// ⚠️ 索引一律宣告在這裡再跑 db:generate。
//    直接用 psql 手建的索引不在 schema 快照裡，之後任何人跑 `npm run db:push`
//    都會把它們默默 DROP 掉（Postgres 也不會自動幫 FK 建索引）。

// 教練（對應 Clerk user id）
// role: coach（一般教練）/ admin（管理員，可進後台）
// status: pending（待審核）/ active（已開通）/ suspended（停權）
// orgRank（組織職級，決定首頁視角與可見範圍）：
//   member（教練，只看自己）/ manager（主管，看下線子樹）/ owner（核心成員，看全組織）
// uplineId：上線教練（自參照），組織樹的父節點；null＝頂點。
export const coaches = pgTable('coaches', {
  id: text('id').primaryKey(), // Clerk userId
  email: text('email'),
  // ⚠️ name 是 **Clerk 的鏡像**：ensureCoach() 每次導頁都會用 Clerk 的 firstName+lastName
  //    把它覆寫回去，所以任何「讓使用者改名字」的功能都不能寫這一欄（下一次導頁就被蓋掉）。
  //    保留它是為了後台辨識身分（對得上是哪個登入帳號）。
  name: text('name'),
  // 教練自填的**對外顯示名稱**（2026/08/24 Ray 拍板）。空白／留空＝沿用 Clerk 姓名。
  // 全站顯示一律走 displayNameOf()（lib/coach.ts），只有 /admin 名冊會同時秀出 name 供辨識。
  // 為什麼放 coaches 不放 coach_profiles：後者是 CASCADE 而且不是每位教練都填了公開檔案，
  // 但「名字」是全站都要用的東西。
  displayName: text('display_name'),
  role: text('role').default('coach').notNull(),
  status: text('status').default('pending').notNull(),
  orgRank: text('org_rank').default('member').notNull(),
  uplineId: text('upline_id').references((): AnyPgColumn => coaches.id, { onDelete: 'set null' }),
  title: text('title'),           // 職稱顯示（資深財務教練／處經理／執行長…）
  joinDate: date('join_date'),
  note: text('note'),           // 備註（聯絡方式／收款狀態等，後台用）
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

  // ── 業務制度欄位（見 docs/業務制度_V4.md）──
  // orgRank（member/manager/owner）是「系統可見範圍」，rankCode 是「制度職級」（C1…首席），
  // 兩者刻意分開：制度升到 S2 不代表就該看得到別人的客戶。
  rankCode: text('rank_code'),
  entryType: text('entry_type'),              // training（培訓認證）/ recruit（同業招募）/ rejoin（回任）
  hireDate: date('hire_date'),                // 到職日：真除倒數與首年豁免的起點
  sponsorId: text('sponsor_id').references((): AnyPgColumn => coaches.id, { onDelete: 'set null' }),
  tenureRankCode: text('tenure_rank_code'),   // 真除中的核定職級（null＝非真除狀態）
  tenureUntil: date('tenure_until'),
  initialCases: integer('initial_cases').default(0).notNull(),   // 同業招募帶入的既往實績
  initialFees: bigint('initial_fees', { mode: 'number' }).default(0).notNull(),
  // 資格覆寫：null＝依維持資格自動判定；true/false＝管理員手動覆寫。
  recruitAllowed: boolean('recruit_allowed'),
  leadAllowed: boolean('lead_allowed'),

  // ── 使用期限（2026/08/22 Ray 拍板）────────────────────────────
  // 依級別開通，到期未延長就「唯讀鎖定」（能看不能改，見 lib/license.ts）。
  // licenseUntil 為 null＝尚未設定期限＝不鎖 —— 舊帳號與尚未正式收費前一律照常使用，
  // 「沒設定＝不檢查」與業務制度的門檻語意一致，絕對不要改成 null 視同過期。
  // 實習教練固定半年；其餘可按月／年設定，unit/qty 留著是為了續約時沿用上次條件。
  licenseFrom: date('license_from'),
  licenseUntil: date('license_until'),
  licenseUnit: text('license_unit'),                  // month / year
  licenseQty: integer('license_qty'),
  // 單一教練的客戶數上限覆寫：null＝依級別（comp_ranks.client_cap）判定。
  clientCapOverride: integer('client_cap_override'),

  // 介面縮放百分比（老花友善）：100 / 115 / 130。
  uiScale: integer('ui_scale').default(100).notNull(),

  // ── 教練編號（2026/08/24 Ray 拍板）──────────────────────────
  // 格式：FC + 西元年後兩碼 + 月 + 三碼流水號（FC2609002 ＝ 2026/09 第二位報聘的教練）。
  // 發號時機＝「核准報聘」那一刻（status 第一次轉 active）；待審申請不佔號。
  // ⚠️ 一旦發出永不變更，也不因停權／再核准而重發 —— 客戶手上、對帳單上、名片上的號都是它。
  //    也絕對不要拿 approvedAt 當發號依據：setCoachStatus 停權時會把它清成 null。
  code: text('code'),
}, (t) => [
  // 自參照 FK：刪除教練時的 ON DELETE SET NULL 需要它，否則每次刪除都要全表掃。
  index('coaches_upline_id_idx').on(t.uplineId),
  // listActiveCoaches / getOrgOwnerId 的熱路徑。
  index('coaches_status_idx').on(t.status),
  // 推薦人也是自參照 FK（代管移轉與同業招募業績歸屬都要沿它查）。
  index('coaches_sponsor_id_idx').on(t.sponsorId),
  // 客戶輸入編號指定教練時的查詢路徑，同時也是「同一個號不可能發兩次」的最後一道保險：
  // 配號本身已由 code_counters 的單語句 upsert 保證原子性，這條是防手動改資料改出重號。
  // Postgres 的 UNIQUE 視 NULL 互異 → 待審教練（code 為 null）不受影響。
  uniqueIndex('coaches_code_uidx').on(t.code),
]);

/**
 * 教練顯示名稱的 SQL 版：`coalesce(nullif(display_name, ''), name)`。
 *
 * ⚠️ 凡是把教練姓名選出去給畫面用的查詢，一律 select 這個而不是 `coaches.name` ——
 *    否則教練改了名字，那條路徑上的畫面會停在 Clerk 的舊名。
 *    需要登入帳號真名的地方（只有 /admin 名冊）才另外 select `coaches.name`。
 *
 * 純函式版是 `lib/coachName.ts` 的 `displayNameOf()`，兩者語意必須一致。
 * 放在 schema 這裡而不是跟純函式同住，是因為純函式那支要被 client component 引用，
 * 不能把 drizzle／pg-core 拖進瀏覽器 bundle。
 */
export const coachDisplayName = sql<string | null>`coalesce(nullif(${coaches.displayName}, ''), ${coaches.name})`;

// 客戶登入帳號（雙邊平台：客戶自己上官網註冊、以客戶身分登入）
// 對應 Clerk user id；與 coaches 互斥（同一 Clerk 使用者不會同時是教練與客戶）。
// 注意：這是「客戶端登入者」，與下方 clients（教練管理的 CRM 客戶）是不同物，
//       兩者的合併（客戶擁有自己的 clients 記錄）屬租戶反轉波，之後才做。
// status: active（自助入口，註冊即開通）/ suspended（停權）
export const clientUsers = pgTable('client_users', {
  id: text('id').primaryKey(), // Clerk userId
  email: text('email'),
  name: text('name'),
  status: text('status').default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 客戶（永久身份）
export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  // 教練建立的客戶：coachId 有值。自助客戶（人生護照）：coachId 為 null、clientUserId 指向登入帳號，
  // 待客戶授權／掛上教練後，coachId 才會被設上（＝「真的進入規劃」）。
  //
  // RESTRICT 不是 CASCADE：客戶與他們的規劃是公司資產，不能因為刪掉一位教練就整批消失
  // （而且 UI 上完全看不出來發生了什麼）。要移除教練必須先把客戶轉移給接手人，
  // 見 lib/coach.ts 的 transferClients()／removeCoach()。
  coachId: text('coach_id').references(() => coaches.id, { onDelete: 'restrict' }),
  clientUserId: text('client_user_id').references(() => clientUsers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contact: jsonb('contact').$type<{ phone?: string; email?: string; line?: string }>().default({}),
  source: text('source'),          // 轉介/講座/廣告/自來
  tags: text('tags').array().default([]),
  lifeStage: text('life_stage'),   // 單身/新婚/育兒/退休前/退休
  status: text('status').default('active').notNull(), // active/pending/archived
  birthDate: date('birth_date'),
  // 客戶編號（2026/08/24 Ray 拍板）：西元年後兩碼 + 月 + 三碼流水號，不加身分前綴
  // （2610005 ＝ 2026/10 第五位客戶）。以「建立月」計，發出後不變。
  //
  // ⚠️ 範本（is_template）不發編號 → code 留 null。範本不是客戶，發了會白白吃掉一個
  //    流水號、還會印在報告書表頭上。
  code: text('code'),
  // ── 共用示範範本（2026/08/30 Ray 拍板）──────────────────────────────
  // 一組「所有教練都看得到、誰都改不了」的示範個案，用來坐在客戶旁邊翻給他看。
  //
  // 為什麼寄生在 clients 而不是另開一張表：範本要能被 plans / 報告書 / 引擎原封不動地讀，
  // 另開一張表等於把 plans.client_id 變成兩種語意（或再複製一張 template_plans），
  // 整條讀取鏈都要分岔。共用一張表，差別只在「租戶維度是誰」。
  //
  // 範本的三個欄位形狀：coach_id = null、client_user_id = null、is_template = true。
  //   - 跟自助客戶（人生護照）天然分得開：後者一定有 client_user_id。
  //   - 跟教練客戶天然分得開：後者一定有 coach_id。
  // ⚠️ 但「天然分得開」只是剛好安全。真正的邊界寫在 lib/clientScope.ts：
  //    ownedClient() / readableClient() 都明確排除 is_template，
  //    所以就算哪天有人手滑把某個範本的 coach_id 設成某位教練，它也不會出現在他的
  //    客戶列表、不會可寫、也不會佔掉他的額度。
  isTemplate: boolean('is_template').default(false).notNull(),
  // 客群標籤（例「雙薪育兒家庭」）。只有範本會用；一般客戶留 null。
  templateLabel: text('template_label'),
  // 後台排序用（小的在前）。教練端清單依它排，不是依 updated_at——
  // 範本是「教學素材」，順序是後台編排出來的，不該因為誰動了一下就跳到最前面。
  templateOrder: integer('template_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 教練端每一頁的第一個查詢（列表另有 ORDER BY updated_at DESC）。
  index('clients_coach_id_updated_at_idx').on(t.coachId, t.updatedAt.desc()),
  // 客戶端 /portal 每個頁面/動作都用它反查，且程式全篇假設 1:1（七處 limit(1)）。
  // Postgres 的 UNIQUE 允許多個 NULL，所以教練建立的客戶（clientUserId=null）不受影響。
  uniqueIndex('clients_client_user_id_uidx').on(t.clientUserId),
  // 客戶編號：教練端用它搜尋、報告書印它。唯一性同 coaches_code_uidx 的理由。
  uniqueIndex('clients_code_uidx').on(t.code),
  // 範本清單（每一位教練每次開示範抽屜都打這一次）。partial index：
  // 全表絕大多數列是一般客戶，是否範本的選擇性極差，只有 where is_template 的
  // 部分索引才小到能整個待在記憶體裡，也才會被 planner 選中。
  index('clients_template_order_idx').on(t.templateOrder, t.updatedAt.desc()).where(sql`is_template`),
]);

// 編號流水號計數器（教練編號 / 客戶編號共用一張表，用 kind 分流）。
//
// ⚠️ 為什麼需要這張表而不是「查 max(code) + 1」：
//    neon-http 驅動不支援互動式交易（db.transaction() 直接丟錯），兩個人同一秒送出
//    就會讀到同一個 max、算出同一個號。這裡改成單一語句的
//    `insert … on conflict do update set last_seq = last_seq + 1 returning`，
//    由 Postgres 的列鎖保證同月不可能發出兩個一樣的號。
// kind: coach（教練，前綴 FC）/ client（客戶，無前綴）
// ym: 西元年後兩碼＋月（YYMM，台北時區）
export const codeCounters = pgTable('code_counters', {
  kind: text('kind').notNull(),
  ym: text('ym').notNull(),
  lastSeq: integer('last_seq').default(0).notNull(),
}, (t) => [
  uniqueIndex('code_counters_pk').on(t.kind, t.ym),
]);

// 客戶↔教練 連結申請（雙向確認）：客戶端「選擇教練」送出 → 教練端「接受」才把 clients.coachId 設上。
// status: pending（待教練接受）/ accepted（已掛上）/ rejected（教練婉拒）
export const coachLinkRequests = pgTable('coach_link_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientUserId: text('client_user_id').notNull().references(() => clientUsers.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  status: text('status').default('pending').notNull(),
  note: text('note'), // 客戶留言（選填）
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
}, (t) => [
  // 教練端紅點（/api/pending-links）在每次導頁時打一次。
  index('clr_coach_pending_idx').on(t.coachId).where(sql`status = 'pending'`),
  index('clr_client_id_idx').on(t.clientId),
  index('clr_client_user_id_idx').on(t.clientUserId),
  // 「同一位客戶同時只能有一筆 pending」原本靠程式維護（先 update 再 insert，無交易），
  // 雙擊送出就會產生兩筆，教練端紅點永遠歸不了零。交由資料庫保證。
  uniqueIndex('clr_one_pending_per_client').on(t.clientId).where(sql`status = 'pending'`),
]);

// 共同執案（2026/08/24 Ray 拍板）：主責教練把名下某位客戶分享給其他教練「唯讀共看」。
//
// ⚠️ 這張表只放寬「讀」，不放寬「寫」。教練端的租戶維度仍然是 clients.coachId，
//    所有寫入路徑（lib/clients、lib/plans、lib/reviews、lib/revisions）一律只認 coachId＝自己；
//    協作者能看到的東西由 lib/clientCollab.ts 的 clientAccess() 決定。
//    要是哪天有人為了方便把這張表接進寫入條件，「唯讀協作」就當場變成「共同編輯」，
//    而畫面上完全看不出來 —— 邊界守在資料層，見 clients.ts 的 readableClient()。
//
// status: pending（待對方接受）/ accepted（生效中）/ declined（婉拒）/ revoked（主責移除）
// ⚠️ 客戶被移轉給別的教練時，這裡的協作關係**跟著客戶留著**（授權是對「這個案子」給的），
//    新主責可以自己移除。
export const clientCollaborators = pgTable('client_collaborators', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  // 發出邀請的主責教練（留紀錄用；客戶移轉後這裡仍是當初邀請的人）。
  invitedBy: text('invited_by').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  status: text('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
}, (t) => [
  // 一位客戶對一位教練只會有一列：重新邀請＝把同一列改回 pending，
  // 不是再 insert 一筆（否則婉拒過的人被重邀，清單上會同時看到兩種狀態）。
  uniqueIndex('ccollab_client_coach_uidx').on(t.clientId, t.coachId),
  // 協作者的「協作案件」清單與每頁的權限判定都沿這條走。
  index('ccollab_coach_status_idx').on(t.coachId, t.status),
  // 客戶詳情頁的協作面板。
  index('ccollab_client_id_idx').on(t.clientId),
  // invited_by 是 CASCADE：移除一位教練時 Postgres 要掃這張表找出他發出過的邀請，
  // 沒有索引就是全表掃描（而且刪除會連帶把別人案子的協作關係一起帶走，慢在鎖上）。
  index('ccollab_invited_by_idx').on(t.invitedBy),
]);

// 年度版本（每年重製一份完整規劃；整份案件存 data jsonb）
export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  // 雙軌：coach＝教練做的年度版；client＝客戶自己的人生護照。
  // 這是「結構鍵」，label 只是給人看的自由文字——舊版拿 label='人生護照' 當判斷，
  // 教練改個 label 就會讓客戶端找不到自己那份、fallback 到教練的版本上去寫。
  track: text('track').default('coach').notNull(), // coach / client
  label: text('label'),            // 例 2025版
  status: text('status').default('draft').notNull(), // draft/delivered/active/archived
  basedOnDate: date('based_on_date'),
  healthGrade: text('health_grade'),     // 快照
  netWorth: bigint('net_worth', { mode: 'number' }), // 快照
  data: jsonb('data').notNull(),   // 整份案件（v12 case 結構）
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 複合鍵同時服務 WHERE client_id 與 ORDER BY year DESC, created_at DESC。
  index('plans_client_id_year_idx').on(t.clientId, t.year.desc(), t.createdAt.desc()),
  // 「每年重製一份」是領域模型的前提（clonePlan 用 max(year)+1）。
  // 沒有這條約束時，新建客戶後再按一次「新增版本」就會出現兩筆同年版本（單機操作必然發生）。
  //
  // 加上 track：教練年度版與客戶人生護照是兩條並行的軌，同一年必須能各存一份。
  // 舊的 (client_id, year) 唯一鍵讓「客戶先玩護照(2026) → 掛上教練 → 教練要建 2026 年度版」
  // 直接撞鍵失敗（線上已有 4 位客戶卡在這個狀態）。
  uniqueIndex('plans_client_id_year_track_uidx').on(t.clientId, t.year, t.track),
]);

// 諮詢／檢視紀錄（掛客戶層的連續時間軸，可標記對應版本）
export const reviews = pgTable('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  type: text('type').default('review').notNull(), // 初談/季檢視/半年檢視/年度重製/臨時
  attendees: text('attendees'),
  summary: text('summary'),
  nextAppt: date('next_appt'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('reviews_client_id_idx').on(t.clientId),
  // deletePlan 觸發 ON DELETE SET NULL，沒有索引會全表掃 reviews。
  index('reviews_plan_id_idx').on(t.planId),
]);

// 動作項目（追蹤）
export const actionItems = pgTable('action_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  owner: text('owner'),
  dueDate: date('due_date'),
  done: boolean('done').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('action_items_client_id_idx').on(t.clientId),
  index('action_items_review_id_idx').on(t.reviewId),
]);

// 文件附件（保單/報稅/身分等）
export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  kind: text('kind'),
  filePath: text('file_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('attachments_client_id_idx').on(t.clientId),
]);

// ────────────────────────────────────────────────────────────
// 組織後台：業績／活動量／增員／公告（可編輯的模擬資料先進來）
// 業績資料來源尚未拍板（手動錄入／上傳／串接），故先以本表承載、可手動編修。
// ────────────────────────────────────────────────────────────

// 成員月度指標（每位教練每月一筆）：收益、成交案、活動量、目標、留存率。
export const memberMetrics = pgTable('member_metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),                 // 'YYYY-MM'
  income: bigint('income', { mode: 'number' }).default(0).notNull(),        // 本月收益（服務收入）
  incomeGoal: bigint('income_goal', { mode: 'number' }).default(0).notNull(),
  deals: integer('deals').default(0).notNull(),      // 成交案件數
  dealsGoal: integer('deals_goal').default(0).notNull(),
  newClients: integer('new_clients').default(0).notNull(),
  visits: integer('visits').default(0).notNull(),    // 活動量：拜訪
  calls: integer('calls').default(0).notNull(),      // 電話
  proposals: integer('proposals').default(0).notNull(), // 提案
  closes: integer('closes').default(0).notNull(),    // 成交
  activityGoal: integer('activity_goal').default(0).notNull(),
  retentionRate: integer('retention_rate').default(0).notNull(), // 客戶留存率 %
  ceHours: integer('ce_hours').default(0).notNull(),        // 進修時數（已完成）
  ceHoursGoal: integer('ce_hours_goal').default(12).notNull(),
  licenseNote: text('license_note'),                        // 證照展延提醒（如 CFP 2026/11）
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 「每位教練每月一筆」是這張表的前提（home.ts 的 map.set 直接假設一筆）。
  // 少了這條約束，同一 (coach, period) 有兩筆時核心成員頁的 trend 是 `+=` 累加 → 同一筆業績算兩次、
  // 達成率直接翻倍，而且畫面上看不出是 bug。
  uniqueIndex('member_metrics_coach_period_uidx').on(t.coachId, t.period),
]);

// 增員 pipeline（每位增員負責人底下的準增員名單與階段）。
// stage: prospect（準增員）/ contact（接觸）/ interview（面談）/ offer（錄取）/ onboard（到職）
export const recruits = pgTable('recruits', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerCoachId: text('owner_coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  candidateName: text('candidate_name').notNull(),
  source: text('source'),
  stage: text('stage').default('prospect').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('recruits_owner_coach_id_idx').on(t.ownerCoachId),
]);

// 公告（全組織共用）。category: important（重要）/ activity（活動）/ general（一般）
export const announcements = pgTable('announcements', {
  id: uuid('id').defaultRandom().primaryKey(),
  category: text('category').default('general').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  pinned: boolean('pinned').default(false).notNull(),
  author: text('author'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 品牌 / 後台設定（每位教練一組；Logo 上傳）
// 全組織品牌以「org 擁有者(owner)」這一列為準：全員讀 owner 的設定。
// logoUrl：橫式 logo（透明底，供頂欄與報告書封面）。
// iconUrl：512×512 方形 icon（供 favicon 與 PWA 安裝圖示）。
export const orgSettings = pgTable('org_settings', {
  coachId: text('coach_id').primaryKey().references(() => coaches.id, { onDelete: 'cascade' }),
  logoUrl: text('logo_url'),
  iconUrl: text('icon_url'),
  brandName: text('brand_name').default('嵐途 LAN TU'),
  slogan: text('slogan').default('理解自己・做出選擇・走向未來'),
  reportFooter: text('report_footer'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 編輯版本快照：plan 每次存檔存一版，標記編輯者（教練/客戶）。共用一份、版本歷史取代鎖定。
export const planRevisions = pgTable('plan_revisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  editorType: text('editor_type').notNull(), // coach / client
  editorId: text('editor_id'),
  editorName: text('editor_name'),
  data: jsonb('data').notNull(),
  // 內容指紋（sha256 of JSON.stringify(data)）。前端是 700ms debounce 自動存檔，
  // 大量版本其實內容一模一樣；寫入前比對上一版的 hash 相同就整個跳過。
  // ⚠️ 可為 null：這個欄位是後來才加的，既有 2,287 列都沒有 hash。
  //    比不到 hash 一律視為「不同」（寧可多寫一列，也不能漏掉真的有改的那一版）。
  dataHash: text('data_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 全庫成長最快的表；版本紀錄頁與 plan 刪除的 cascade 都靠它。
  // 「取該 plan 最新一列的 hash」與「刪掉最近 200 列以外的」也都走這條索引。
  index('plan_revisions_plan_id_created_at_idx').on(t.planId, t.createdAt.desc()),
]);

// 教練反向邀請：教練產生邀請碼/連結，客戶開啟即掛到該教練（教練主動＝視同已同意）。
export const coachInvites = pgTable('coach_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  note: text('note'),
  usedByClientUserId: text('used_by_client_user_id').references(() => clientUsers.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('coach_invites_coach_id_idx').on(t.coachId),
  // used_by_client_user_id 是 SET NULL：刪一位 client_user 會掃全表找他用過的邀請碼。
  index('coach_invites_used_by_idx').on(t.usedByClientUserId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// 業務制度（財務顧問業務制度辦法）
//
// 設計原則（見 docs/業務制度_V4.md）：
// 1. 所有「數字」欄位一律 nullable ——「留空」＝該門檻不檢查／該規則不計算，不是 0。
//    後台預設全空白，可一鍵載入 V4 辦法數值。
// 2. 版本化：每個制度版本一列 comp_versions，底下掛自己的職級表與門檻表。
//    案件永遠指向「簽約當下的版本」，改制度不回頭改舊分潤（辦法第三十一條）。
// 3. 職級不是寫死的 enum 而是一張可編輯的表 —— 制度日後可增設階級或改名。
// ─────────────────────────────────────────────────────────────────────────────

// 制度版本。status: draft（草稿，可試算不影響正式）/ active（生效中）/ archived（已封存）。
// settings：所有單值參數與開關的 jsonb（型別見 src/lib/comp/types.ts 的 CompSettings）。
//           key 不存在 ＝ 未設定；引擎遇到未設定的門檻是「跳過」而非擋人。
export const compVersions = pgTable('comp_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  version: text('version').notNull(),                 // 'V4.0'
  effectiveFrom: date('effective_from'),
  status: text('status').default('draft').notNull(),
  changeNote: text('change_note'),
  settings: jsonb('settings').default({}).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // getActiveVersion() 的熱路徑（每次載入制度頁／試算／算分潤都會查）。
  index('comp_versions_status_idx').on(t.status),
]);

// 職級與分潤率（辦法第四、五條）。seq 決定高低順序，晉升表與差％引擎都靠它。
// promoPct／execPct 為百分比數值（可小數），null＝未設定。
export const compRanks = pgTable('comp_ranks', {
  id: uuid('id').defaultRandom().primaryKey(),
  versionId: uuid('version_id').notNull().references(() => compVersions.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  groupName: text('group_name'),                      // 認證顧問／資深顧問／首席顧問
  tierLabel: text('tier_label'),                      // 一階／二階／三階
  code: text('code').notNull(),                       // C1 / S2 / CHIEF…
  // 這組職級表屬於哪個服務模塊；''＝預設表（所有模塊的 fallback）。
  // 用空字串而不是 NULL：Postgres 的 UNIQUE 對 NULL 視為互異，
  // 預設表就會被允許出現重複的 code，引擎查表時取到哪一筆全看排序運氣。
  moduleCode: text('module_code').default('').notNull(),
  promoPct: doublePrecision('promo_pct'),
  execPct: doublePrecision('exec_pct'),
  // ── 使用權益（2026/08/22）──
  // 只有預設表（module_code=''）的這三欄有意義：模塊自訂職級表是拿來調分潤率的，
  // 客戶上限與定價是「這個人買了什麼」，跟他這一案賣哪個模塊無關。
  clientCap: integer('client_cap'),                   // 客戶資料庫上限；留空＝不限制
  priceMonth: bigint('price_month', { mode: 'number' }),  // 月費（元）
  priceYear: bigint('price_year', { mode: 'number' }),    // 年費（元）
}, (t) => [
  index('comp_ranks_version_id_idx').on(t.versionId),
  // 同一版本、同一模塊內職級代號唯一 —— 引擎全部以 code 查表，重複會靜默算錯人。
  uniqueIndex('comp_ranks_version_module_code_uidx').on(t.versionId, t.moduleCode, t.code),
]);

// 服務模塊（每種服務內容各自的分潤結構）。
// 比例欄留空＝沿用全域 settings；沒有自訂職級表就用預設那組（module_code=''）。
// splitMode: chain（差％逐層）/ flat（執行者與推廣者各拿固定 %，其餘歸公司）
export const compModules = pgTable('comp_modules', {
  id: uuid('id').defaultRandom().primaryKey(),
  versionId: uuid('version_id').notNull().references(() => compVersions.id, { onDelete: 'cascade' }),
  seq: integer('seq').default(0).notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  splitMode: text('split_mode').default('chain').notNull(),
  splitPromoPct: doublePrecision('split_promo_pct'),
  splitExecPct: doublePrecision('split_exec_pct'),
  flatExecPct: doublePrecision('flat_exec_pct'),
  flatPromoPct: doublePrecision('flat_promo_pct'),
  price: bigint('price', { mode: 'number' }),          // 留空＝每案自行輸入實收
  countPromotion: boolean('count_promotion').default(true).notNull(),
  countMaintenance: boolean('count_maintenance').default(true).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  note: text('note'),
}, (t) => [
  index('comp_modules_version_id_idx').on(t.versionId),
  // 模塊代號是案件與職級表的外部參照鍵（comp_cases.module_code / comp_ranks.module_code），
  // 重複會讓同一個代號指到兩套分潤結構。
  uniqueIndex('comp_modules_version_code_uidx').on(t.versionId, t.code),
]);

// 門檻通用表：晉升 A 軌／B 軌（第十一、十二條）與真除（第十五條）共用一張。
// kind: promotion_a / promotion_b / tenure
//   promotion_a：fromCode → toCode，需 cases + fees
//   promotion_b：再加 teamCases 與育成條件（mentorCount 位 mentorRankCode 以上）
//   tenure     ：fromCode 為 null，toCode ＝ 核定職級
export const compThresholds = pgTable('comp_thresholds', {
  id: uuid('id').defaultRandom().primaryKey(),
  versionId: uuid('version_id').notNull().references(() => compVersions.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  seq: integer('seq').default(0).notNull(),
  fromCode: text('from_code'),
  toCode: text('to_code').notNull(),
  cases: integer('cases'),
  fees: bigint('fees', { mode: 'number' }),
  teamCases: integer('team_cases'),
  mentorCount: integer('mentor_count'),
  mentorRankCode: text('mentor_rank_code'),
  extraNote: text('extra_note'),
  enabled: boolean('enabled').default(true).notNull(),
}, (t) => [
  index('comp_thresholds_version_id_idx').on(t.versionId),
  // 每個版本、每種軌別、每個目標職級只有一列 —— 少了它，重複列會讓晉升判定看到兩套門檻。
  uniqueIndex('comp_thresholds_version_kind_to_uidx').on(t.versionId, t.kind, t.toCode),
]);

// ── 業務制度 波2：案件與分潤 ─────────────────────────────────────────────────

// 案件。versionId 是「簽約當下的制度版本」——分潤永遠用這一版算，
// 之後改制度不會回頭改舊案（辦法第三十一條）。
// clientId 允許為 null（客戶還沒進 CRM 也能先登錄案件），此時以 clientName 認人。
// caseYear：個案歸屬年度。同一自然人同年度的多筆服務合併為一個「個案」（第二十條），
//           合併是在統計時以 (客戶, 年度) 去重，不在這裡合併列——每筆收費仍各自分潤。
// status: open（未結案）/ closed（問卷回收）/ paid（分潤已發放）/ refunded（退費）/ void（作廢）
export const compCases = pgTable('comp_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  versionId: uuid('version_id').notNull().references(() => compVersions.id),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  clientName: text('client_name').notNull(),
  serviceType: text('service_type').default('full').notNull(),  // 舊欄位，保留不動（full / spot）
  // 服務模塊代號（comp_modules.code）。空字串＝沒指定模塊，走全域預設分潤結構。
  moduleCode: text('module_code').default('').notNull(),
  fee: bigint('fee', { mode: 'number' }).default(0).notNull(),
  isCompanyLead: boolean('is_company_lead').default(false).notNull(),
  promoterId: text('promoter_id').references(() => coaches.id, { onDelete: 'set null' }),
  // RESTRICT：分潤案件是財務紀錄，稽核上不可因刪帳號而消失。
  // 意即「曾經有過任何一筆案件的教練只能停權，不能移除」——這是刻意的。
  executorId: text('executor_id').notNull().references(() => coaches.id, { onDelete: 'restrict' }),
  signedAt: date('signed_at'),
  paidAt: date('paid_at'),          // 公司實際收訖日（未收訖不發分潤）
  surveyAt: date('survey_at'),      // 回饋問卷回收日（結案要件）
  caseYear: integer('case_year').notNull(),
  refundAmount: bigint('refund_amount', { mode: 'number' }).default(0).notNull(),
  status: text('status').default('open').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 個人指標（累計案數／顧問費）與顧問頁的熱路徑。
  index('comp_cases_executor_year_idx').on(t.executorId, t.caseYear),
  index('comp_cases_promoter_id_idx').on(t.promoterId),
  index('comp_cases_version_id_idx').on(t.versionId),
  index('comp_cases_client_id_idx').on(t.clientId),
  index('comp_cases_status_idx').on(t.status),
]);

// 分潤明細。一筆案件一次計算會產生多列（每位受分潤人一列＋公司列）。
// 重算一律「先把舊列標 void 再寫新列」，不做原地 update —— 保留稽核軌跡。
// payeeKey：payeeId ?? kind。Postgres 的 unique 對 NULL 視為互異，
//           公司列的 payeeId 是 null 會讓唯一鍵形同虛設，所以另存一個永不為 null 的鍵。
export const compPayouts = pgTable('comp_payouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').notNull().references(() => compCases.id, { onDelete: 'cascade' }),
  payeeId: text('payee_id').references(() => coaches.id, { onDelete: 'set null' }),
  payeeKey: text('payee_key').notNull(),
  payeeName: text('payee_name').notNull(),
  kind: text('kind').notNull(),        // advisor / company_ops / company_lead / company_remainder
  role: text('role'),
  rankCode: text('rank_code'),
  promoPct: doublePrecision('promo_pct').default(0).notNull(),
  execPct: doublePrecision('exec_pct').default(0).notNull(),
  bonusPct: doublePrecision('bonus_pct').default(0).notNull(),
  totalPct: doublePrecision('total_pct').default(0).notNull(),
  amount: bigint('amount', { mode: 'number' }).default(0).notNull(),
  batchId: uuid('batch_id').references(() => compBatches.id, { onDelete: 'set null' }),
  status: text('status').default('pending').notNull(), // pending / batched / paid / void
  trace: jsonb('trace').default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('comp_payouts_case_id_idx').on(t.caseId),
  index('comp_payouts_payee_id_idx').on(t.payeeId),
  index('comp_payouts_batch_id_idx').on(t.batchId),
  // 同一案件、同一受款人、同一種類，有效列只能有一筆。
  // 少了它，重算時漏標 void 就會把同一筆分潤發兩次，而且畫面上看不出來。
  uniqueIndex('comp_payouts_case_payee_active_uidx')
    .on(t.caseId, t.payeeKey).where(sql`status <> 'void'`),
]);

// 月結發放批次（辦法第二十二條：次月 N 日發放）。
export const compBatches = pgTable('comp_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  period: text('period').notNull(),                  // 'YYYY-MM'
  payoutDate: date('payout_date'),
  status: text('status').default('draft').notNull(), // draft / approved / paid
  totalAmount: bigint('total_amount', { mode: 'number' }).default(0).notNull(),
  approvedBy: text('approved_by').references(() => coaches.id, { onDelete: 'set null' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 一個月一批：少了它，重複按「產生批次」會把同一筆分潤分進兩批。
  uniqueIndex('comp_batches_period_uidx').on(t.period),
  // approved_by 是 SET NULL：移除／停用一位教練時要掃全表找他核可過的批次。
  index('comp_batches_approved_by_idx').on(t.approvedBy),
]);

// ── 業務制度 波3：訓練時數、職級異動 ────────────────────────────────────────

// 研討會場次（第十六條第二項）。hours 為每位出席者的基本認列時數。
export const compTrainingSessions = pgTable('comp_training_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  heldOn: date('held_on').notNull(),
  topic: text('topic').notNull(),
  mode: text('mode').default('onsite').notNull(),   // onsite / online / hybrid
  hours: doublePrecision('hours'),                  // null＝沿用制度設定的「每場認列」
  speakerId: text('speaker_id').references(() => coaches.id, { onDelete: 'set null' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('comp_training_sessions_held_on_idx').on(t.heldOn),
  // speaker_id 是 SET NULL：移除一位教練時要掃全表找他講過的場次。
  index('comp_training_sessions_speaker_id_idx').on(t.speakerId),
]);

// 訓練時數紀錄。kind: internal（出席內部場次）/ speaker（擔任講師）/ external（外部課程）。
// 外部課程要經核准才計入，且受年度上限限制（上限在計算時套用，不在這裡截斷——
// 截斷會讓「申請了多少」與「認列了多少」變成同一個數字，事後查不出原始申請）。
export const compTrainingRecords = pgTable('comp_training_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => compTrainingSessions.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  kind: text('kind').notNull(),
  hours: doublePrecision('hours').default(0).notNull(),
  title: text('title'),
  evidence: text('evidence'),
  status: text('status').default('approved').notNull(), // pending / approved / rejected
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('comp_training_records_coach_year_idx').on(t.coachId, t.year),
  index('comp_training_records_session_id_idx').on(t.sessionId),
  // 同一場次同一人只能有一筆出席紀錄（重複點名會讓時數翻倍）。
  uniqueIndex('comp_training_records_session_coach_uidx').on(t.sessionId, t.coachId, t.kind),
  // ⚠️ 上面那條的第一欄是 session_id，而線上課程補時數寫的是 session_id = NULL——
  //    Postgres 的 UNIQUE 對 NULL 視為互異，所以它一列都擋不住：
  //    「完課補時數」連點兩次就會讓維持資格的 trainHours 翻倍。
  //    憑證字串（evidence，例如 'learn:<courseId>'）才是真正的去重鍵，補一條 partial unique。
  //    evidence 為 null 的列（人工登錄的外部課程沒有憑證）不受這條約束。
  uniqueIndex('comp_training_records_coach_evidence_uidx')
    .on(t.coachId, t.evidence).where(sql`evidence is not null`),
]);

// 職級異動時間軸（晉升／真除轉正／人工調整／退費扣回）。
// reason: auto_a / auto_b / tenure / manual / refund
export const compRankEvents = pgTable('comp_rank_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  fromCode: text('from_code'),
  toCode: text('to_code'),
  reason: text('reason').notNull(),
  effectiveAt: date('effective_at'),
  operatorId: text('operator_id').references(() => coaches.id, { onDelete: 'set null' }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('comp_rank_events_coach_id_idx').on(t.coachId),
  // operator_id 是 SET NULL：移除一位管理者時要掃全表找他操作過的異動列。
  index('comp_rank_events_operator_id_idx').on(t.operatorId),
]);

// 年度維持資格快照（第十六～十九條）。每人每年一列，由排程或手動重算寫入。
export const compMaintenance = pgTable('comp_maintenance', {
  id: uuid('id').defaultRandom().primaryKey(),
  coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  execCases: integer('exec_cases').default(0).notNull(),
  trainHours: doublePrecision('train_hours').default(0).notNull(),
  execPass: boolean('exec_pass').default(false).notNull(),
  trainPass: boolean('train_pass').default(false).notNull(),
  exempt: boolean('exempt').default(false).notNull(),
  exemptReason: text('exempt_reason'),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 每人每年一列 —— 少了它，重算會疊出多列，畫面取到哪一列全看排序運氣。
  uniqueIndex('comp_maintenance_coach_year_uidx').on(t.coachId, t.year),
]);


// 回饋問卷（辦法第二十一條）。案件以問卷回收為結案要件，未回收不計晉升指標。
// 一個案件一份問卷（uniqueIndex），答案存 jsonb：題目本身在制度設定裡（surveyQuestions），
// 改題目不用改資料表，但已提交的問卷保留當時的題目文字，否則日後看不懂答案在回答什麼。
// submittedBy: client（客戶自填）/ coach（顧問代填，需註記）
export const compSurveys = pgTable('comp_surveys', {
  id: uuid('id').defaultRandom().primaryKey(),
  caseId: uuid('case_id').notNull().references(() => compCases.id, { onDelete: 'cascade' }),
  questions: jsonb('questions').default([]).notNull(),   // string[]：提交當下的題目
  answers: jsonb('answers').default([]).notNull(),       // string[]：與 questions 同序
  marketingOptIn: boolean('marketing_opt_in').default(false).notNull(),
  submittedBy: text('submitted_by').default('client').notNull(),
  submitterId: text('submitter_id'),                     // Clerk userId（客戶或代填的顧問）
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 一案一份 —— 重複提交是更新而不是長出第二份，否則「哪一份才算結案」沒有答案。
  uniqueIndex('comp_surveys_case_id_uidx').on(t.caseId),
]);


// 教練公開檔案（教練自填，展示於官網 /coaches 與客戶選教練流程）。
//
// 為什麼獨立一張表而不是塞進 coaches：coaches 已經很寬，
// 而且這裡的欄位性質完全不同 —— 那是帳號與制度，這是「對外的自我介紹」。
// 一位教練一份（coachId 當主鍵）。
//
// specialties 同時服務兩處：客戶選教練時的篩選，以及公司派案的候選排序。
// 清單本身在制度設定（settings.specialties），這裡存的是勾選結果。
//
// published：由**管理員**控制的下架開關（不是教練自選），預設公開。
// 未填檔案的教練不會出現在公開列表 —— 只有姓名的卡片對客戶沒有意義。
export const coachProfiles = pgTable('coach_profiles', {
  coachId: text('coach_id').primaryKey().references(() => coaches.id, { onDelete: 'cascade' }),
  headline: text('headline'),                  // 一句話標語
  bio: text('bio'),                            // 自我介紹
  specialties: text('specialties').array().default([]).notNull(),
  photoUrl: text('photo_url'),                 // 正方形大頭照（dataURL，前端壓過）
  yearsExp: integer('years_exp'),
  prevRole: text('prev_role'),                 // 前一份工作／背景
  credentials: text('credentials').array().default([]).notNull(),  // CFP／AFP…
  serviceModes: text('service_modes').array().default([]).notNull(), // 線上／實體
  areas: text('areas').array().default([]).notNull(),                // 服務地區
  published: boolean('published').default(true).notNull(),
  // selfHidden：**教練自己**的隱藏開關（2026/08/24 Ray 拍板），跟 published 是兩條獨立的線。
  //   published   ＝ 管理員下架，教練碰不到（saveProfile 刻意不寫它）
  //   selfHidden  ＝ 教練自己選擇不上官網，存檔就生效，不必管理員介入
  // ⚠️ 隱藏的只是「公開陳列」，不是「停止接客」：**教練編號照常有效**，
  //    已經拿到編號的客戶仍然指定得到他（見 lib/coachLink.ts findCoachByCode）。
  //    要真的停止收客戶請用 coaches.status='suspended'，那是另一條線。
  selfHidden: boolean('self_hidden').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 公開列表的過濾條件就是這兩欄（管理員沒下架、教練沒自己隱藏）。
  index('coach_profiles_published_idx').on(t.published, t.selfHidden),
]);

// 收支資債的「細類」字典（平台級，只有 admin 能改；見 /admin/categories）。
//
// 為什麼不讓後台直接加「大類」：引擎公式是拿大類的字串當鍵在算的
//   （支出 消費/其他＝可刪減、資產 可投資資產＝核心資產、負債 信貸＝消費性負債），
// 後台隨手多一個大類，財務比率會靜默算錯而且沒人會發現。
// 所以大類寫死在 financeCategories.defaults.ts 的 CAT_PARENTS，這張表只管細類，
// 每一列都要指名它預設落在哪個大類（parent）。
//
// riskAsset / liquidity / consumer 是「選了這個細類就一起寫進該筆資料列」的旗標，
// 因為引擎是純函式、讀不到這張表 —— 旗標必須跟著資料走（見 engine.ts isRiskAsset/isConsumerDebt）。
//
// isSystem 的列可停用、可改排序與大類，但不可刪：舊客戶的 plan.data 還指著這些字串。
export const financeCategories = pgTable('finance_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),              // income | expense | asset | liability
  parent: text('parent').notNull(),          // 引擎大類
  label: text('label').notNull(),            // 細類名稱（同時是存進 plan.data 的值）
  riskAsset: boolean('risk_asset').default(false).notNull(),
  liquidity: text('liquidity'),              // 資產：流動 / 固定
  consumer: boolean('consumer').default(false).notNull(),
  needsNote: boolean('needs_note').default(false).notNull(), // 選了要提示補明細（「其他」）
  sortOrder: integer('sort_order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 同一類別下不允許同名細類：label 就是寫進 plan.data 的字串，重名會讓資料無法回推設定。
  uniqueIndex('finance_categories_kind_label_uq').on(t.kind, t.label),
  index('finance_categories_kind_sort_idx').on(t.kind, t.sortOrder),
]);

// 保險商品輕量主檔（平台級，只有 admin 能改；見 /admin/categories 的第四區）。
//
// ⚠️ 這張表刻意**只當輸入輔助**：公司／英文代號／商品名稱／險種／主附約／停現售，就這些。
// 不存給付公式、不存費率、不存各年保障或解約金——那些是保險公司與資料商的授權資產，
// 而且一旦存了，這張表就會變成「哪張比較划算」的比較工具，那是銷售用途，不是嵐途的定位。
// 既有保單登錄的商品名稱是「事實登錄」（客戶已經買了什麼），跟方案配置表刻意留空的
// 「商品名稱」是兩件事——後者指向未來的購買決定，那一欄仍然不填。
//
// 沒有這張表也不會壞：保單卡的公司與名稱本來就是自由文字，這裡只是把它升級成可搜尋的建議清單。
export const insProducts = pgTable('ins_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  company: text('company').notNull(),        // 保險公司（顯示名，例如「國泰」）
  code: text('code').default('').notNull(),  // 英文代號；公司層的列留空字串（UNIQUE 對 NULL 視為互異，故不用 null）
  name: text('name').default('').notNull(),  // 商品名稱
  kind: text('kind').default('').notNull(),  // 商品總類：終身壽險 / 定期壽險 / 意外 / 醫療 …
  mainRider: text('main_rider').default('').notNull(), // 主約 / 附約
  onSale: boolean('on_sale').default(true).notNull(),  // 現售 / 停售
  bigCat: text('big_cat').default('人身').notNull(),   // 人身 / 產物
  sortOrder: integer('sort_order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 同一家公司底下不允許同代號。code 用空字串而不是 null，否則 Postgres 把 NULL 視為互異、約束形同虛設。
  uniqueIndex('ins_products_company_code_uq').on(t.company, t.code),
  index('ins_products_company_idx').on(t.company, t.sortOrder),
]);

// 各就學階段的教育費用參數（平台級，只有 admin 能改；見 /admin/edu-costs）。
// 客戶端「子女教育」依孩子年齡推出所在學段後，用這張表預填金額；每一格仍可逐筆覆寫。
// 金額一律「每學年（1 年）新台幣元」，且是**今日現值**——學費上漲率由引擎另外套。
export const eduCostParams = pgTable('edu_cost_params', {
  stage: text('stage').primaryKey(),         // 幼兒園 / 國小 / 國中 / 高中職 / 大學 / 研究所 / 博士班
  startAge: integer('start_age').notNull(),  // 該學段起始年齡
  years: integer('years').notNull(),         // 該學段年數
  publicTuition: integer('public_tuition').default(0).notNull(),   // 公立 年學雜費
  privateTuition: integer('private_tuition').default(0).notNull(), // 私立 年學雜費
  overseasTuition: integer('overseas_tuition').default(0).notNull(),// 海外 年學雜費+生活費
  extraFee: integer('extra_fee').default(0).notNull(),             // 年補習/才藝費
  careFee: integer('care_fee').default(0).notNull(),               // 年撫養費（非學雜費的生活開銷）
  sortOrder: integer('sort_order').default(0).notNull(),
  source: text('source'),                    // 資料來源註記（後台顯示，避免數字來歷不明）
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 生育費用參數（平台級，只有 admin 能改；見 /admin/categories 的「生育費用」分頁）。
//
// 為什麼另開一張而不是塞進 edu_cost_params：那張表的主鍵是「學段」，
// 每一列都必須有起始年齡與年數；生育費用是一組彼此無關的單價（一次性／每月／每年），
// 硬塞進去等於要給「月子中心」編一個假的學段起始年齡。
//
// 合併語意同 biz_tax_params：程式端的 birthCosts.defaults.ts 是骨幹，
// DB 有的那幾列覆蓋上去；誤刪一列只會回到內建值，不會讓前端拿到 undefined。
export const birthCostParams = pgTable('birth_cost_params', {
  key: text('key').primaryKey(),              // 對應 birthCosts.defaults.ts 的 key，例如 POSTPARTUM_CENTER_MONTH
  label: text('label').notNull(),             // 後台顯示名稱
  grp: text('grp').default('孕產').notNull(), // 分組：孕產 / 月子 / 育兒
  unit: text('unit').default('次').notNull(), // 次＝一次性 / 月＝每月 / 年＝每年
  amount: integer('amount').default(0).notNull(),  // 今日現值（元）
  basis: text('basis'),                       // 資料基準日，例如 2026-08
  note: text('note'),                         // 資料來源註記（後台顯示，避免數字來歷不明）
  sortOrder: integer('sort_order').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 企業／稅務法規常數（平台級，只有 admin 能改；見 /admin/categories 的第三區）。
//
// 為什麼這一塊要進 DB 而個人稅制不用：它改得比個人稅制勤，而且「改了沒更新」比「沒寫」更危險
// ——例如稅捐稽徵法 §41 的罰金上限 110 年修法後從 6 萬提高到 1,000 萬，
// 網路上仍有大量資料寫舊法。放進後台，Ray 或會計師發現法規變了可以當天改完，不必等改版。
//
// 程式端的 src/lib/bizTax.ts 是 seed 與 fallback：DB 沒有這一列就用內建值。
// basis = 這個數字的資料基準日（每個數字各自有效期不同，不共用一個全域日期才誠實）。
export const bizTaxParams = pgTable('biz_tax_params', {
  key: text('key').primaryKey(),              // 對應 bizTax.ts 的常數名，例如 PROFIT_TAX_RATE
  label: text('label').notNull(),             // 後台顯示名稱
  grp: text('grp').default('稅率').notNull(), // 分組：稅率 / 查核準則 / 罰則 / 水位
  unit: text('unit').default('rate').notNull(), // rate=比率(存小數) / money=金額 / x=倍數
  value: doublePrecision('value').notNull(),
  basis: text('basis'),                       // 資料基準日，例如 2026-08
  note: text('note'),                         // 法源或備註（避免數字來歷不明）
  sortOrder: integer('sort_order').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── 教練學習區（2026/08/22）──────────────────────────────────────────
// 課程 → 單元 → 完成紀錄。定位是「內部教育訓練的教材庫」，跟 comp_training_*
// （制度用的訓練時數帳）刻意分開：那邊算的是「時數認列」，這邊管的是「教材與看完沒」。
// 兩者的接點只有一個：課程可設 trainingHours，全部單元完成時補寫一筆時數紀錄。
//
// 影片與檔案一律存「外部連結」（YouTube / Vimeo / Google Drive / 雲端硬碟）——
// 專案沒有檔案儲存服務，直接收上傳會讓 500KB 的 base64 塞進 Postgres。
export const learnCourses = pgTable('learn_courses', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  summary: text('summary'),
  category: text('category').default('').notNull(),   // 分類（新人必修／保障／企業主…），自由文字
  coverUrl: text('cover_url'),
  // 最低可見級別：對照 comp_ranks.seq。留空＝所有教練都看得到。
  // 存 seq 不存 code：職級表可以在後台改代號，seq 是排序語意，改代號不會讓可見範圍錯位。
  minRankSeq: integer('min_rank_seq'),
  trainingHours: doublePrecision('training_hours'),   // 完課認列時數；留空＝不認列
  sortOrder: integer('sort_order').default(0).notNull(),
  published: boolean('published').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('learn_courses_published_idx').on(t.published, t.sortOrder),
]);

// 單元。kind: video（可內嵌影片連結）/ doc（文件連結）/ link（一般連結）/ text（純文字講義）
export const learnLessons = pgTable('learn_lessons', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').notNull().references(() => learnCourses.id, { onDelete: 'cascade' }),
  seq: integer('seq').default(0).notNull(),
  title: text('title').notNull(),
  kind: text('kind').default('video').notNull(),
  url: text('url'),
  body: text('body'),                                  // kind='text' 時的講義內容
  durationMin: integer('duration_min'),
  note: text('note'),
}, (t) => [
  index('learn_lessons_course_seq_idx').on(t.courseId, t.seq),
]);

// 完成紀錄。一人一單元只有一筆 —— 少了唯一鍵，重複點「標記完成」會讓完成率超過 100%。
export const learnProgress = pgTable('learn_progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').notNull().references(() => learnLessons.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => learnCourses.id, { onDelete: 'cascade' }),
  completedAt: timestamp('completed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('learn_progress_coach_lesson_uidx').on(t.coachId, t.lessonId),
  index('learn_progress_coach_course_idx').on(t.coachId, t.courseId),
]);

/* ══════════════════════════════════════════════════════════════════════
   區塊註記 ＋ 一場諮詢
   ══════════════════════════════════════════════════════════════════════ */

// 區塊註記：「這個數字為什麼是這樣」的說明。
//
// ⚠️ 主鍵刻意掛在 **客戶** 身上，不掛年度版本。
//    「這位客戶的房貸在他媽媽名下，不計入負債」明年一樣成立——綁在 plan 上
//    就得每年重打一次，而年度重製（複製去年成今年）是這套系統最常走的動線。
//
// visible 的 default 是 false 而且是**資料庫層**的預設：註記會被印進帶公司抬頭的
// 客戶文件，嵐途是一般顧問公司、不得從事保險招攬或投資顧問，所以「不小心印出去」
// 的成本遠高於「忘記勾」。authorAccess 不是 'owner' 的列一律不得為 true，
// 由 lib/notes.ts 在寫入時強制覆寫（不是靠 UI 擋）。
export const clientNotes = pgTable('client_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  // null ＝ 日常維護（沒開諮詢時寫的）。場次被刪不該連帶刪掉註記，所以是 set null。
  sessionId: uuid('session_id').references((): AnyPgColumn => consultSessions.id, { onDelete: 'set null' }),
  blockKey: text('block_key').notNull(),               // 'coverage.five' / 'policy:<pid>' …
  kind: text('kind').default('basis').notNull(),       // basis 依據 / decision 決定 / todo 待辦
  body: text('body').notNull(),
  visible: boolean('visible').default(false).notNull(),
  authorType: text('author_type').default('coach').notNull(),   // coach / client
  authorId: text('author_id'),
  authorName: text('author_name'),
  // owner 主責 / viewer 唯讀協作教練 / client 客戶本人。viewer 與 client 永遠 visible=false。
  authorAccess: text('author_access').default('owner').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('client_notes_client_block_idx').on(t.clientId, t.blockKey),
  index('client_notes_session_idx').on(t.sessionId),
  index('client_notes_client_created_idx').on(t.clientId, t.createdAt.desc()),
]);

// 一場諮詢：把「這次談了什麼」變成諮詢過程的副產品，而不是事後回想補寫的作業。
//
// revisionId 是開場那一刻釘住的版本快照 —— 現有的還原功能叫「第 37 版」，
// 諮詢當下沒有人想得起來去點它；有了場次它才有講得出口的名字：
// 「回到上次諮詢開始時的狀態」。
//
// metricsBefore / metricsAfter 存的是 shortPV 等指標，摘要靠它算出「這次改善多少」——
// 評判標準是「比原本更優化」而不是「補平」。
export const consultSessions = pgTable('consult_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').references(() => plans.id, { onDelete: 'set null' }),
  revisionId: uuid('revision_id').references(() => planRevisions.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  // manual 手動結束 / superseded 開了新的一場 / auto 隔天自動封場。
  // ⚠️ 忘記按結束是必然會發生的，而且絕不能造成資料損失——最多只是摘要沒被人工整理過。
  closeReason: text('close_reason'),
  reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'set null' }),
  metricsBefore: jsonb('metrics_before'),
  metricsAfter: jsonb('metrics_after'),
  // 收尾時教練自己從頭寫的一整段。
  // 跟自動聚合的摘要不衝突：聚合負責「不漏」，這一段負責講那些不屬於任何單一區塊的話
  // （客戶今天的狀態、談話的氣氛、下一步的判斷）。訪談問卷的最後一題就是它。
  closingNote: text('closing_note'),
  // ⚠️⚠️ 2026/08/28：「結束並摘要」從一個原子動作拆成兩段——按結束時定案客戶可見、
  // 算後指標、產草稿、封場；教練在表單裡改完（可改日期、類型、貼全文）按存檔才產 review。
  // 中間如果他把視窗關掉，場次已封但紀錄還沒生出來 → 草稿必須落地，否則就是資料損失
  // （違反「忘記按結束絕不能造成資料損失」那條原則）。有 draft_summary 而 review_id 還是
  // null 的場次＝「摘要還沒存」，客戶詳情頁與規劃編輯器都會跳提醒。
  draftSummary: text('draft_summary'),
}, (t) => [
  index('consult_sessions_client_started_idx').on(t.clientId, t.startedAt.desc()),
  // 一位客戶同時只能有一場未結束的諮詢。少了這條，忘記按結束又開新的一場，
  // 註記會同時歸屬兩場，摘要範圍就永遠對不起來。
  uniqueIndex('consult_sessions_one_open_per_client').on(t.clientId).where(sql`ended_at is null`),
]);

// 客戶分析頁模組的「全平台預設順序」（2026/08/25）。
//
// 教練自己在分析頁拖出來的順序存 localStorage（逐客戶、逐台電腦），那是他個人的視角；
// 這張表是另一層：後台定一份，所有教練打開任何客戶時的**起手順序**就是它。
// 兩層的關係刻意是「後台管起手、教練管當下」——後台改了不會回頭覆蓋教練已經調過的客戶，
// 教練按「恢復預設」才會重新吃這一份。
//
// key 對應 src/lib/analysisModules.ts 的 AN_MODULES（也就是 lantu-app.html 的模組鍵）。
// ⚠️ 合併語意與 biz_tax_params 同一套：DB 有的覆蓋、沒有的接在後面，
//    所以之後新增模組不會從畫面上消失，後台誤刪一列也只是那個模組回到隊尾。
export const anModuleDefaults = pgTable('an_module_defaults', {
  key: text('key').primaryKey(),
  sortOrder: integer('sort_order').notNull(),
  hidden: boolean('hidden').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── 報聘（教練申請）─────────────────────────────────────────────
//
// 2026/08/31 之前，申請表填的手機／現職／推薦人是被壓成一行字串塞進 `coaches.note` 的
// （`applyNote()`），核准時也完全不碰職級／上線／期限 —— 所以名冊上會長期累積
// 「開通了卻沒定級、沒設期限」的半成品帳號。這張表把申請資料從身分表拆出來：
//
//   · coaches  = 這個人是誰、能不能用（身分與權限，長期存在）
//   · 這張表   = 他當初怎麼進來的（路線、介紹人、自述、聲明、審核紀錄，一次性）
//
// ⚠️ 介紹人**同時**寫在兩個地方：這裡的 `introducerId` 是申請當下的事實（永遠不動），
//    `coaches.sponsorId` 是現在的推薦人（業績歸屬吃它，後台可改）。兩者刻意不合併。
// ⚠️ 一位教練只有一列（PK 就是 coachId）：重新送出申請是覆寫同一列，不是開新的一件。
export const coachApplications = pgTable('coach_applications', {
  coachId: text('coach_id').primaryKey().references(() => coaches.id, { onDelete: 'cascade' }),

  // referral＝介紹人推薦（要介紹人先確認）/ direct＝直接申請（直接進審核佇列）。
  route: text('route').default('referral').notNull(),

  // 介紹人解得到教練列就有 id；查無編號不擋送出（可能只是打錯），原字串一定留著給後台判斷。
  introducerId: text('introducer_id').references((): AnyPgColumn => coaches.id, { onDelete: 'set null' }),
  introducerCode: text('introducer_code'),

  phone: text('phone'),
  currentJob: text('current_job'),
  motive: text('motive'),              // 報聘動機
  experience: text('experience'),      // 相關經歷與可投入時間

  // 證照／資歷：結構化欄位，不收上傳檔（專案沒有檔案儲存服務）。
  licenses: jsonb('licenses').$type<ApplyLicense[]>().default([]).notNull(),
  // 勾選式聲明：key → 勾選當下的 ISO 時間戳。存 true 等於沒留證據，所以存時間。
  consents: jsonb('consents').$type<Record<string, string>>().default({}).notNull(),

  // pending / confirmed / declined / skipped（direct 路線一律 skipped）
  introducerState: text('introducer_state').default('pending').notNull(),
  introducerNote: text('introducer_note'),
  introducerActedAt: timestamp('introducer_acted_at', { withTimezone: true }),

  // 審核者逐項打勾：檢核項 key → 勾選當下的 ISO 時間戳。項目本身住 coach_apply_settings。
  reviewChecks: jsonb('review_checks').$type<Record<string, string>>().default({}).notNull(),
  reviewNote: text('review_note'),
  reviewerId: text('reviewer_id').references((): AnyPgColumn => coaches.id, { onDelete: 'set null' }),

  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 介紹人的待確認清單（/dashboard/requests）走這條。
  index('coach_applications_introducer_id_idx').on(t.introducerId),
  index('coach_applications_state_idx').on(t.introducerState),
]);

// 報聘的全平台設定（單列，id 固定 'default'）。
//
// 「審核者的判斷可以設定」＝這一列：核准時自動帶什麼（職級／上線／期限），
// 以及放行前一定要打勾的檢核表。與 an_module_defaults 一樣是「後台定一份、現場照著跑」。
//
// ⚠️ 沒有這一列時一律 fallback 到 DEFAULT_APPLY_SETTINGS（程式端常數），
//    所以 seed 沒跑過也不會讓報聘流程停擺。
export const coachApplySettings = pgTable('coach_apply_settings', {
  id: text('id').primaryKey(),                                   // 固定 'default'
  defaultRankCode: text('default_rank_code').default('C1'),      // null＝核准後維持未定級
  bindUplineToIntroducer: boolean('bind_upline_to_introducer').default(true).notNull(),
  requireIntroducerConfirm: boolean('require_introducer_confirm').default(true).notNull(),
  licenseOn: boolean('license_on').default(true).notNull(),      // 核准時要不要一併開通期限
  licenseUnit: text('license_unit').default('year').notNull(),   // month / year
  licenseQty: integer('license_qty').default(1).notNull(),
  requiredFields: jsonb('required_fields').$type<string[]>().default([]).notNull(),
  checklist: jsonb('checklist').$type<ChecklistItem[]>().default([]).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
