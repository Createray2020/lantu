import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";

// 引擎是 @ts-nocheck 的移植純函式，測試以 any 呼叫（與 engine.test.ts 同慣例）。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

/**
 * 對齊「個人/家庭財務報表指標完整版」Excel 之後，新增/修正的引擎語意。
 *
 * 這一支守住四件會靜默算錯的事：
 *  1. 支出多了「貸款」大類 —— 貸款壓力比與低彈性支出比的分子要吃得到它。
 *  2. 儲蓄理財投入是獨立的 c.savings[]，不能進總支出，但要當有效儲蓄率的分子。
 *  3. lifeNeed 補上父母奉養費（責任遞減圖本來就算，需求反推卻漏了）。
 *  4. 保障險種改名「意外傷殘」＋新增醫療雜費/薪資補償，舊資料的「意外險」仍要對得上。
 */

// 乾淨的空白個案，只放測試要的那幾筆——用 sampleCase 會被示範資料干擾。
function blank() {
  const c = E.newCase();
  c.profile.age = 40;
  c.profile.retireAge = 65;
  c.members = [{ name: "本人", role: "本人", gender: "男", age: 40, depRatio: 100, expRatio: 100, indepAge: "" }];
  return c;
}

describe("支出的『貸款』大類", () => {
  it("手動貸款列會被算進『貸款壓力比』與『低彈性支出比』的分子", () => {
    const c = blank();
    c.incomes = [{ owner: "本人", type: "工作", amount: 1_000_000, growth: 0, start: 40, end: 65 }];
    c.expenses = [{ name: "親友借款月還", cat: "貸款", subCat: "其他貸款支出", amount: 200_000, infl: false, start: 40, end: 60, cut: 0 }];

    expect(E.manualLoanPay(c)).toBe(200_000);
    const r = E.ratios(c);
    expect(r["貸款壓力比"].v).toBe(E.pct(200_000 / 1_000_000));
    // 低彈性 = 貸款 + 租金 + 保費，這裡只有貸款
    expect(r["低彈性支出比"].v).toBe(E.pct(200_000 / 1_000_000));
  });

  it("貸款列不算家庭生活費（生活費用比不能被房貸灌爆）", () => {
    const c = blank();
    c.expenses = [
      { name: "生活費", cat: "生活", amount: 300_000, infl: true, start: 40, end: 85, cut: 0 },
      { name: "房貸", cat: "貸款", subCat: "自用住宅貸款", amount: 400_000, infl: false, start: 40, end: 70, cut: 0 },
    ];
    expect(E.familyAnnualLiving(c)).toBe(300_000);
  });

  it("貸款列不算『可刪減支出』（消費隨興比不受影響）", () => {
    const c = blank();
    c.incomes = [{ owner: "本人", type: "工作", amount: 1_000_000, growth: 0, start: 40, end: 65 }];
    c.expenses = [{ name: "車貸", cat: "貸款", subCat: "汽車貸款", amount: 300_000, infl: false, start: 40, end: 47, cut: 0 }];
    expect(E.ratios(c)["消費隨興比"].v).toBe(E.pct(0));
  });

  it("負債表反推的年付本息與手動貸款列相加＝家庭貸款總支出", () => {
    const c = blank();
    c.incomes = [{ owner: "本人", type: "工作", amount: 2_000_000, growth: 0, start: 40, end: 65 }];
    c.liabilities = [{ name: "房貸", owner: "本人", mainCat: "房貸", subCat: "自住房貸", currency: "台幣", fxRate: 1, balance: 5_000_000, rate: 2, repay: "本息攤還", pay: 25_000, months: 240, grace: 0, startAge: 40 }];
    c.expenses = [{ name: "親友借款", cat: "貸款", subCat: "其他貸款支出", amount: 100_000, infl: false, start: 40, end: 50, cut: 0 }];
    const fromDebt = E.annualDebtPay(c); // 25,000 × 12
    expect(fromDebt).toBe(300_000);
    expect(E.ratios(c)["貸款壓力比"].v).toBe(E.pct((300_000 + 100_000) / 2_000_000));
  });
});

