import { describe, it, expect } from "vitest";
import {
  normalizeHero, heroToPassport, heroResult, parseDraft,
  HERO_DEFAULT, ASSUMED_WORK_START_AGE,
} from "./passportDraft";
import { computePassport, emptyPassport } from "./passport";

/**
 * 官網公開試算的草稿層。
 *
 * 這一層的錯不會炸，只會安靜地給錯數字或讓兩個頁面顯示不一致——
 * 而「首頁算出 1 萬、點進完整護照變 7 萬」這種不一致，對一個賣財務規劃的網站是致命的。
 */
describe("normalizeHero：邊界", () => {
  it("空值走預設", () => {
    expect(normalizeHero(null)).toEqual(HERO_DEFAULT);
    expect(normalizeHero({})).toEqual(HERO_DEFAULT);
  });

  it("退休年齡不得早於目前年齡（否則年期為負、算出來是空的）", () => {
    const h = normalizeHero({ curAge: 60, retireAge: 50, monthlySave: 2 });
    expect(h.retireAge).toBeGreaterThan(h.curAge);
  });

  it("NaN／字串／超界值都被夾回範圍內", () => {
    const h = normalizeHero({ curAge: NaN, retireAge: 999, monthlySave: -5 });
    expect(h.curAge).toBe(20);
    expect(h.retireAge).toBe(100);
    expect(h.monthlySave).toBe(0);
  });
});

describe("heroToPassport：Hero 三格 → 完整護照", () => {
  it("月存全額進退休，其餘四面向歸零——否則首頁與完整頁的「合計」會不一致", () => {
    const p = heroToPassport({ curAge: 30, retireAge: 65, monthlySave: 2, salary: 5 });
    expect(p.retire.monthly).toBe(2);
    expect(p.house.monthly).toBe(0);
    expect(p.car.monthly).toBe(0);
    expect(p.support.monthly).toBe(0);
    // travel 拉桿下限是 0.1，設 0 會讓完整頁一進去就被 clamp 彈動
    expect(p.travel.monthly).toBe(0.1);
  });

  it("合計每月應存 ≒ 使用者在首頁填的數字（差距只有 travel 的下限 0.1）", () => {
    const total = computePassport(heroToPassport({ curAge: 30, retireAge: 65, monthlySave: 2, salary: 5 })).totalMonthlyWan;
    expect(total).toBeCloseTo(2.1, 5);
  });

  it("年資由退休年齡推算，且夾在拉桿範圍內", () => {
    expect(heroToPassport({ curAge: 30, retireAge: 65, monthlySave: 1, salary: 5 }).retire.workYears)
      .toBe(65 - ASSUMED_WORK_START_AGE);
    // 55 歲退休 → 30 年；夾在 15~60
    expect(heroToPassport({ curAge: 50, retireAge: 55, monthlySave: 1, salary: 5 }).retire.workYears).toBe(30);
    expect(heroToPassport({ curAge: 20, retireAge: 100, monthlySave: 1, salary: 5 }).retire.workYears).toBe(60);
  });

  it("除了被覆寫的欄位，其餘沿用 emptyPassport 的假設（不另外發明一組參數）", () => {
    const e = emptyPassport();
    const p = heroToPassport({ curAge: 30, retireAge: 65, monthlySave: 1, salary: 5 });
    expect(p.retire.lifeExp).toBe(e.retire.lifeExp);
    expect(p.retire.contribRate).toBe(e.retire.contribRate);
    expect(p.retire.annualReturn).toBe(e.retire.annualReturn);
  });
});

describe("heroResult：與完整引擎同源", () => {
  it("結果等同對完整護照跑 computePassport().retire（不是另一套算法）", () => {
    const hero = { curAge: 32, retireAge: 60, monthlySave: 3, salary: 6 };
    const direct = computePassport(heroToPassport(hero)).retire;
    const r = heroResult(hero);
    expect(r.totalMonthly).toBe(direct.totalMonthly);
    expect(r.selfMonthly).toBe(direct.selfMonthly);
    expect(r.laborPensionMonthly).toBe(direct.laborPensionMonthly);
    expect(r.laborInsMonthly).toBe(direct.laborInsMonthly);
  });

  it("三根柱子加起來就是總額", () => {
    const r = heroResult({ curAge: 30, retireAge: 65, monthlySave: 2, salary: 5 });
    expect(r.selfMonthly + r.laborPensionMonthly + r.laborInsMonthly).toBeCloseTo(r.totalMonthly, 6);
  });

  it("月存愈多，退休可領愈多（方向性）", () => {
    const a = heroResult({ curAge: 30, retireAge: 65, monthlySave: 1, salary: 5 });
    const b = heroResult({ curAge: 30, retireAge: 65, monthlySave: 3, salary: 5 });
    expect(b.totalMonthly).toBeGreaterThan(a.totalMonthly);
  });

  it("現值低於名目值（有折現）", () => {
    const r = heroResult({ curAge: 30, retireAge: 65, monthlySave: 2, salary: 5 });
    expect(r.presentMonthly).toBeLessThan(r.totalMonthly);
  });
});

describe("parseDraft：壞掉的草稿要安靜回 null", () => {
  it("非 JSON", () => expect(parseDraft("{oops")).toBeNull());
  it("JSON 但不是我們的格式", () => expect(parseDraft('{"a":1}')).toBeNull());
  it("缺其中一個面向就整份丟掉", () => {
    const p = emptyPassport() as Partial<ReturnType<typeof emptyPassport>>;
    delete p.travel;
    expect(parseDraft(JSON.stringify({ inputs: p, savedAt: 1 }))).toBeNull();
  });
  it("完整草稿可以還原", () => {
    const inputs = heroToPassport({ curAge: 41, retireAge: 66, monthlySave: 2.5, salary: 5 });
    const back = parseDraft(JSON.stringify({ inputs, savedAt: 1 }));
    expect(back?.retire.curAge).toBe(41);
    expect(back?.retire.monthly).toBe(2.5);
  });
});

describe("月薪這一格：撐起勞退與勞保", () => {
  it("月薪有帶進 PassportInputs", () => {
    expect(heroToPassport({ curAge: 30, retireAge: 65, monthlySave: 1, salary: 8 }).retire.salary).toBe(8);
  });

  it("月薪愈高，勞退提撥與勞保年金愈多（少問這格就是拿假設撐四成的數字）", () => {
    const lo = heroResult({ curAge: 30, retireAge: 65, monthlySave: 1, salary: 3 });
    const hi = heroResult({ curAge: 30, retireAge: 65, monthlySave: 1, salary: 9 });
    expect(hi.laborPensionMonthly).toBeGreaterThan(lo.laborPensionMonthly);
    expect(hi.laborInsMonthly).toBeGreaterThan(lo.laborInsMonthly);
    // 自行準備只看月存，不該被月薪影響
    expect(hi.selfMonthly).toBeCloseTo(lo.selfMonthly, 6);
  });

  it("勞保投保薪資有上限，月薪衝到 30 萬也不會無限長", () => {
    const a = heroResult({ curAge: 30, retireAge: 65, monthlySave: 1, salary: 5 });
    const b = heroResult({ curAge: 30, retireAge: 65, monthlySave: 1, salary: 30 });
    expect(b.laborInsMonthly).toBe(a.laborInsMonthly); // 兩者都已超過 45,800 上限
  });
});
