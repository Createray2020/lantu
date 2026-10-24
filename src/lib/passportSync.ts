// 人生護照 ↔ 教練年度版（case）的雙向對應。純函式、不碰 DB。
//
// 2026/10/24 Ray 定案：掛上教練之後，**教練軌是唯一真相，護照是投影**——
//   · 客戶前台的人生護照從教練最新一份 case 反推（passportFromCase）；
//   · 客戶在護照上拉滑桿只是沙盒，「存成我的願望」寫進客戶軌，教練軌一個字都不動；
//   · 教練看得到客戶的願望快照，按「帶入年度版」才合併（mergePassportIntoCase，只補空白）。
//
// 為什麼反推有封閉解：computePassport() 五面向對「月存」都是線性的
// （fv / annuityPayout 都是 monthly × 係數），所以「要達成 case 裡這個目標，每月該存多少」
// 直接除回去就是，不用迭代、不用猜。
//
// ⚠️ 參數（報酬率、貸款年數、薪資、提繳率、學費上漲率）一律沿用客戶護照原本填的（prev），
//    反推只改「目標」與「月存」。教練的假設參數住在 case 裡，不經護照。
import {
  emptyPassport, computePassport, passportBaseYear, fv, annuityPayout,
  type PassportInputs, type PassportResult, type PassportFaces,
} from "@/lib/passport";
import { normalizeIntent } from "@/lib/intent";

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};
const round1 = (x: number) => Math.round(x * 10) / 10;

/** 「每月存 1 元、存 months 個月、年化 ret%」會累積成多少——反推月存的分母。 */
function fvFactor(months: number, ret: number): number {
  return fv(1, months, ret);
}

/**
 * 把一份 case 反推成人生護照的五面向輸入。
 * @param c    教練軌最新一份 case
 * @param prev 客戶原本的護照輸入（參數來源）；沒有就用 emptyPassport
 * @param fallbackYear prev 也沒有 baseYear 時的「今年」
 */