describe("儲蓄理財投入 c.savings[]", () => {
  it("不進總支出——它是換口袋，不是花掉", () => {
    const c = blank();
    c.expenses = [{ name: "生活費", cat: "生活", amount: 500_000, infl: true, start: 40, end: 85, cut: 0 }];
    c.savings = [{ name: "定期定額", cat: "儲蓄理財", subCat: "定期定額ETF/基金", amount: 240_000, period: "月" }];
    const m = E.metrics(c);
    expect(m.expTotal).toBe(500_000);
    expect(m.saveInvest).toBe(240_000);
  });

  it("是『有效儲蓄率』的分子（有登錄就用它，蓋掉舊的參數欄）", () => {
    const c = blank();
    c.incomes = [{ owner: "本人", type: "工作", amount: 1_200_000, growth: 0, start: 40, end: 65 }];
    c.params.planYearly = 999_999; // 舊的參數欄
    c.savings = [{ name: "儲蓄險", cat: "儲蓄理財", subCat: "儲蓄保險保費", amount: 300_000, period: "年" }];
    expect(E.ratios(c)["有效儲蓄率"].v).toBe(E.pct(300_000 / 1_200_000));
  });

  it("沒登錄儲蓄理財投入時，退回舊行為（既有案子的數字不變）", () => {
    const c = blank();
    c.incomes = [{ owner: "本人", type: "工作", amount: 1_000_000, growth: 0, start: 40, end: 65 }];
    c.params.planYearly = 250_000;
    c.savings = [];
    expect(E.ratios(c)["有效儲蓄率"].v).toBe(E.pct(250_000 / 1_000_000));
  });

  it("newCase 會把 savings 清成空陣列（不會殘留示範資料）", () => {
    expect(E.newCase().savings).toEqual([]);
  });
});

describe("lifeNeed 補上父母奉養費", () => {
  it("孝親費 × 保障年數 會進壽險需求", () => {
    const base = blank();
    base.expenses = [{ name: "生活費", cat: "生活", amount: 600_000, infl: true, start: 40, end: 85, cut: 0 }];
    const nd = { member: "本人", funeral: 0, protectYears: 10, estateTax: 0, room: 0, selfPay: 0, nursing: 0, miscDaily: 0, incomeComp: 0, disability: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, careMonths: 0 };
    base.needs = [nd];
    const without = E.lifeNeed(base, nd);

    const withParents = JSON.parse(JSON.stringify(base));
    withParents.expenses.push({ name: "孝親金", cat: "孝親", amount: 120_000, infl: false, start: 40, end: 70, cut: 0 });
    const after = E.lifeNeed(withParents, withParents.needs[0]);

    expect(after - without).toBe(120_000 * 10);
  });
});

describe("保障險種：意外傷殘 / 醫療雜費 / 薪資補償", () => {
  it("KINDS 換成需求分析在問的那組（意外險 → 意外傷殘）", () => {
    expect(E.KINDS).toContain("意外傷殘");
    expect(E.KINDS).toContain("醫療雜費");
    expect(E.KINDS).toContain("薪資補償");
    expect(E.KINDS).not.toContain("意外險");
    // 癌症住院刻意保留：既有案子已經填了值，拿掉會靜默歸零
    expect(E.KINDS).toContain("癌症住院");
  });

  it("舊資料 coverages[].kind='意外險' 仍然對得上『意外傷殘』的缺口", () => {
    const c = blank();
    c.coverages = [{ member: "本人", kind: "意外險", comm: 1_000_000, social: 0 }];
    expect(E.existingCover(c, "本人", "意外傷殘")).toBe(1_000_000);
    expect(E.kindNorm("意外險")).toBe("意外傷殘");
  });

  it("意外傷殘從此有缺口列（改版前 accident 只能填、永遠不進缺口表）", () => {
    const c = blank();
    c.needs = [{ member: "本人", funeral: 0, protectYears: 0, estateTax: 0, room: 0, selfPay: 0, nursing: 0, miscDaily: 0, incomeComp: 0, disability: 3_000_000, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, careMonths: 0 }];
    const row = E.coverageGaps(c).find((g: { kind: string }) => g.kind === "意外傷殘");
    expect(row).toBeTruthy();
    expect(row.need).toBe(3_000_000);
    expect(row.gap).toBe(3_000_000);
  });

  it("保單的醫療雜費 / 薪資補償欄位會被對應的缺口吃到", () => {
    const c = blank();
    c.needs = [{ member: "本人", funeral: 0, protectYears: 0, estateTax: 0, room: 0, selfPay: 0, nursing: 0, miscDaily: 100_000, incomeComp: 50_000, disability: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, careMonths: 0 }];
    c.policies = [{ insured: "本人", name: "實支實付", premium: 0, life: 0, accident: 0, medical: 0, medMisc: 60_000, incomeComp: 20_000, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, cashValue: 0 }];
    const g = E.coverageGaps(c);
    const misc = g.find((x: { kind: string }) => x.kind === "醫療雜費");
    const comp = g.find((x: { kind: string }) => x.kind === "薪資補償");
    expect(misc.gap).toBe(40_000);
    expect(comp.gap).toBe(30_000);
  });
});

