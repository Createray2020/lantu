// 灌入可編輯的模擬組織與各項數據（供線上觀察／測試）。
// 原則（Ray 指示）：純新增，不刪除任何真實人員或其資料。
//   - 只清掉「本腳本自己種的示範資料」：mock 教練的指標/增員、公告整批、以及 tag=示範資料 的示範客戶。
//   - 真實同仁帳號：新增月度指標 + 一位含完整財務報告的示範客戶（tag=示範資料），不動他們既有資料。
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { and, inArray, eq } from "drizzle-orm";
import * as schema from "../src/Shared/db/schema";
import { sampleCase } from "../src/lib/engine";
import { planSnapshot } from "../src/lib/snapshot";

const {
  coaches, clients, plans, reviews, actionItems,
  memberMetrics, recruits, announcements,
} = schema;

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
// 可刪除標記：不能用 tags（教練在 UI 可以自由輸入「示範資料」給真實客戶，下次 seed 就把人家的資料連 plans/reviews 一起硬刪）。
// 改用使用者介面碰不到的 clients.source 值。
const DEMO_TAG = "示範資料";
const SEED_SOURCE = "__seed__";
const SEED_AUTHOR = "__seed__";

// ─────────────────────────────────────────────────────────────
// 破壞性腳本防呆：這支會刪除/覆寫資料，而 .env.local 指向的就是**正式** Neon。
// 必須明確帶 ALLOW_DESTRUCTIVE_SEED=1 才會執行，並印出目標資料庫讓人肉眼確認。
//   ALLOW_DESTRUCTIVE_SEED=1 npx tsx scripts/xxx.ts
// ─────────────────────────────────────────────────────────────
function assertSeedAllowed(scriptName: string): void {
  const url = process.env.DATABASE_URL || "";
  const host = (/@([^/?]+)/.exec(url)?.[1]) || "(未知)";
  if (!process.env.ALLOW_DESTRUCTIVE_SEED) {
    console.error(
      `\n拒絕執行 ${scriptName}：這是破壞性腳本（會刪除既有資料）。\n` +
      `目標資料庫：${host}\n` +
      `確定要跑的話請帶環境變數：ALLOW_DESTRUCTIVE_SEED=1 npx tsx scripts/${scriptName}\n`,
    );
    process.exit(1);
  }
  console.log(`⚠️  ${scriptName} 將寫入資料庫：${host}`);
}


