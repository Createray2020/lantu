// 自助客戶（人生護照）的資料層：把五面向存成「客戶自己的 clients 列＋一份 plan（基礎方案）」。
// coachId=null（還沒掛教練）；掛上教練、被授權後才「真的進入規劃」。
import { eq, desc } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, plans } from "@/Shared/db/schema";
import { newCase } from "@/lib/engine";
import { computePassport, type PassportInputs, type PassportResult } from "@/lib/passport";
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
  if (existingPlan[0]) {
    await db.update(plans).set({ data, updatedAt: new Date() }).where(eq(plans.id, existingPlan[0].id));
  } else {
    await db.insert(plans).values({ clientId, year: new Date().getFullYear(), label: "人生護照", status: "draft", data });
  }
  return data.passport.result as PassportResult;
}