describe("資產布局規劃（核心 / 衛星 / 短期保留 / 生活用）", () => {
  const mk = (o: Record<string, unknown>) => ({ currency: "台幣", fxRate: 1, value: 1_000_000, cost: 0, income: 0, ret: 0, movable: true, ...o });

  it("預設推導：自用→生活用、可投資且風險性→衛星、其餘→核心", () => {
    expect(E.assetLayer(mk({ mainCat: "自用資產", type: "自住不動產" }))).toBe("生活用");
    expect(E.assetLayer(mk({ mainCat: "可投資資產", type: "股票", risk: true }))).toBe("衛星");
    expect(E.assetLayer(mk({ mainCat: "可投資資產", type: "定存", risk: false }))).toBe("核心");
  });

  it("顧問手動指定的 layer 優先（含 Excel 才有的『為短期目標保留』）", () => {
    expect(E.assetLayer(mk({ mainCat: "可投資資產", type: "現金", layer: "短期保留" }))).toBe("短期保留");
  });

  it("assetLayout 分層加總＝總資產（換算台幣後不會漏掉任何一筆）", () => {
    const c = blank();
    c.assets = [
      mk({ name: "活存", mainCat: "自用資產", type: "現金" }),
      mk({ name: "美股", mainCat: "可投資資產", type: "股票", risk: true, currency: "美金", fxRate: 32, value: 10_000 }),
      mk({ name: "頭期款", mainCat: "可投資資產", type: "定存", layer: "短期保留", value: 2_000_000 }),
    ];
    const lay = E.assetLayout(c);
    const tot = c.assets.reduce((s: number, a: { value: number; fxRate: number }) => s + a.value * a.fxRate, 0);
    expect(lay["生活用"] + lay["衛星"] + lay["短期保留"] + lay["核心"]).toBe(tot);
    expect(lay["短期保留"]).toBe(2_000_000);
    expect(lay["衛星"]).toBe(320_000);
  });

  it("布局只做呈現，不改『核心資產比』的既有算法（改了會讓所有舊案的指標整批跳動）", () => {
    const c = blank();
    c.assets = [
      mk({ name: "股票", mainCat: "可投資資產", type: "股票", risk: true }),
      mk({ name: "自住房", mainCat: "自用資產", type: "自住不動產" }),
    ];
    // 核心資產比仍是「可投資資產 ÷ 總資產」＝ 50%，不是布局版的「核心 ÷ 總資產」＝ 0%
    expect(E.ratios(c)["核心資產比"].v).toBe(E.pct(0.5));
    expect(E.assetLayout(c)["核心"]).toBe(0);
  });
});

describe("收支損益表（crossTable）對齊 Excel 的分列", () => {
  it("貸款、撫育/孝親、儲蓄理財投入各自成列，不再全部倒進『其他』", () => {
    const c = blank();
    c.incomes = [{ owner: "本人", type: "工作", amount: 1_500_000, growth: 0, start: 40, end: 65 }];
    c.expenses = [
      { name: "生活費", cat: "生活", amount: 500_000, infl: true, start: 40, end: 85, cut: 0 },
      { name: "房貸", cat: "貸款", subCat: "自用住宅貸款", amount: 360_000, infl: false, start: 40, end: 70, cut: 0 },
      { name: "孝親金", cat: "孝親", amount: 120_000, infl: false, start: 40, end: 70, cut: 0 },
      { name: "捐款", cat: "其他", amount: 50_000, infl: false, start: 40, end: 85, cut: 0 },
    ];
    c.savings = [{ name: "ETF", cat: "儲蓄理財", subCat: "定期定額ETF/基金", amount: 180_000, period: "月" }];
    const ct = E.crossTable(c);
    expect(ct.expLoan).toBe(360_000);
    expect(ct.expSupport).toBe(120_000);
    expect(ct.expOther).toBe(50_000);
    expect(ct.saveInvest).toBe(180_000);
    // 支出合計不含儲蓄理財投入
    expect(ct.expTotal).toBe(500_000 + 360_000 + 120_000 + 50_000);
  });
});