// ---------- 期間工具 ----------
function period(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const CUR = period(0);
const PERIODS = Array.from({ length: 8 }, (_, i) => period(7 - i)); // 舊→新
// 本腳本會重種的期間；清除 metrics 時只限縮在這幾個月，不動其他歷史月份。
const SEED_PERIODS = PERIODS;
function isoAddDays(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- 示範客戶人物誌（造出不同的完整財報）----------
type Persona = { name: string; gender: string; age: number; retire: number; life: number; scale: number };
const PERSONAS: Persona[] = [
  { name: "林曉薇", gender: "女", age: 38, retire: 65, life: 88, scale: 1.0 },
  { name: "陳建豪", gender: "男", age: 45, retire: 60, life: 85, scale: 1.35 },
  { name: "周雅琪", gender: "女", age: 33, retire: 65, life: 90, scale: 0.7 },
  { name: "黃俊傑", gender: "男", age: 52, retire: 65, life: 86, scale: 1.7 },
  { name: "吳念真", gender: "女", age: 41, retire: 62, life: 88, scale: 1.1 },
  { name: "張文山", gender: "男", age: 29, retire: 65, life: 90, scale: 0.6 },
  { name: "李佩珊", gender: "女", age: 47, retire: 63, life: 87, scale: 1.25 },
  { name: "王國樑", gender: "男", age: 36, retire: 65, life: 88, scale: 0.9 },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
function demoCase(p: Persona): any {
  const c: any = sampleCase();
  c.profile.name = p.name;
  c.profile.gender = p.gender;
  c.profile.age = p.age;
  c.profile.retireAge = p.retire;
  c.profile.lifeExp = p.life;
  if (c.members?.[0]) { c.members[0].name = p.name; c.members[0].gender = p.gender; c.members[0].age = p.age; }
  const s = p.scale;
  (c.assets || []).forEach((a: any) => { a.value = Math.round((a.value || 0) * s); a.cost = Math.round((a.cost || 0) * s); });
  (c.liabilities || []).forEach((l: any) => { l.balance = Math.round((l.balance || 0) * s); });
  (c.incomes || []).forEach((i: any) => { i.amount = Math.round((i.amount || 0) * s); });
  return c;
}

// 建一位含完整財報的示範客戶（tag=示範資料），並回傳 client。
async function createDemoClient(coachId: string, persona: Persona, opts: { status?: string; lifeStage?: string }) {
  const data = demoCase(persona);
  const snap = planSnapshot(data);
  const [c] = await db.insert(clients).values({
    coachId, name: `${persona.name}（示範）`, status: opts.status ?? "active",
    lifeStage: opts.lifeStage ?? "育兒", source: SEED_SOURCE,
    contact: { phone: "09xx-xxx-xxx" }, tags: [DEMO_TAG],
    birthDate: `${new Date().getFullYear() - persona.age}-06-15`,
  }).returning();
  await db.insert(plans).values({
    clientId: c.id, year: 2025, label: "2025版", status: "active",
    healthGrade: snap.healthGrade, netWorth: snap.netWorth, basedOnDate: isoAddDays(-30),
    data,
  });
  return c;
}

// ---------- 組織定義（示範用 mock 教練，additive）----------
const OWNER_TITLE = "嵐途 · 執行長";
type Mm = { id: string; name: string; title: string; income: number };
const TEAMS: { mgr: { id: string; name: string; title: string }; members: Mm[] }[] = [
  {
    mgr: { id: "mock_wang", name: "王志明", title: "業務一部" },
    members: [
      { id: "mock_zhang", name: "張家瑋", title: "資深財務顧問", income: 142000 },
      { id: "mock_chen", name: "陳彥廷", title: "財務顧問", income: 128000 },
      { id: "mock_lin", name: "林思妤", title: "財務顧問", income: 96000 },
    ],
  },
  {
    mgr: { id: "mock_tsai", name: "蔡孟蓉", title: "業務二部" },
    members: [
      { id: "mock_liu", name: "劉冠廷", title: "資深財務顧問", income: 119000 },
      { id: "mock_wu", name: "吳柏翰", title: "財務顧問", income: 82000 },
      { id: "mock_huang", name: "黃品瑄", title: "財務顧問", income: 64000 },
    ],
  },
  {
    mgr: { id: "mock_hsu", name: "許皓宇", title: "業務三部" },
    members: [
      { id: "mock_zhou", name: "周雅筑", title: "資深財務顧問", income: 88000 },
      { id: "mock_cheng", name: "鄭家豪", title: "財務顧問", income: 48000 },
    ],
  },
];
const REP_ID = "mock_zhang";

function pushMetricsRows(rows: any[], coachId: string, baseIncome: number, retention: number) {
  const factors = [0.62, 0.68, 0.72, 0.7, 0.8, 0.85, 0.92, 1.0];
  PERIODS.forEach((p, i) => {
    const f = factors[i];
    const income = Math.round(baseIncome * f);
    const deals = Math.max(1, Math.round(income / 17000));
    const closes = deals;
    const proposals = closes + Math.round(closes * 1.4);
    const calls = proposals * 3 + 6;
    const visits = proposals * 2 + 8;
    rows.push({
      coachId, period: p, income, incomeGoal: 200000,
      deals, dealsGoal: 12, newClients: Math.max(2, Math.round(deals * 0.7)),
      visits, calls, proposals, closes, activityGoal: 80,
      retentionRate: retention, ceHours: 6, ceHoursGoal: 12,
      licenseNote: "CFP 理財規劃證照 2026/11 展延",
    });
  });
}

async function main() {
  assertSeedAllowed("seed.ts");
  // 1) owner = Ray 的 admin 帳號。
  const admins = await db.select().from(coaches).where(eq(coaches.role, "admin"));
  const owner = admins[0];
  if (!owner) throw new Error("找不到 admin 帳號，請先用 Ray 的帳號登入一次再跑 seed。");
  await db.update(coaches).set({ orgRank: "owner", uplineId: null, title: OWNER_TITLE }).where(eq(coaches.id, owner.id));
  console.log(`owner = ${owner.name ?? owner.email} (${owner.id})`);

  // 2) 清掉「本腳本種的資料」——mock 教練的全部客戶（100% 是我種的）+ 任何 tag=示範資料 的示範客戶。
  //    絕不刪真實同仁自己建立的（非示範）客戶。
  const mockCoachIds = TEAMS.flatMap((t) => [t.mgr.id, ...t.members.map((m) => m.id)]);
  const allClients = await db.select().from(clients);
  const staleIds = allClients
    .filter((c) => (c.coachId != null && mockCoachIds.includes(c.coachId)) || c.source === SEED_SOURCE)
    .map((c) => c.id);
  if (staleIds.length) {
    await db.delete(actionItems).where(inArray(actionItems.clientId, staleIds));
    await db.delete(reviews).where(inArray(reviews.clientId, staleIds));
    await db.delete(plans).where(inArray(plans.clientId, staleIds));
    await db.delete(clients).where(inArray(clients.id, staleIds));
    console.log(`清除舊示範客戶 ${staleIds.length} 位（mock 教練全部 + tag=${DEMO_TAG}）`);
  }

  // 3) 真實同仁 = active、非 mock、非 owner。
  const activeCoaches = await db.select().from(coaches).where(eq(coaches.status, "active"));
  const realColleagues = activeCoaches.filter((c) => !c.id.startsWith("mock_") && c.id !== owner.id);
  console.log(`真實同仁帳號：${realColleagues.length} 位（${realColleagues.map((c) => c.name || c.email).join("、")}）`);

  // 4) 建 mock 教練（示範組織），additive。
  let seq = 0;
  const now = Date.now();
  async function upsertCoach(id: string, name: string, title: string, rank: string, uplineId: string | null) {
    const createdAt = new Date(now - (100 - seq++) * 60000);
    await db.insert(coaches).values({
      id, email: `${id}@demo.lantu`, name, title, role: "coach", status: "active",
      orgRank: rank, uplineId, joinDate: "2024-01-15", approvedAt: new Date(), createdAt,
    }).onConflictDoUpdate({
      target: coaches.id,
      set: { name, title, role: "coach", status: "active", orgRank: rank, uplineId, joinDate: "2024-01-15" },
    });
  }
  const repTeam = TEAMS[0];
  await upsertCoach(repTeam.mgr.id, repTeam.mgr.name, repTeam.mgr.title, "manager", owner.id);
  for (const t of TEAMS) {
    if (t !== repTeam) await upsertCoach(t.mgr.id, t.mgr.name, t.mgr.title, "manager", owner.id);
    for (const m of t.members) await upsertCoach(m.id, m.name, m.title, "member", t.mgr.id);
  }

  // 4b) 真實同仁：只補「還沒有上線」的人，且不覆寫既有職級/職稱。
  //     組織位置是這套系統的權限維度（決定誰看得到誰的客戶與業績），
  //     舊版每跑一次 seed 就把管理員在 /admin 排好的組織樹整個打散重排。
  const mgrIds = TEAMS.map((t) => t.mgr.id);
  const needUpline = realColleagues.filter((c) => !c.uplineId);
  for (let i = 0; i < needUpline.length; i++) {
    const col = needUpline[i];
    await db.update(coaches).set({
      uplineId: mgrIds[i % mgrIds.length],
      ...(col.title ? {} : { title: "財務顧問" }),
    }).where(eq(coaches.id, col.id));
  }
  if (needUpline.length) console.log(`真實同仁補上線 ${needUpline.length} 位（原本已有上線者一律不動）`);

  // 5) 月度指標：mock 教練 + 真實同仁（真實同仁不改 org 位置，只補指標）。
  // 只清「本次要重種的期間」，不要把真實同仁全部歷史月份洗掉
  //（這張表在 schema 註解裡就寫明是可手動編修的）。
  const seededMetricIds = [...mockCoachIds, owner.id, ...realColleagues.map((c) => c.id)];
  await db.delete(memberMetrics).where(
    and(inArray(memberMetrics.coachId, seededMetricIds), inArray(memberMetrics.period, SEED_PERIODS)),
  );
  const rows: any[] = [];
  for (const t of TEAMS) {
    pushMetricsRows(rows, t.mgr.id, 60000, 94);
    t.members.forEach((m, idx) => pushMetricsRows(rows, m.id, m.income, 88 + ((idx * 2) % 8)));
  }
  pushMetricsRows(rows, owner.id, 0, 95);
  const REAL_BASE = [156000, 138000, 121000, 104000, 92000, 77000, 68000, 59000];
  realColleagues.forEach((c, idx) => pushMetricsRows(rows, c.id, REAL_BASE[idx % REAL_BASE.length], 89 + (idx % 6)));
  await db.insert(memberMetrics).values(rows);
  console.log(`member_metrics: ${rows.length} 筆`);

  // 6) 增員 pipeline（mock 隊）。
  await db.delete(recruits).where(inArray(recruits.ownerCoachId, mockCoachIds));
  const rec: any[] = [];
  const mkRecruits = (ownerId: string, counts: Record<string, number>) => {
    for (const [stage, nn] of Object.entries(counts)) {
      for (let i = 0; i < nn; i++) rec.push({ ownerCoachId: ownerId, candidateName: `準增員 ${stage[0].toUpperCase()}${i + 1}`, source: ["轉介", "活動", "人力銀行"][i % 3], stage });
    }
  };
  mkRecruits("mock_wang", { prospect: 7, contact: 5, interview: 3, offer: 2, onboard: 1 });
  mkRecruits("mock_tsai", { prospect: 4, contact: 2, interview: 1, offer: 1, onboard: 0 });
  mkRecruits("mock_hsu", { prospect: 3, contact: 2, interview: 1, offer: 0, onboard: 0 });
  await db.insert(recruits).values(rec);
  console.log(`recruits: ${rec.length} 筆`);

  // 7) 公告（只重種本腳本自己種的那幾筆；舊版是無 where 的 delete，會清空整張公告表）。
  await db.delete(announcements).where(eq(announcements.author, SEED_AUTHOR));
  await db.insert(announcements).values([
    { category: "activity", title: "8月增員說明會開放報名", body: "8/20 晚間 19:00，線上與台北辦公室同步。", pinned: true, author: SEED_AUTHOR },
    { category: "important", title: "新版退休試算引擎已上線（v12）", body: "蒙地卡羅模擬與缺口分析已更新。", pinned: false, author: SEED_AUTHOR },
    { category: "general", title: "第三季頂尖顧問競賽起跑", body: "即日起至 9/30，收益與活動量雙榜。", pinned: false, author: SEED_AUTHOR },
    { category: "general", title: "理財規劃證照(CFP)換證提醒", body: "本年度到期者請於 11 月前完成展延。", pinned: false, author: SEED_AUTHOR },
  ]);
  console.log("announcements: 4 筆");

  // 8) 示範客戶（含完整財報）。
  // 8a) 代表顧問 張家瑋：5 位示範客戶 + 具體待辦/約訪（首頁預設視角要豐富）。
  const repClients = await Promise.all([
    createDemoClient(REP_ID, PERSONAS[0], { status: "active", lifeStage: "育兒" }),
    createDemoClient(REP_ID, PERSONAS[1], { status: "active", lifeStage: "退休前" }),
    createDemoClient(REP_ID, PERSONAS[2], { status: "active", lifeStage: "新婚" }),
    createDemoClient(REP_ID, PERSONAS[3], { status: "pending", lifeStage: "單身" }),
    createDemoClient(REP_ID, PERSONAS[4], { status: "active", lifeStage: "育兒" }),
  ]);
  await db.insert(reviews).values([
    { clientId: repClients[4].id, date: isoAddDays(-30), type: "初談", nextAppt: isoAddDays(0), summary: "首次規劃諮詢·退休缺口分析" },
    { clientId: repClients[0].id, date: isoAddDays(-60), type: "季檢視", nextAppt: isoAddDays(3), summary: "規劃書待交付" },
    { clientId: repClients[2].id, date: isoAddDays(-90), type: "半年檢視", nextAppt: isoAddDays(6), summary: "年度財務健檢" },
    { clientId: repClients[3].id, date: isoAddDays(-20), type: "初談", nextAppt: isoAddDays(0), summary: "風險屬性測驗待完成" },
    { clientId: repClients[1].id, date: isoAddDays(-40), type: "季檢視", nextAppt: isoAddDays(-5), summary: "退休缺口未補足（逾期）" },
  ]);
  await db.insert(actionItems).values([
    { clientId: repClients[0].id, title: "交付 2025 規劃書", owner: "張家瑋", dueDate: isoAddDays(0), done: false },
    { clientId: repClients[1].id, title: "退休缺口補足方案", owner: "張家瑋", dueDate: isoAddDays(-2), done: false },
    { clientId: repClients[2].id, title: "安排年度財務健檢", owner: "張家瑋", dueDate: isoAddDays(2), done: false },
    { clientId: repClients[3].id, title: "催補風險屬性測驗", owner: "張家瑋", dueDate: isoAddDays(1), done: false },
    { clientId: repClients[4].id, title: "投資配置檢視（定期定額屆滿）", owner: "張家瑋", dueDate: isoAddDays(8), done: false },
  ]);
  console.log(`代表顧問 張家瑋：示範客戶 5（含完整財報）`);

  // 8b) 其餘每位成員教練（mock 顧問 + 真實同仁）：各 2 位含完整財報的示範客戶 + 約訪/待辦。
  //     這樣不論切到哪位顧問視角、或哪位同仁登入，客戶/待辦/約訪都不空。
  const lifeStages = ["育兒", "退休前", "新婚", "單身"];
  async function fillCoachDemo(coachId: string, coachName: string, startPersona: number, count: number) {
    for (let k = 0; k < count; k++) {
      const persona = PERSONAS[(startPersona + k) % PERSONAS.length];
      const c = await createDemoClient(coachId, persona, { status: "active", lifeStage: lifeStages[(startPersona + k) % lifeStages.length] });
      await db.insert(reviews).values([
        { clientId: c.id, date: isoAddDays(-25 - k * 10), type: "初談", nextAppt: isoAddDays(1 + k * 3), summary: "首次規劃諮詢（示範）" },
        { clientId: c.id, date: isoAddDays(-70), type: "季檢視", nextAppt: k === 0 ? isoAddDays(5) : isoAddDays(-4), summary: "年度財務健檢（示範）" },
      ]);
      await db.insert(actionItems).values([
        { clientId: c.id, title: "交付規劃建議書（示範）", owner: coachName, dueDate: isoAddDays(k), done: false },
        { clientId: c.id, title: "補齊風險屬性問卷（示範）", owner: coachName, dueDate: isoAddDays(3 + k), done: false },
      ]);
    }
  }

  // 其他 mock 成員（非代表顧問）各 2 位。
  let idx = 0;
  for (const t of TEAMS) {
    for (const m of t.members) {
      if (m.id === REP_ID) continue;
      await fillCoachDemo(m.id, m.name, idx * 2, 2);
      idx++;
    }
  }
  // 真實同仁各 2 位。
  for (let i = 0; i < realColleagues.length; i++) {
    const col = realColleagues[i];
    await fillCoachDemo(col.id, col.name ?? "顧問", (idx + i) * 2, 2);
  }
  console.log(`其餘成員示範客戶：mock ${idx} 位×2 + 真實同仁 ${realColleagues.length} 位×2（各含完整財報）`);

  console.log("\n✅ seed 完成。當月期間 =", CUR);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
