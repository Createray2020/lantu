import { describe, it, expect } from "vitest";
import * as T from "./taiwan";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

/**
 * 台灣制度數字的年度護欄。
 *
 * 稽核發現 engine.ts 把 html 端的年度出處註解全部剝掉了：級距、免稅額、扣除額、
 * 勞保級距全部沒有年度欄位、沒有常數、也沒有任何測試會在跨年時變紅。
 * TAX_BR 這組是 2025 年度（2026/05 申報），**下一個報稅季 2027/05 就過期**。
 *
 * 這裡的做法：把年度寫成常數，並斷言「今年不得超過適用年度 +1」。
 * 跨年沒更新就會紅，逼人回頭查財政部/勞動部公告。
 */
describe("台灣制度常數（每年檢視）", () => {
  it("綜所稅：級距與適用年度未過期", () => {
    expect(T.TAX_BR.map((b) => b[0])).toEqual([590_000, 1_330_000, 2_660_000, 4_980_000, 1e15]);
    expect(T.TAX_BR.map((b) => b[1])).toEqual([0.05, 0.12, 0.2, 0.3, 0.4]);
    expect(T.EXEMPT_PER_PERSON).toBe(97_000);
    expect(T.STD_DED_SINGLE).toBe(131_000);
    expect(T.STD_DED_MARRIED).toBe(262_000);
    expect(T.SALARY_SPECIAL).toBe(218_000);
    // 申報年 = 所得年度 + 1。超過就代表這組數字該更新了。
    expect(new Date().getFullYear()).toBeLessThanOrEqual(T.TAX_YEAR + 1);
  });

  it("遺產稅：免稅額與三項法定扣除額、適用年度未過期", () => {
    expect(T.ESTATE_EXEMPT).toBe(13_330_000);
    expect(T.ESTATE_SPOUSE_DED).toBe(5_530_000);
    expect(T.ESTATE_LINEAL_DED).toBe(560_000);
    expect(T.ESTATE_FUNERAL_DED).toBe(1_380_000);
    expect(T.EST_BR.map((b) => b[0])).toEqual([56_210_000, 112_420_000, 1e15]);
    expect(new Date().getFullYear()).toBeLessThanOrEqual(T.ESTATE_YEAR + 1);
  });

  it("勞保投保薪資分級表（2026 適用），上限 45,800", () => {
    expect(T.LABOR_INS_GRADES[0]).toBe(29_500);
    expect(T.LABOR_INS_GRADES.at(-1)).toBe(45_800);
    expect(T.laborInsSalary(0)).toBe(0);
    expect(T.laborInsSalary(30_000)).toBe(30_300);
    expect(T.laborInsSalary(45_800)).toBe(45_800);
    expect(T.laborInsSalary(100_000)).toBe(45_800); // 勞保封頂
    expect(new Date().getFullYear()).toBeLessThanOrEqual(T.LABOR_YEAR);
  });

  it("勞退月提繳工資是另一張表，上限 150,000（不是勞保的 45,800）", () => {
    expect(T.LABOR_PENSION_CAP).toBe(150_000);
    expect(T.laborPensionSalary(30_000)).toBe(30_300);
    expect(T.laborPensionSalary(100_000)).toBe(100_000); // 不會被勞保天花板砍掉
    expect(T.laborPensionSalary(200_000)).toBe(150_000);
    // 月薪 10 萬時，用錯表會讓提繳基數只剩 45.8%
    expect(T.laborInsSalary(100_000) / T.laborPensionSalary(100_000)).toBeCloseTo(0.458, 3);
  });

  it("執行業務者費用標準：常用職業別與預設費用率", () => {
    expect(T.profStdRate("律師")).toBe(30);
    expect(T.profStdRate("會計師")).toBe(35);
    expect(T.profStdRate("不存在的職業")).toBeNull();
    expect(T.profExpenseRate({})).toBe(20); // 沒指定 → 保守預設
    expect(T.profExpenseRate({ profOccupation: "律師" })).toBe(30);
    expect(T.profExpenseRate({ profOccupation: "律師", profRate: 45 })).toBe(45); // 手動覆寫優先
  });
});

