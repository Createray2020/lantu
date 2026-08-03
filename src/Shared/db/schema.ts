// 嵐途資料表（Drizzle / Neon Postgres）
// 三層：coaches → clients → plans(年度版本) / reviews(諮詢，掛客戶層) → action_items
import {
  pgTable, text, integer, bigint, boolean, jsonb, timestamp, uuid, date,
} from 'drizzle-orm/pg-core';

// 教練（對應 Clerk user id）
export const coaches = pgTable('coaches', {
  id: text('id').primaryKey(), // Clerk userId
  email: text('email'),
  name: text('name'),
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

// 品牌 / 後台設定（每位教練一組；Logo 上傳）
export const orgSettings = pgTable('org_settings', {
  coachId: text('coach_id').primaryKey().references(() => coaches.id, { onDelete: 'cascade' }),
  logoUrl: text('logo_url'),
  brandName: text('brand_name').default('嵐途 LAN TU'),
  slogan: text('slogan').default('理解自己・做出選擇・走向未來'),
  reportFooter: text('report_footer'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
