// 嵐途資料表（Drizzle / Neon Postgres）
// 三層：coaches → clients → plans(年度版本) / reviews(諮詢，掛客戶層) → action_items
import { sql } from 'drizzle-orm';
import {
  pgTable, text, integer, bigint, boolean, jsonb, timestamp, uuid, date,
  doublePrecision, index, uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ⚠️ 索引一律宣告在這裡再跑 db:generate。
//    直接用 psql 手建的索引不在 schema 快照裡，之後任何人跑 `npm run db:push`
//    都會把它們默默 DROP 掉（Postgres 也不會自動幫 FK 建索引）。

// 教練（對應 Clerk user id）
// role: coach（一般教練）/ admin（管理員，可進後台）
// status: pending（待審核）/ active（已開通）/ suspended（停權）
// orgRank（組織職級，決定首頁視角與可見範圍）：
//   member（教練，只看自己）/ manager（主管，看下線子樹）/ owner（老闆，看全組織）
// uplineId：上線教練（自參照），組織樹的父節點；null＝頂點。
export const coaches = pgTable('coaches', {
  id: text('id').primaryKey(), // Clerk userId
  email: text('email'),
  name: text('name'),
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
}, (t) => [
  // 自參照 FK：刪除教練時的 ON DELETE SET NULL 需要它，否則每次刪除都要全表掃。
  index('coaches_upline_id_idx').on(t.uplineId),
  // listActiveCoaches / getOrgOwnerId 的熱路徑。
  index('coaches_status_idx').on(t.status),
  // 推薦人也是自參照 FK（代管移轉與同業招募業績歸屬都要沿它查）。
  index('coaches_sponsor_id_idx').on(t.sponsorId),
]);

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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 教練端每一頁的第一個查詢（列表另有 ORDER BY updated_at DESC）。
  index('clients_coach_id_updated_at_idx').on(t.coachId, t.updatedAt.desc()),
  // 客戶端 /portal 每個頁面/動作都用它反查，且程式全篇假設 1:1（七處 limit(1)）。
  // Postgres 的 UNIQUE 允許多個 NULL，所以教練建立的客戶（clientUserId=null）不受影響。
  uniqueIndex('clients_client_user_id_uidx').on(t.clientUserId),
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
  // 少了這條約束，同一 (coach, period) 有兩筆時老闆頁的 trend 是 `+=` 累加 → 同一筆業績算兩次、
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 全庫成長最快的表；版本紀錄頁與 plan 刪除的 cascade 都靠它。
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
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 公開列表只撈上架的；未上架的不該進入客戶視野。
  index('coach_profiles_published_idx').on(t.published),
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