describe("稅額實算", () => {
  it("bracket：邊界值不再回傳錯誤稅率", () => {
    // 超過最高級距上界 → 套最高級距（舊版直接掉出迴圈回 0 稅）
    expect(E.bracket(1e16, T.TAX_BR).tax).toBeGreaterThan(0);
    expect(E.bracket(1e16, T.TAX_BR).rate).toBe(0.4);
    // NaN / Infinity → 0
    expect(E.bracket(NaN, T.TAX_BR).tax).toBe(0);
    expect(E.bracket(Infinity, T.TAX_BR).tax).toBe(0);
    // 負所得 → 稅率也要是 0（舊版回 5%，並且會顯示在畫面上）
    expect(E.bracket(-1, T.TAX_BR).rate).toBe(0);
    expect(E.bracket(-1, T.TAX_BR).tax).toBe(0);
    // 一般值
    expect(E.bracket(554_000, T.TAX_BR).rate).toBe(0.05);
    expect(E.bracket(554_000, T.TAX_BR).tax).toBeCloseTo(27_700, 0);
  });

  it("incomeTax：單身、薪資 100 萬", () => {
    const c = E.newCase();
    c.incomes = [{ owner: "本人", type: "工作", subType: "薪資", amount: 1_000_000, growth: 0, start: 40, end: 65 }];
    c.members = [{ name: "本人", role: "本人", insSalary: 45_800, depRatio: 100 }];
    c.taxParams = { married: false, dependents: 0, otherDeduction: 0 };
    const t = E.incomeTax(c);
    expect(t.exempt).toBe(97_000);
    expect(t.stdDed).toBe(131_000);
    expect(t.salarySpecial).toBe(218_000);
    expect(t.salaryEarners).toBe(1);
    expect(t.net).toBe(554_000);
    expect(t.rate).toBe(0.05);
    expect(Math.round(t.tax)).toBe(27_700);
  });

  it("incomeTax：薪資特別扣除人數不會超過申報身分（單身最多 1 份）", () => {
    const c = E.newCase();
    c.incomes = [{ owner: "本人", type: "工作", subType: "薪資", amount: 2_000_000, growth: 0, start: 40, end: 65 }];
    // 家庭加了有投保薪資的配偶，但稅賦分頁還是單身
    c.members = [
      { name: "本人", role: "本人", insSalary: 45_800, depRatio: 100 },
      { name: "配偶", role: "配偶", insSalary: 40_100, depRatio: 0 },
    ];
    c.taxParams = { married: false, dependents: 0, otherDeduction: 0 };
    expect(E.incomeTax(c).salaryEarners).toBe(1);
    expect(E.incomeTax(c).salarySpecial).toBe(218_000);
    // 切成有偶後才是 2 份
    c.taxParams.married = true;
    expect(E.incomeTax(c).salaryEarners).toBe(2);
    expect(E.incomeTax(c).salarySpecial).toBe(436_000);
  });

  it("incomeTax：執行業務所得走費用率，不適用薪資特別扣除", () => {
    const c = E.newCase();
    c.incomes = [{ owner: "本人", type: "工作", subType: "執行業務所得", amount: 5_000_000, growth: 0, start: 40, end: 65 }];
    c.members = [{ name: "本人", role: "本人", insSalary: 45_800, depRatio: 100 }];
    c.taxParams = { married: false, dependents: 0, otherDeduction: 0, profOccupation: "律師" };
    const t = E.incomeTax(c);
    expect(t.profGross).toBe(5_000_000);
    expect(t.profRate).toBe(30);
    expect(t.profExpense).toBe(1_500_000);
    expect(t.profNet).toBe(3_500_000);
    expect(t.salary).toBe(0);
    expect(t.salarySpecial).toBe(0); // 執業所得沒有薪資特扣
    expect(t.net).toBe(3_500_000 - 97_000 - 131_000);
  });

  it("estateTax：配偶＋2 名子女的扣除額有被算進去", () => {
    const c = E.newCase();
    c.assets = [{ name: "現金", owner: "本人", cls: "流動", type: "現金", value: 50_000_000, fxRate: 1, movable: true }];
    c.taxParams = { married: true, dependents: 2, otherDeduction: 0 };
    c.legacy = { heirs: 2, perHeirCash: 0, perHeirNote: "", feedEstate: false };
    const e = E.estateTax(c);
    expect(e.deductions.exempt).toBe(13_330_000);
    expect(e.deductions.spouse).toBe(5_530_000);
    expect(e.deductions.lineal).toBe(2 * 560_000);
    expect(e.deductions.funeral).toBe(1_380_000);
    expect(e.totalDeduction).toBe(13_330_000 + 5_530_000 + 1_120_000 + 1_380_000);
    expect(e.base).toBe(50_000_000 - e.totalDeduction);
    // 舊版只扣免稅額 → 課稅淨額會多算 8,030,000、稅多 803,000
    expect(e.base).toBeLessThan(50_000_000 - 13_330_000);
  });

  it("estateTax：不再誤用綜所稅的『其他扣除額』", () => {
    const c = E.newCase();
    c.assets = [{ name: "現金", owner: "本人", cls: "流動", type: "現金", value: 50_000_000, fxRate: 1, movable: true }];
    c.taxParams = { married: false, dependents: 0, otherDeduction: 200_000 };
    c.legacy = { heirs: 0, perHeirCash: 0 };
    const withIncomeDed = E.estateTax(c);
    c.taxParams.otherDeduction = 0;
    const without = E.estateTax(c);
    expect(withIncomeDed.base).toBe(without.base); // 綜所稅的扣除額不該影響遺產稅
    // 遺產稅專用欄位才會生效
    c.taxParams.estateDeduction = 200_000;
    expect(E.estateTax(c).base).toBe(without.base - 200_000);
  });

  it("pmt：期數為 0 回 0，不再是 Infinity", () => {
    expect(E.pmt(10_000_000, 2, 0)).toBe(0);
    expect(E.pmt(10_000_000, 2, -5)).toBe(0);
    expect(Number.isFinite(E.pmt(10_000_000, 2, 240))).toBe(true);
    expect(E.pmt(1_200_000, 0, 12)).toBe(100_000); // 零利率＝本金均攤
  });

  it("fmt / pct：Infinity 顯示為破折號，不會把字串印到畫面上", () => {
    expect(E.fmt(Infinity)).toBe("—");
    expect(E.fmt(-Infinity)).toBe("—");
    expect(E.fmt(1234567)).toBe("1,234,567");
    expect(E.pct(Infinity)).toBe("—");
    expect(E.pct(NaN)).toBe("—");
    expect(E.pct(0.1234)).toBe("12.34%");
  });
});