export function passportFromCase(c: any, prev: PassportInputs | null | undefined, fallbackYear?: number): PassportInputs {
  const stash: PassportInputs | null = c?.passport?.inputs ?? null;
  const base: PassportInputs = structuredClone(prev ?? stash ?? emptyPassport(fallbackYear));
  const by = passportBaseYear(base.baseYear ? base : stash ? stash : { baseYear: fallbackYear });
  base.baseYear = by;

  const age = num(c?.profile?.age) || num(base.retire.curAge) || 30;
  const yearOfAge = (a: number) => by + Math.max(0, Math.round(num(a)) - age);
  // 月存入起始年不能晚於目標年，否則 fv 的月數是 0、反推除以零。至少留一年。
  const monthsBetween = (startYear: number, targetYear: number) => Math.max(12, (targetYear - startYear) * 12);

  // ---- 購屋／購車：目標價 → 自備款 → 月存 ----
  const loanFace = (face: "house" | "car", type: string) => {
    const g = (Array.isArray(c?.goals) ? c.goals : []).find((x: any) => x?.type === type);
    const f: any = base[face];
    if (!g || num(g.present) <= 0) { f.monthly = 0; return; }
    const price = num(g.present);
    const buyYear = yearOfAge(g.start);
    // case 的 loanRatio 是 %（buildCase 寫 成×10）；護照是「成」。沒填就沿用護照原本的。
    const ratioCheng = g.loanRatio !== undefined && g.loanRatio !== "" ? Math.min(9, Math.max(0, Math.round(num(g.loanRatio) / 10))) : num(f.loanRatio);
    const down = price * (1 - Math.min(0.9, ratioCheng / 10));
    f.buyYear = buyYear;
    f.loanRatio = ratioCheng;
    if (f.startYear >= buyYear) f.startYear = buyYear - 1;
    f.monthly = round1(down / fvFactor(monthsBetween(f.startYear, buyYear), num(f.annualReturn)) / 10000);
  };
  loanFace("house", "購屋");
  loanFace("car", "購車");

  // ---- 旅遊：一次性基金 → 月存 ----
  {
    const t = (Array.isArray(c?.travel) ? c.travel : []).find((x: any) => num(x?.amount) > 0);
    const f = base.travel;
    if (!t) f.monthly = 0;
    else {
      const travelYear = yearOfAge(t.start);
      f.travelYear = travelYear;
      if (f.startYear >= travelYear) f.startYear = travelYear - 1;
      f.monthly = round1(num(t.amount) / fvFactor(monthsBetween(f.startYear, travelYear), num(f.annualReturn)) / 10000);
    }
  }

  // ---- 退休：現值月生活費 → 總月領 → 扣掉勞退／勞保 → 自行準備的月存 ----
  {
    const f = base.retire;
    f.curAge = age;
    f.retireAge = num(c?.profile?.retireAge) || f.retireAge;
    f.lifeExp = num(c?.profile?.lifeExp) || f.lifeExp;
    const living = num(c?.retire?.monthLiving);
    if (living <= 0) f.monthly = 0;
    else {
      // 跟 retireAbility() 同一套座標：presentMonthly = totalMonthly / 1.015^years
      const probe = computePassport({ ...base, retire: { ...f, monthly: 0 } }).retire;
      const yearsToRetire = Math.max(0, f.retireAge - f.curAge);
      const totalMonthly = living * Math.pow(1.015, yearsToRetire);
      const selfMonthly = Math.max(0, totalMonthly - probe.laborPensionMonthly - probe.laborInsMonthly);
      const retireMonths = Math.max(1, (f.lifeExp - f.retireAge) * 12);
      const monthsToRetire = Math.max(12, yearsToRetire * 12);
      const ret = num(f.annualReturn);
      const selfCorpus = selfMonthly / annuityPayout(1, retireMonths, ret);
      f.monthly = round1(selfCorpus / fvFactor(monthsToRetire, ret) / 10000);
    }
  }

  // ---- 扶養：未出生子女 or 教育列 → 一位小孩的總花費 → 月存 ----
  {
    const f = base.support;
    const unborn = (Array.isArray(c?.members) ? c.members : []).find((m: any) => m?.unborn && m?.role === "子女");
    const edu = (Array.isArray(c?.education) ? c.education : []).find((e: any) => num(e?.annual) > 0);
    if (unborn) {
      f.birthYear = yearOfAge(unborn.bornAt);
      if (num(unborn.eduPayTo) > 0) f.raiseToAge = num(unborn.eduPayTo);
    } else if (edu) {
      // 已出生：護照的「存到出生那一年」語意不成立，改成「從現在起存」，至少一年。
      f.birthYear = Math.max(by, f.startYear + 1);
      f.annualCost = num(edu.annual);
      if (num(edu.years) > 0) f.raiseToAge = num(edu.years);
    } else {
      f.monthly = 0;
    }
    if (unborn || edu) {
      if (f.startYear >= f.birthYear) f.startYear = f.birthYear - 1;
      const perChild = computePassport({ ...base, support: { ...f, monthly: 1 } }).support.perChildCost;
      f.monthly = round1(perChild / fvFactor(monthsBetween(f.startYear, f.birthYear), num(f.annualReturn)) / 10000);
    }
  }

  return base;
}

