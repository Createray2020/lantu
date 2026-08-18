// 自助客戶（人生護照）的資料層：把五面向存成「客戶自己的 clients 列＋一份 plan（基礎方案）」。
// coachId=null（還沒掛教練）；掛上教練、被授權後才「真的進入規劃」。
import { and, eq, asc, desc } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, plans } from "@/Shared/db/schema";
import { newCase } from "@/lib/engine";
import { computePassport, type PassportInputs, type PassportResult, type CrossInputs } from "@/lib/passport";
import { normalizeIntent, DEFAULT_TARGET, type Intent } from "@/lib/intent";
// 客戶端寫 plan.data 時也必須重算快照。舊版只 set({data})，教練列表上的階段/淨值會一直停在
// 客戶「上次由教練存檔」時的舊值（實測正式庫有一筆淨值差 500 萬）。
import { planSnapshot } from "@/lib/snapshot";
import { logRevision } from "@/lib/revisions";
import type { ClientUser } from "@/lib/clientUser";

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

// 由五面向（能力分析）組出一份 v12 case：profile／goals／education／travel／retire 給合理值，
// 並把 passport 原料＋算出的結果一起 stash 進 data，供 /portal 顯示與重編。
// export 供測試：這裡的量綱（一次性 vs 年度、現值 vs 已複利）錯了不會有任何型別或執行期錯誤，
// 只會讓所有自助客戶的規劃數字整批偏掉，所以一定要有測試守著。
export function buildCase(p: PassportInputs, name: string): any {
  const r: PassportResult = computePassport(p);
  const c: any = newCase();
  const age = num(p.retire.curAge) || num(c.profile.age) || 35;
  c.profile.name = name || "我的規劃";
  c.profile.age = age;
  c.profile.retireAge = num(p.retire.retireAge) || 65;
  c.profile.lifeExp = num(p.retire.lifeExp) || 85;
  if (c.members?.[0]) { c.members[0].name = name || "本人"; c.members[0].age = age; }

  c.retire = {
    monthLiving: Math.round(r.retire.presentMonthly), // 可支應（現值）當估計月生活費
    retireReturn: num(p.retire.annualReturn),
    retireInflation: 1.5,
    prepared: [],
  };

  c.goals = [];
  if (r.house.price > 0)
    c.goals.push({ name: "購屋", type: "購屋", present: Math.round(r.house.price), minPresent: Math.round(r.house.price), start: num(p.house.buyYear) - num(p.house.startYear) + age, end: num(p.house.buyYear) - num(p.house.startYear) + age, freq: 0, growth: "固定", appreciation: 0, loanRatio: num(p.house.loanRatio) * 10, imp: 4, prepared: 0 });
  if (r.car.price > 0)
    c.goals.push({ name: "購車", type: "購車", present: Math.round(r.car.price), minPresent: Math.round(r.car.price), start: num(p.car.buyYear) - num(p.car.startYear) + age, end: num(p.car.buyYear) - num(p.car.startYear) + age, freq: 0, growth: "固定", appreciation: 0, loanRatio: 0, imp: 3, prepared: 0 });

  c.travel = [];
  if (r.travel.fund > 0) {
    // travel.fund 是「存到旅遊那一年會累積到的一筆基金」＝一次性支出。
    // 舊版寫成 start=age, end=age+20, freq=1，被 lifestyleFactor 當成「每年花、連花 21 年」，
    // 生涯累計金額直接放大 21 倍。改成只在目標年度發生一次。
    const travelAge = age + Math.max(0, num(p.travel.travelYear) - num(p.travel.startYear));
    c.travel.push({ cat: "綜合", sub: "旅遊", start: travelAge, end: travelAge, freq: 1, amount: Math.round(r.travel.fund), minAmount: Math.round(r.travel.fund), imp: 3 });
  }

  // 人生護照的五面向就是客戶的人生目標——直接帶成「必須達成」，教練端意圖分頁即刻讀得到。
  const passportTargets: string[] = [DEFAULT_TARGET];
  if (r.house.price > 0) passportTargets.push("購屋規劃");
  if (r.car.price > 0) passportTargets.push("購車規劃");
  if (r.travel.fund > 0) passportTargets.push("旅遊規劃");
  if (r.support.perChildCost > 0 && num(p.support.monthly) > 0) passportTargets.push("子女教養規劃");
  c.intent = normalizeIntent({ purposes: [], targets: passportTargets, mustHave: passportTargets });

  c.education = [];
  if (r.support.perChildCost > 0 && num(p.support.monthly) > 0) {
    // education[].annual 是「今日現值的年費用」——引擎（eduTotal / projection）會自己再套學費上漲率。
    // 舊版填的是 perChildCost/年數，而 perChildCost 已經是逐年複利加總過的結果，
    // 等於把學費成長算了兩次，投影裡的教育支出被放大約 1.66 倍。
    c.education.push({
      child: "子女", stage: "教育", schoolType: "",
      annual: Math.round(num(p.support.annualCost)),
      years: num(p.support.raiseToAge),
      startIn: Math.max(0, num(p.support.birthYear) - num(p.support.startYear)),
    });
  }

  c.passport = { inputs: p, result: r, savedAt: new Date().toISOString() };
  return c;
}

