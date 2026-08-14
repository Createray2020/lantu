// 嵐途資料表（Drizzle / Neon Postgres）
// 三層：coaches → clients → plans(年度版本) / reviews(諮詢，掛客戶層) → action_items
import {
  pgTable, text, integer, bigint, boolean, jsonb, timestamp, uuid, date,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// 教練（對應 Clerk user id）
// role: coach（一般教練）/ admin（管理員，可進後台）
// status: pending（待審核）/ active（已開通）/ suspended（停權）
// orgRank（組織職級，決定首頁視角與可見範圍）：
//   member（顧問，只看自己）/ manager（主管，看下線子樹）/ owner（老闆，看全組織）
// uplineId：上線教練（自參照），組織樹的父節點；null＝頂點。
export const coaches = pgTable('coaches', {
  id: text('id').primaryKey(), // Clerk userId
  email: text('email'),
  name: text('name'),
  role: text('role').default('coach').notNull(),
  status: text('status').default('pending').notNull(),
  orgRank: text('org_rank').default('member').notNull(),
  uplineId: text('upline_id').references((): AnyPgColumn => coaches.id, { onDelete: 'set null' }),
  title: text('title'),           // 職稱顯示（資深財務顧問／處經理／執行長…）
  joinDate: date('join_date'),
  note: text('note'),           // 備註（聯絡方式／收款狀態等，後台用）
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 客戶登入帳號（雙邊平台：客戶自己上官網註冊、以客戶身分登入）
// 對應 Clerk user id；與 coaches 互斥（同一 Clerk 使用者不會同時是教練與客戶）。
// 注意：這是「客戶端登入者」，與下方 clients（顧問管理的 CRM 客戶）是不同物，
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
  coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contact: jsonb('contact').$type<{ phone?: string; email?: string; line?: string }>().default({}),
  source: text('source'),          // 轉介/講座/廣告/自來
  tags: text('tags').array().default([]),
  lifeStage: text('life_stage'),   // 單身/新婚/育兒/退休前/退休
  status: text('status').default('active').notNull(), // active/pending/archived
  birthDate: date('birth_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 年度版本（每年重製一份完整規劃；整份案件存 data jsonb）
export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  label: text('label'),            // 例 2025版
  status: text('status').default('draft').notNull(), // draft/delivered/active/archived
  basedOnDate: date('based_on_date'),
  healthGrade: text('health_grade'),     // 快照
  netWorth: bigint('net_worth', { mode: 'number' }), // 快照
  data: jsonb('data').notNull(),   // 整份案件（v12 case 結構）
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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
});

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
});

// 文件附件（保單/報稅/身分等）
export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  kind: text('kind'),
  filePath: text('file_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

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
});

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
});

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
