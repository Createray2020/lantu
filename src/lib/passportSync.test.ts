import { describe, it, expect } from "vitest";
import { buildCase } from "./clientPlan";
import { emptyPassport, computePassport, type PassportInputs } from "./passport";
import { passportFromCase, mergePassportIntoCase, diffPassports } from "./passportSync";

/* eslint-disable @typescript-eslint/no-explicit-any */

function filled(): PassportInputs {
  const p = emptyPassport(2026);
  p.retire = { ...p.retire, curAge: 32, retireAge: 60, monthly: 2, salary: 6, workYears: 30 };
  p.house = { ...p.house, monthly: 3, buyYear: 2034, loanRatio: 8 };
  p.car = { ...p.car, monthly: 1, buyYear: 2029 };
  p.travel = { ...p.travel, monthly: 0.5, travelYear: 2028 };
  p.support = { ...p.support, monthly: 1.2, birthYear: 2030, raiseToAge: 22 };
  return p;
}

describe("passportFromCase：case → 護照 反推，往返要對得回來", () => {
  const p = filled();
  const c = buildCase(p, "測試");
  const back = passportFromCase(c, p);
  const r0 = computePassport(p), r1 = computePassport(back);

  it("購屋／購車：目標年與可負擔價格回得來（月存到 0.1 萬，價差 < 1%）", () => {
    expect(back.house.buyYear).toBe(2034);
    expect(back.car.buyYear).toBe(2029);
    expect(Math.abs(r1.house.price - r0.house.price) / r0.house.price).toBeLessThan(0.01);
    expect(Math.abs(r1.car.price - r0.car.price) / r0.car.price).toBeLessThan(0.02);
  });

  it("旅遊：年份與基金回得來", () => {
    expect(back.travel.travelYear).toBe(2028);
    expect(Math.abs(r1.travel.fund - r0.travel.fund) / r0.travel.fund).toBeLessThan(0.02);
  });

  it("退休：退休年齡與現值月可支應回得來", () => {
    expect(back.retire.retireAge).toBe(60);
    expect(back.retire.curAge).toBe(32);
    expect(Math.abs(r1.retire.presentMonthly - r0.retire.presentMonthly) / r0.retire.presentMonthly).toBeLessThan(0.02);
  });

  it("扶養：未出生子女 → 出生年回得來；case 裡是「一位」子女，所以反推＝養得起 1 個（不是護照原本的 0.13）", () => {
    expect(back.support.birthYear).toBe(2030);
    expect(r0.support.kids).toBeLessThan(1);
    expect(Math.abs(r1.support.kids - 1)).toBeLessThan(0.05);
  });

  it("參數沿用 prev（反推不碰報酬率／貸款年數／薪資）", () => {
    expect(back.house.annualReturn).toBe(p.house.annualReturn);
    expect(back.house.loanYears).toBe(p.house.loanYears);
    expect(back.retire.salary).toBe(p.retire.salary);
  });

  it("教練改了目標 → 護照跟著動（房價 1.5 倍、退休延到 65）", () => {
    const c2: any = structuredClone(c);
    c2.goals.find((g: any) => g.type === "購屋").present *= 1.5;
    c2.profile.retireAge = 65;
    const b2 = passportFromCase(c2, p);
    expect(b2.retire.retireAge).toBe(65);
    expect(b2.house.monthly).toBeGreaterThan(back.house.monthly);
  });

  it("教練刪了目標 → 該面向月存歸 0，其餘不受影響", () => {
    const c2: any = structuredClone(c);
    c2.goals = c2.goals.filter((g: any) => g.type !== "購車");
    c2.travel = [];
    const b2 = passportFromCase(c2, p);
    expect(b2.car.monthly).toBe(0);
    expect(b2.travel.monthly).toBe(0);
    expect(b2.house.monthly).toBe(back.house.monthly);
  });

  it("沒有 prev 時從 case 裡 stash 的 inputs 取參數；都沒有就用預設", () => {
    const b = passportFromCase(c, null);
    expect(b.retire.salary).toBe(6);
    const b2 = passportFromCase({ profile: { age: 40 }, goals: [], retire: {} }, null, 2027);
    expect(b2.baseYear).toBe(2027);
    expect(b2.retire.curAge).toBe(40);
  });
});

describe("mergePassportIntoCase：只補空白、不蓋教練填過的", () => {
  const p = filled();
  const pc = buildCase(p, "測試");

  it("空白教練版 → 五面向全部帶入，回報清單", () => {
    const { data, imported } = mergePassportIntoCase({ goals: [], travel: [], education: [], members: [], retire: { monthLiving: 0 } }, pc);
    expect(data.goals.map((g: any) => g.type).sort()).toEqual(["購屋", "購車"]);
    expect(data.travel.length).toBe(1);
    expect(data.members.some((m: any) => m.unborn)).toBe(true);
    expect(data.retire.monthLiving).toBeGreaterThan(0);
    expect(data.passport).toBeTruthy();
    expect(imported.length).toBeGreaterThanOrEqual(5);
  });

  it("教練已填購屋與退休 → 這兩項不動，其餘補上", () => {
    const coach = { goals: [{ type: "購屋", present: 99, start: 50 }], travel: [], retire: { monthLiving: 12345 }, members: [], education: [] };
    const { data, imported } = mergePassportIntoCase(coach, pc);
    expect(data.goals.find((g: any) => g.type === "購屋").present).toBe(99);
    expect(data.retire.monthLiving).toBe(12345);
    expect(data.goals.some((g: any) => g.type === "購車")).toBe(true);
    expect(imported.some((s) => s.startsWith("購屋"))).toBe(false);
    expect(imported.some((s) => s.startsWith("退休"))).toBe(false);
  });

  it("不改到傳入的物件", () => {
    const coach = { goals: [], travel: [] };
    mergePassportIntoCase(coach, pc);
    expect(coach.goals.length).toBe(0);
  });
});

describe("diffPassports", () => {
  it("一樣就沒有差異；改退休年齡只列退休相關", () => {
    const p = filled();
    expect(diffPassports(p, p)).toEqual([]);
    const q = structuredClone(p); q.retire.retireAge = 58;
    const d = diffPassports(p, q);
    expect(d.every((x) => x.face === "retire" || x.face === "total")).toBe(true);
    expect(d.find((x) => x.label === "退休 年齡")).toMatchObject({ from: "60 歲", to: "58 歲" });
  });
});