// 客戶「自己那一份」plan：優先取標記為人生護照的那份，否則取最早建立的那份。
// ⚠️ 舊版是 `limit(1)` 無 orderBy（或取最新），客戶掛上教練後有兩份 plan 時，
//    Postgres 回哪一列不確定 / 或直接命中教練剛建的年度版 →
//    客戶在 /portal 存一次檔就把教練做了數小時的規劃整份覆寫成護照骨架（不可逆）。
//    客戶端的讀寫一律鎖定這一份；教練建立的年度版本對客戶端不可寫。
async function ownPlanRow(clientId: string): Promise<{ id: string; data: unknown } | null> {
  const tagged = await db
    .select({ id: plans.id, data: plans.data })
    .from(plans)
    .where(and(eq(plans.clientId, clientId), eq(plans.label, PASSPORT_LABEL)))
    .orderBy(asc(plans.createdAt))
    .limit(1);
  if (tagged[0]) return tagged[0];
  const oldest = await db
    .select({ id: plans.id, data: plans.data })
    .from(plans)
    .where(eq(plans.clientId, clientId))
    .orderBy(asc(plans.createdAt))
    .limit(1);
  return oldest[0] ?? null;
}

const PASSPORT_LABEL = "人生護照";

export type ClientOwnPlan = {
  clientId: string;
  planId: string;
  passport: PassportInputs | null;
  result: PassportResult | null;
};

// 取這個客戶自己的 plan（若有）。
export async function getClientOwnPlan(clientUserId: string): Promise<ClientOwnPlan | null> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, clientUserId)).limit(1);
  const client = cRows[0];
  if (!client) return null;
  const plan = await ownPlanRow(client.id);
  if (!plan) return { clientId: client.id, planId: "", passport: null, result: null };
  const data = plan.data as any;
  return {
    clientId: client.id,
    planId: plan.id,
    passport: data?.passport?.inputs ?? null,
    result: data?.passport?.result ?? null,
  };
}

// 存人生護照：建/更新客戶自己的 clients 列與 plan（基礎方案）。回傳算出的結果。
export async function savePassport(user: ClientUser, inputs: PassportInputs): Promise<PassportResult> {
  const name = user.name || "我的規劃";
  let clientId: string;
  const existing = await db.select().from(clients).where(eq(clients.clientUserId, user.id)).limit(1);
  if (existing[0]) {
    clientId = existing[0].id;
  } else {
    const ins = await db.insert(clients).values({ coachId: null, clientUserId: user.id, name, source: "自助", status: "active" }).returning({ id: clients.id });
    clientId = ins[0].id;
  }

  const data = buildCase(inputs, name);
  const existingPlan = await ownPlanRow(clientId);
  let planId: string;
  const snap = planSnapshot(data);
  if (existingPlan) {
    planId = existingPlan.id;
    await db.update(plans)
      .set({ data, label: PASSPORT_LABEL, healthGrade: snap.healthGrade, netWorth: snap.netWorth, updatedAt: new Date() })
      .where(eq(plans.id, planId));
  } else {
    const ins = await db.insert(plans)
      .values({ clientId, year: new Date().getFullYear(), label: PASSPORT_LABEL, status: "draft", data,
                healthGrade: snap.healthGrade, netWorth: snap.netWorth })
      .returning({ id: plans.id });
    planId = ins[0].id;
  }
  await logRevision(planId, "client", user.id, user.name, data);
  return data.passport.result as PassportResult;
}

