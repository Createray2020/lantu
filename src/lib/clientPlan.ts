// 自助客戶（人生護照）的資料層：把五面向存成「客戶自己的 clients 列＋一份 plan（基礎方案）」。
// coachId=null（還沒掛教練）；掛上教練、被授權後才「真的進入規劃」。
import { eq, desc } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, plans } from "@/Shared/db/schema";
import { newCase } from "@/lib/engine";
import { computePassport, type PassportInputs, type PassportResult, type CrossInputs } from "@/lib/passport";
import { logRevision } from "@/lib/revisions";
import type { ClientUser } from "@/lib/clientUser";

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

// 由五面向（能力分析）組出一份 v12 case：profile／goals／education／travel／retire 給合理值，
// 並把 passport 原料＋算出的結果一起 stash 進 data，供 /portal 顯示與重編。
function buildCase(p: PassportInputs, name: string): any {
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
  if (r.travel.fund > 0)
    c.travel.push({ cat: "綜合", sub: "旅遊", start: age, end: age + 20, freq: 1, amount: Math.round(r.travel.fund), minAmount: Math.round(r.travel.fund), imp: 3 });

  c.education = [];
  if (r.support.perChildCost > 0 && num(p.support.monthly) > 0)
    c.education.push({ child: "子女", stage: "教育", schoolType: "", annual: Math.round(r.support.perChildCost / Math.max(1, num(p.support.raiseToAge))), years: num(p.support.raiseToAge), startIn: Math.max(0, num(p.support.birthYear) - num(p.support.startYear)) });

  c.passport = { inputs: p, result: r, savedAt: new Date().toISOString() };
  return c;
}

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
  const pRows = await db.select().from(plans).where(eq(plans.clientId, client.id)).orderBy(desc(plans.createdAt)).limit(1);
  const plan = pRows[0];
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
  const existingPlan = await db.select({ id: plans.id }).from(plans).where(eq(plans.clientId, clientId)).limit(1);
  let planId: string;
  if (existingPlan[0]) {
    planId = existingPlan[0].id;
    await db.update(plans).set({ data, updatedAt: new Date() }).where(eq(plans.id, planId));
  } else {
    const ins = await db.insert(plans).values({ clientId, year: new Date().getFullYear(), label: "人生護照", status: "draft", data }).returning({ id: plans.id });
    planId = ins[0].id;
  }
  await logRevision(planId, "client", user.id, user.name, data);
  return data.passport.result as PassportResult;
}

// ---------- 基本資料 ＋ 財務現況十字表（後續補完，寫進同一份 plan） ----------
export type ClientBasics = {
  name: string; birth: string; gender: string; phone: string; email: string; marital: string; dependents: number;
};

export async function getClientSetup(clientUserId: string): Promise<{ basics: ClientBasics | null; cross: CrossInputs | null }> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, clientUserId)).limit(1);
  const client = cRows[0];
  if (!client) return { basics: null, cross: null };
  const pRows = await db.select().from(plans).where(eq(plans.clientId, client.id)).orderBy(desc(plans.createdAt)).limit(1);
  const data = pRows[0]?.data as any;
  return { basics: data?.setup?.basics ?? null, cross: data?.setup?.cross ?? null };
}

// 存基本資料＋十字表：更新 clients 本體與 plan.data（收支資債彙總進 case，供引擎與教練接手用）。
export async function saveClientSetup(user: ClientUser, basics: ClientBasics, cross: CrossInputs): Promise<void> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, user.id)).limit(1);
  const client = cRows[0];
  if (!client) throw new Error("請先完成人生護照");

  await db.update(clients).set({
    name: basics.name || client.name,
    birthDate: basics.birth || null,
    contact: { phone: basics.phone || undefined, email: basics.email || undefined },
    updatedAt: new Date(),
  }).where(eq(clients.id, client.id));

  const pRows = await db.select().from(plans).where(eq(plans.clientId, client.id)).orderBy(desc(plans.createdAt)).limit(1);
  const plan = pRows[0];
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
  c.setup = { basics, cross, savedAt: new Date().toISOString() };
  await db.update(plans).set({ data: c, updatedAt: new Date() }).where(eq(plans.id, plan.id));
  await logRevision(plan.id, "client", user.id, user.name, c);
}

// 取客戶自己 plan 的完整 case（餵給 lantu-app.html 客戶端唯讀檢視）。
export async function getClientPlanCase(clientUserId: string): Promise<{ planId: string; data: unknown } | null> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, clientUserId)).limit(1);
  const client = cRows[0];
  if (!client) return null;
  const pRows = await db.select().from(plans).where(eq(plans.clientId, client.id)).orderBy(desc(plans.createdAt)).limit(1);
  const plan = pRows[0];
  if (!plan) return null;
  return { planId: plan.id, data: plan.data };
}
