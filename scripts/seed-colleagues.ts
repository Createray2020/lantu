// 純新增：四位真實同仁帳號底下，各建 5 位「生命階段各異」的完整示範客戶。
// 重用 seed-demo-clients.ts 的 5 個原型（換人名＋各自縮放金額＋重生 id），不動任何現有資料。
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../src/Shared/db/schema";
import { planSnapshot } from "../src/lib/snapshot";
import { SEEDS } from "./seed-demo-clients";

const { coaches, clients, plans, reviews, actionItems } = schema;
const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
const DEMO_TAG = "示範資料";
const YEAR = 2025;

function birth(age: number): string { return `${new Date().getFullYear() - age}-06-15`; }
function shiftISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const round = (v: any) => Math.round(Number(v) || 0);
function clonePersona(base: any, oldName: string, newName: string, scale: number, uid: string): any {
  const c = JSON.parse(JSON.stringify(base));
  c.id = uid;
  c.profile.name = newName;
  if (c.members?.[0]) c.members[0].name = newName; // members[0] = 本人
  const swap = (v: any) => (v === oldName ? newName : v);
  (c.incomes || []).forEach((x: any) => { x.owner = swap(x.owner); x.amount = round(x.amount * scale); });
  (c.assets || []).forEach((x: any) => { x.owner = swap(x.owner); x.value = round(x.value * scale); x.cost = round(x.cost * scale); x.income = round(x.income * scale); });
  (c.liabilities || []).forEach((x: any) => { x.owner = swap(x.owner); x.balance = round(x.balance * scale); x.pay = round(x.pay * scale); });
  (c.needs || []).forEach((x: any) => { x.member = swap(x.member); });
  (c.coverages || []).forEach((x: any) => { x.member = swap(x.member); });
  (c.policies || []).forEach((x: any) => { x.insured = swap(x.insured); });
  (c.retire?.prepared || []).forEach((x: any) => { x.amount = round(x.amount * scale); });
  (c.goals || []).forEach((x: any) => { x.present = round(x.present * scale); x.minPresent = round(x.minPresent * scale); });
  (c.education || []).forEach((x: any) => { x.annual = round(x.annual * scale); });
  (c.tracking || []).forEach((x: any) => { x.net = round(x.net * scale); });
  return c;
}

// 四位真實同仁（以 email 對應，穩定）＋各自 5 個原型的替換人名（順序＝單身/新婚/育兒/退休前/退休）。
const COLLEAGUES: { email: string; scale: number; names: string[] }[] = [
  { email: "thomasfan9916004@gmail.com", scale: 1.0,  names: ["賴柏勳", "江品妍", "高志偉", "潘淑芬", "童金水"] }, // 峯羽 范
  { email: "gracehsieh1214@gmail.com",   scale: 0.85, names: ["蔡承翰", "洪于婷", "曹明哲", "石美玲", "柯正雄"] }, // 采恩 / Grace
  { email: "dadhalk.finance@gmail.com",  scale: 1.2,  names: ["田宗翰", "卓怡君", "董建成", "傅秀蘭", "龔國棟"] }, // 浩軍 邱
  { email: "wcgeso0221@gmail.com",       scale: 0.95, names: ["邵柏丞", "尤思穎", "溫俊德", "莊惠美", "康福生"] }, // 家慶 汪
];


// 破壞性腳本防呆（同 seed.ts）：.env.local 指向的是正式 Neon，必須明確帶旗標才跑。
function assertSeedAllowed(scriptName: string): void {
  const url = process.env.DATABASE_URL || "";
  const host = (/@([^/?]+)/.exec(url)?.[1]) || "(未知)";
  if (!process.env.ALLOW_DESTRUCTIVE_SEED) {
    console.error(
      `\n拒絕執行 ${scriptName}：這是破壞性腳本（會刪除既有資料）。\n` +
      `目標資料庫：${host}\n` +
      `確定要跑的話請帶：ALLOW_DESTRUCTIVE_SEED=1 npx tsx scripts/${scriptName}\n`,
    );
    process.exit(1);
  }
  console.log(`⚠️  ${scriptName} 將寫入資料庫：${host}`);
}

async function main() {
  assertSeedAllowed("seed-colleagues.ts");
  const allCoaches = await db.select().from(coaches);
  const byEmail = new Map(allCoaches.map((c) => [c.email, c]));

  for (let ci = 0; ci < COLLEAGUES.length; ci++) {
    const col = COLLEAGUES[ci];
    const coach = byEmail.get(col.email);
    if (!coach) { console.log(`⚠ 找不到同仁 ${col.email}，略過`); continue; }

    const targetNames = col.names;
    // 重跑保護：清掉本腳本先前種的同名示範客戶。
    const existing = await db.select().from(clients).where(eq(clients.coachId, coach.id));
    const dupIds = existing
      .filter((c) => (c.tags ?? []).includes(DEMO_TAG) && targetNames.includes(c.name))
      .map((c) => c.id);
    if (dupIds.length) {
      await db.delete(actionItems).where(inArray(actionItems.clientId, dupIds));
      await db.delete(reviews).where(inArray(reviews.clientId, dupIds));
      await db.delete(plans).where(inArray(plans.clientId, dupIds));
      await db.delete(clients).where(inArray(clients.id, dupIds));
    }

    console.log(`\n── ${coach.name} <${coach.email}> ── scale=${col.scale}`);
    for (let ai = 0; ai < SEEDS.length; ai++) {
      const arch = SEEDS[ai];
      const oldName = arch.case.profile.name;
      const newName = targetNames[ai];
      const scale = col.scale * (0.9 + 0.05 * ai);
      const uid = `demo_${ci}_${ai}_${coach.id.slice(-6)}`;
      const data = clonePersona(arch.case, oldName, newName, scale, uid);
      const snap = planSnapshot(data);

      const [c] = await db.insert(clients).values({
        coachId: coach.id, name: newName, status: arch.status, lifeStage: arch.lifeStage,
        source: arch.source, contact: { phone: `09${String(10 + ci).slice(-2)}-${String(100 + ai * 111).slice(-3)}-${String(200 + ci * 37).slice(-3)}` },
        tags: arch.tags, birthDate: birth(data.profile.age),
      }).returning();
      const [p] = await db.insert(plans).values({
        clientId: c.id, year: YEAR, label: `${YEAR}版`, status: "active",
        basedOnDate: shiftISO(new Date().toISOString().slice(0, 10), -30),
        data, healthGrade: snap.healthGrade, netWorth: snap.netWorth,
      }).returning();
      for (const r of arch.reviews) {
        await db.insert(reviews).values({ clientId: c.id, planId: p.id, date: shiftISO(r.date, -ci * 2), type: r.type, nextAppt: shiftISO(r.nextAppt, ci * 2), summary: r.summary, attendees: newName });
      }
      for (const a of arch.actions) {
        await db.insert(actionItems).values({ clientId: c.id, title: a.title, owner: coach.name ?? "顧問", dueDate: shiftISO(a.dueDate, ci), done: a.done });
      }
      console.log(`  ✓ ${newName}（${arch.lifeStage}）grade=${snap.healthGrade} net=${snap.netWorth?.toLocaleString()}`);
    }
  }
  console.log("\n✅ 四位同仁各 5 位示範客戶寫入完成。");
}

// 入口守衛：舊版 main() 在模組頂層無條件執行，任何人為了複用常數而 import 這個檔，
// 整支寫入腳本就會在 import 的當下對正式庫執行。
const __direct = !!(process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("seed-colleagues.ts"));
if (__direct) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
