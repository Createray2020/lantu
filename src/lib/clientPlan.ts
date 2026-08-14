// 自助客戶（人生護照）的資料層：把五面向存成「客戶自己的 clients 列＋一份 plan（基礎方案）」。
// coachId=null（還沒掛教練）；掛上教練、被授權後才「真的進入規劃」。
import { eq, desc } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, plans } from "@/Shared/db/schema";
import { newCase } from "@/lib/engine";
import { computeMonthly, PASSPORT_CONST, type PassportInputs, type PassportMonthly } from "@/lib/passport";
import type { ClientUser } from "@/lib/clientUser";

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

// 由五面向組出一份 v12 case（其餘欄位給引擎可算的合理空值），並把 passport 原料一起 stash 進 data。
function buildCase(p: PassportInputs, name: string): any {
  const c: any = newCase();
  const age = num(p.retire.age) || num(c.profile.age) || 35;
  const retireAge = num(p.retire.retireAge) || 65;
  c.profile.name = name || "我的規劃";
  c.profile.age = age;
  c.profile.retireAge = retireAge;
  c.profile.lifeExp = PASSPORT_CONST.lifeExp;
  if (c.members?.[0]) {
    c.members[0].name = name || "本人";
    c.members[0].age = age;
  }
  c.retire = {
    monthLiving: num(p.retire.monthLiving),
    retireReturn: PASSPORT_CONST.postRetReturn,
    retireInflation: PASSPORT_CONST.inflation,
    prepared:
      num(p.retire.prepared) > 0
        ? [{ item: "已備退休金", age: retireAge, amount: num(p.retire.prepared), method: "一次領" }]
        : [],
  };
  c.goals = [];
  if (num(p.house.price) > 0)
    c.goals.push({
      name: "購屋", type: "購屋", present: num(p.house.price), minPresent: num(p.house.price),
      start: age + num(p.house.years), end: age + num(p.house.years), freq: 0, growth: "固定",
      appreciation: 0, loanRatio: num(p.house.loanRatio), imp: 4, prepared: 0,
    });
  if (num(p.car.price) > 0)
    c.goals.push({
      name: "購車", type: "購車", present: num(p.car.price), minPresent: num(p.car.price),
      start: age + num(p.car.years), end: age + num(p.car.years), freq: 0, growth: "固定",
      appreciation: 0, loanRatio: 0, imp: 3, prepared: 0,
    });
  c.education = [];
  if (num(p.support.kids) > 0 && num(p.support.annualPerKid) > 0)
    c.education.push({
      child: "子女", stage: "教育", schoolType: "",
      annual: num(p.support.annualPerKid) * num(p.support.kids),
      years: num(p.support.years), startIn: num(p.support.startIn),
    });
  c.travel = [];
  if (num(p.travel.annualBudget) > 0)
    c.travel.push({
      cat: "綜合", sub: "旅遊", start: age, end: age + num(p.travel.years),
      freq: 1, amount: num(p.travel.annualBudget), minAmount: num(p.travel.annualBudget), imp: 3,
    });
  c.passport = { inputs: p, monthly: computeMonthly(p), savedAt: new Date().toISOString() };
  return c;
}

export type ClientOwnPlan = {
  clientId: string;
  planId: string;
  passport: PassportInputs | null;
  monthly: PassportMonthly | null;
};

// 取這個客戶自己的 plan（若有）。
export async function getClientOwnPlan(clientUserId: string): Promise<ClientOwnPlan | null> {
  const cRows = await db.select().from(clients).where(eq(clients.clientUserId, clientUserId)).limit(1);
  const client = cRows[0];
  if (!client) return null;
  const pRows = await db
    .select()
    .from(plans)
    .where(eq(plans.clientId, client.id))
    .orderBy(desc(plans.createdAt))
    .limit(1);
  const plan = pRows[0];
  if (!plan) return { clientId: client.id, planId: "", passport: null, monthly: null };
  const data = plan.data as any;
  return {
    clientId: client.id,
    planId: plan.id,
    passport: data?.passport?.inputs ?? null,
    monthly: data?.passport?.monthly ?? null,
  };
}

// 存人生護照：建/更新客戶自己的 clients 列與 plan（基礎方案）。回傳每月應存明細。
export async function savePassport(user: ClientUser, inputs: PassportInputs): Promise<PassportMonthly> {
  const name = user.name || "我的規劃";
  let clientId: string;
  const existing = await db.select().from(clients).where(eq(clients.clientUserId, user.id)).limit(1);
  if (existing[0]) {
    clientId = existing[0].id;
  } else {
    const ins = await db
      .insert(clients)
      .values({ coachId: null, clientUserId: user.id, name, source: "自助", status: "active" })
      .returning({ id: clients.id });
    clientId = ins[0].id;
  }

  const data = buildCase(inputs, name);
  const existingPlan = await db.select({ id: plans.id }).from(plans).where(eq(plans.clientId, clientId)).limit(1);
  if (existingPlan[0]) {
    await db.update(plans).set({ data, updatedAt: new Date() }).where(eq(plans.id, existingPlan[0].id));
  } else {
    await db.insert(plans).values({
      clientId,
      year: new Date().getFullYear(),
      label: "人生護照",
      status: "draft",
      data,
    });
  }
  return computeMonthly(inputs);
}