// ---------- 基本資料 ＋ 財務現況十字表（後續補完，寫進同一份 plan） ----------
export type ClientBasics = {
  name: string; birth: string; gender: string; phone: string; email: string; marital: string; dependents: number;
};

export async function getClientSetup(clientUserId: string): Promise<{ basics: ClientBasics | null; cross: CrossInputs | null; intent: Intent | null }> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, clientUserId)).limit(1);
  const client = cRows[0];
  if (!client) return { basics: null, cross: null, intent: null };
  const own = await ownPlanRow(client.id);
  const data = own?.data as any;
  return { basics: data?.setup?.basics ?? null, cross: data?.setup?.cross ?? null, intent: data?.intent ?? null };
}

// 存基本資料＋十字表：更新 clients 本體與 plan.data（收支資債彙總進 case，供引擎與教練接手用）。
export async function saveClientSetup(user: ClientUser, basics: ClientBasics, cross: CrossInputs, intent?: Intent): Promise<void> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, user.id)).limit(1);
  const client = cRows[0];
  if (!client) throw new Error("請先完成人生護照");

  await db.update(clients).set({
    name: basics.name || client.name,
    birthDate: basics.birth || null,
    contact: { phone: basics.phone || undefined, email: basics.email || undefined },
    updatedAt: new Date(),
  }).where(eq(clients.id, client.id));

  const plan = await ownPlanRow(client.id);
  if (!plan) throw new Error("找不到規劃");
  const c: any = plan.data || {};
  c.profile = c.profile || {};
  c.profile.name = basics.name || c.profile.name;
  c.profile.gender = basics.gender || c.profile.gender;
  if (basics.birth) { const by = parseInt(basics.birth.slice(0, 4), 10); if (by) c.profile.age = new Date().getFullYear() - by; }
  c.profile.marital = basics.marital || c.profile.marital;
  c.profile.dependents = num(basics.dependents);

  const inc = num(cross.income), exp = num(cross.expense), ast = num(cross.assets), lia = num(cross.liabilities);
  const age = num(c.profile.age) || 30, retireAge = num(c.profile.retireAge) || 65, lifeExp = num(c.profile.lifeExp) || 85;
  const who = basics.name || "本人";
  c.incomes = inc > 0 ? [{ owner: who, type: "工作", amount: inc * 12, growth: 2, start: age, end: retireAge }] : [];
  c.expenses = exp > 0 ? [{ name: "生活支出", cat: "生活", amount: exp * 12, infl: true, start: age, end: lifeExp, cut: 0 }] : [];
  c.assets = ast > 0 ? [{ name: "總資產", owner: who, mainCat: "可投資資產", type: "現金", cls: "流動", region: "台灣", currency: "台幣", fxRate: 1, cost: ast, value: ast, ret: 1, income: 0, movable: true }] : [];
  c.liabilities = lia > 0 ? [{ name: "總負債", owner: who, mainCat: "其他", currency: "台幣", fxRate: 1, balance: lia, rate: 2, repay: "本息攤還", pay: 0, months: 240, grace: 0, startAge: age }] : [];
  // 規劃意圖：客戶選的關注議題與人生目標優先序，寫進教練端讀的同一個欄位。
  if (intent) c.intent = normalizeIntent({ ...intent });
  c.setup = { basics, cross, savedAt: new Date().toISOString() };
  const snap = planSnapshot(c);
  await db.update(plans)
    .set({ data: c, healthGrade: snap.healthGrade, netWorth: snap.netWorth, updatedAt: new Date() })
    .where(eq(plans.id, plan.id));
  await logRevision(plan.id, "client", user.id, user.name, c);
}

// 取要餵給 lantu-app.html 客戶端唯讀檢視的 case。
// TODO(待拍板)：這裡刻意仍取「最新一份」——掛了教練之後，客戶在「我的財務藍圖」看到的是教練做的年度版。
// 客戶可寫範圍（只能改護照那份 vs 可編年度版的部分 section）定案後再一起調整，見盤點報告待拍板 #5。
export async function getClientPlanCase(clientUserId: string): Promise<{ planId: string; data: unknown } | null> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, clientUserId)).limit(1);
  const client = cRows[0];
  if (!client) return null;
  const pRows = await db.select().from(plans).where(eq(plans.clientId, client.id)).orderBy(desc(plans.createdAt)).limit(1);
  const plan = pRows[0];
  if (!plan) return null;
  return { planId: plan.id, data: plan.data };
}