/** 把護照 case 的五面向合併進教練 case：**只補空白，不蓋教練填過的**。回傳帶入了哪些項目。 */
export type MergeOutcome = { data: any; imported: string[] };
export function mergePassportIntoCase(coachCase: any, passportCase: any): MergeOutcome {
  const c: any = structuredClone(coachCase ?? {});
  const p: any = passportCase ?? {};
  const imported: string[] = [];
  const wan = (n: number) => `${Math.round(n / 10000).toLocaleString()} 萬`;

  c.goals = Array.isArray(c.goals) ? c.goals : [];
  for (const type of ["購屋", "購車"]) {
    const has = c.goals.some((g: any) => g?.type === type);
    const src = (Array.isArray(p.goals) ? p.goals : []).find((g: any) => g?.type === type);
    if (!has && src) { c.goals.push(structuredClone(src)); imported.push(`${type}目標 ${wan(num(src.present))}（${src.start} 歲）`); }
  }

  if (!(Array.isArray(c.travel) && c.travel.length) && Array.isArray(p.travel) && p.travel.length) {
    c.travel = structuredClone(p.travel);
    imported.push(`旅遊基金 ${wan(num(p.travel[0]?.amount))}（${p.travel[0]?.start} 歲）`);
  }

  const hasEdu = (Array.isArray(c.education) && c.education.length) ||
    (Array.isArray(c.members) && c.members.some((m: any) => m?.unborn));
  if (!hasEdu) {
    const unborn = (Array.isArray(p.members) ? p.members : []).filter((m: any) => m?.unborn);
    if (unborn.length) {
      c.members = Array.isArray(c.members) ? c.members : [];
      for (const m of unborn) c.members.push(structuredClone(m));
      c.birthPlan = Array.isArray(c.birthPlan) ? c.birthPlan : [];
      for (const b of (Array.isArray(p.birthPlan) ? p.birthPlan : [])) c.birthPlan.push(structuredClone(b));
      imported.push(`預計 ${unborn[0].bornAt} 歲生第 1 胎`);
    } else if (Array.isArray(p.education) && p.education.length) {
      c.education = structuredClone(p.education);
      imported.push(`子女教育 每年 ${wan(num(p.education[0]?.annual))}`);
    }
  }

  c.retire = c.retire && typeof c.retire === "object" ? c.retire : {};
  if (num(c.retire.monthLiving) <= 0 && num(p?.retire?.monthLiving) > 0) {
    c.retire.monthLiving = num(p.retire.monthLiving);
    imported.push(`退休月生活費 ${Math.round(num(p.retire.monthLiving)).toLocaleString()} 元`);
  }

  // 人生目標：聯集（教練勾過的不動，客戶的必達加進去）。
  if (p.intent) {
    const before = normalizeIntent(c.intent);
    const merged = normalizeIntent({
      ...before,
      targets: [...before.targets, ...normalizeIntent(p.intent).targets],
      mustHave: [...before.mustHave, ...normalizeIntent(p.intent).mustHave],
    });
    const added = merged.targets.filter((t) => !before.targets.includes(t));
    c.intent = merged;
    if (added.length) imported.push(`人生目標 ${added.join("、")}`);
  }

  if (!c.passport && p.passport) c.passport = structuredClone(p.passport);
  return { data: c, imported };
}

/** 兩份護照並排的差異（給教練端「客戶的想法」分頁）。只列有變的。 */
export type FaceDiff = { face: keyof PassportFaces | "total"; label: string; from: string; to: string };
export function diffPassports(from: PassportInputs, to: PassportInputs): FaceDiff[] {
  const a: PassportResult = computePassport(from), b: PassportResult = computePassport(to);
  const out: FaceDiff[] = [];
  const wan = (n: number) => `${Math.round(n / 10000).toLocaleString()} 萬`;
  const push = (face: FaceDiff["face"], label: string, x: string, y: string) => { if (x !== y) out.push({ face, label, from: x, to: y }); };
  push("house", "購屋 可負擔房價", wan(a.house.price), wan(b.house.price));
  push("house", "購屋 年份", String(from.house.buyYear), String(to.house.buyYear));
  push("car", "購車 可負擔車價", wan(a.car.price), wan(b.car.price));
  push("car", "購車 年份", String(from.car.buyYear), String(to.car.buyYear));
  push("retire", "退休 年齡", `${from.retire.retireAge} 歲`, `${to.retire.retireAge} 歲`);
  push("retire", "退休 每月可支應（現值）", `${Math.round(a.retire.presentMonthly).toLocaleString()} 元`, `${Math.round(b.retire.presentMonthly).toLocaleString()} 元`);
  push("support", "扶養 預計出生年", String(from.support.birthYear), String(to.support.birthYear));
  push("support", "扶養 可養幾個", round1(a.support.kids).toFixed(1), round1(b.support.kids).toFixed(1));
  push("travel", "旅遊 基金", wan(a.travel.fund), wan(b.travel.fund));
  push("travel", "旅遊 年份", String(from.travel.travelYear), String(to.travel.travelYear));
  push("total", "每月應存合計", `${a.totalMonthlyWan.toFixed(1)} 萬`, `${b.totalMonthlyWan.toFixed(1)} 萬`);
  return out;
}
