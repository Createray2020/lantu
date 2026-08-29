import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";
import * as T from "./taiwan";
import * as BZ from "./bizTax";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * D1 二代健保費。
 *
 * 改版前 members[].nhiSalary / nhiDeps 是純死欄位（填得進去、全站零讀取點、全庫 0 筆有填）。
 * 這一組測試釘住三件事：
 *   ① 一般保費公式與健保署的三個官方釋例逐元對得上（含進位順序）
 *   ② 眷口上限、身分別負擔比率、分級表上下限都真的生效
 *   ③ 補充保費六類各自的門檻與計費基礎，而且**薪資本身不重複扣**
 *
 * 費率／級距的出處與生效日：衛福部中央健保署公告，115（2026）年 1 月 1 日生效。
 *   ・一般保險費率 5.17%（110.01.01 起）
 *   ・投保金額分級表 29,500（第 1 級）～313,000（第 58 級）
 *   ・眷口上限 3 口（健保法 §27）
 *   ・補充保費 2.11%、單次起扣 20,000（兼職為基本工資 29,500）、單次上限 1,000 萬
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function base(): any {
  const c = E.newCase();
  c.profile.age = 40;
  c.profile.lifeExp = 85;
  c.members = [{ name: "本人", role: "本人", age: 40, nhiCat: "", nhiSalary: 0, nhiDeps: 0 }];
  c.incomes = [];
  c.expenses = [];
  return c;
}

describe("一般保費：健保署官方釋例逐元對得上", () => {
  // 出處：健保署「第 1 類到第 3 類投保單位負擔及被保險人、眷屬自付保險費的計算公式及釋例」
  // 公式原文：投保金額 × 保險費率（5.17%）× 負擔比率 × (本人＋眷屬人數)
  it.each([
    ["第一類 受雇者", 53_000, 2, 2_466],
    ["第二類 職業工會/漁會", 53_000, 2, 4_932],
    ["第一類 雇主/自營業主/專技自行執業", 57_800, 1, 5_976],
  ])("%s 投保 %i、眷屬 %i 口 → 月保費 %i", (cat, salary, deps, want) => {
    const c = base();
    Object.assign(c.members[0], { nhiCat: cat, nhiSalary: salary, nhiDeps: deps });
    expect(E.nhiGeneral(c, c.members[0]).monthly).toBe(want);
  });

  it("進位順序：先把一口的保費四捨五入到元，再乘口數（不是乘完再進位）", () => {
    const c = base();
    Object.assign(c.members[0], { nhiCat: "第一類 雇主/自營業主/專技自行執業", nhiSalary: 57_800, nhiDeps: 1 });
    const g = E.nhiGeneral(c, c.members[0]);
    expect(g.perUnit).toBe(2_988);                       // round(57800 × 5.17% × 100%)
    expect(g.monthly).toBe(5_976);                        // 2,988 × 2
    expect(Math.round(57_800 * 0.0517 * 1 * 2)).toBe(5_977);  // 乘完再進位會多 1 元
  });

  it("年費＝月費 × 12", () => {
    const c = base();
    Object.assign(c.members[0], { nhiCat: "第一類 受雇者", nhiSalary: 53_000, nhiDeps: 2 });
    const g = E.nhiGeneral(c, c.members[0]);
    expect(g.annual).toBe(g.monthly * 12);
  });
});

describe("身分別：負擔比率沿用既有的 JOB_TYPES 分類", () => {
  it.each([
    ["一般就業者", "第一類 受雇者", 30],
    ["業務工作者", "第二類 職業工會/漁會", 60],
    ["企業主", "第一類 雇主/自營業主/專技自行執業", 100],
    ["家管", "第六類 榮民/其他地區人口", 60],
    ["投資者", "第六類 榮民/其他地區人口", 60],
    ["其他", "第一類 受雇者", 30],
  ])("工作類別「%s」→ 投保類別「%s」、自付 %i%%", (job, cat, ratio) => {
    expect(T.nhiJobCat(job)).toBe(cat);
    expect(T.nhiSelfRatio(cat)).toBe(ratio);
  });

  it("JOB_TYPES 每一個值都對得到一個合法的健保投保類別（不留孤兒）", () => {
    for (const j of T.JOB_TYPES) {
      expect(T.nhiSelfRatio(T.nhiJobCat(j))).not.toBeNull();
    }
  });

  it("成員沒選 nhiCat → 依 jobType 自動推（與 jobInsType 同一套分類，不另開一套）", () => {
    const c = base();
    c.members[0].jobType = "企業主";
    c.members[0].nhiSalary = 45_800;
    const g = E.nhiGeneral(c, c.members[0]);
    expect(g.cat).toBe("第一類 雇主/自營業主/專技自行執業");
    expect(g.ratio).toBe(100);
    expect(g.ratioAssumed).toBe(false);
  });

  it("認不得的舊 nhiCat → 退回受僱者 30%，並標成假設值（不靜默）", () => {
    const c = base();
    Object.assign(c.members[0], { nhiCat: "火星人", nhiSalary: 30_000 });
    const g = E.nhiGeneral(c, c.members[0]);
    expect(g.ratio).toBe(30);
    expect(g.ratioAssumed).toBe(true);
  });

  it.each([
    ["第四類 軍眷/替代役"],
    ["第五類 低收入戶"],
    ["第六類 榮民本人"],
    ["眷屬(依附投保)"],
    ["未投保"],
  ])("政府全額補助／依附投保的「%s」自付 0", (cat) => {
    const c = base();
    Object.assign(c.members[0], { nhiCat: cat, nhiSalary: 45_800, nhiDeps: 3 });
    expect(E.nhiGeneral(c, c.members[0]).monthly).toBe(0);
  });

  it("改版前 UI 就在用的 8 個 nhiCat 字串一個都不能少（舊資料不能變孤兒）", () => {
    const legacy = ["第一類 受雇者", "第二類 職業工會/漁會", "第三類 農會/水利會", "第四類 軍眷/替代役",
      "第五類 低收入戶", "第六類 榮民/其他地區人口", "眷屬(依附投保)", "未投保"];
    for (const k of legacy) expect(T.nhiSelfRatio(k)).not.toBeNull();
  });
});

describe("眷口上限：超過 3 口的不計（健保法 §27）", () => {
  it.each([[0, 1], [1, 2], [2, 3], [3, 4], [4, 4], [9, 4]])(
    "眷屬 %i 口 → 計費 %i 口（本人＋眷屬）", (deps, units) => {
      const c = base();
      Object.assign(c.members[0], { nhiCat: "第一類 受雇者", nhiSalary: 30_000, nhiDeps: deps });
      const g = E.nhiGeneral(c, c.members[0]);
      expect(g.units).toBe(units);
      expect(g.monthly).toBe(g.perUnit * units);
    });

  it("超過上限時標記 depsCut，UI 才有東西可以提示", () => {
    const c = base();
    Object.assign(c.members[0], { nhiCat: "第一類 受雇者", nhiSalary: 30_000, nhiDeps: 5 });
    const g = E.nhiGeneral(c, c.members[0]);
    expect(g.deps).toBe(5);
    expect(g.depsCounted).toBe(T.NHI_DEP_CAP);
    expect(g.depsCut).toBe(true);
  });

  it("眷屬 5 口與 3 口的保費一模一樣（上限真的有生效，不是只寫在註解裡）", () => {
    const c = base();
    Object.assign(c.members[0], { nhiCat: "第一類 受雇者", nhiSalary: 40_100, nhiDeps: 3 });
    const a = E.nhiGeneral(c, c.members[0]).monthly;
    c.members[0].nhiDeps = 5;
    expect(E.nhiGeneral(c, c.members[0]).monthly).toBe(a);
  });
});

describe("投保金額分級表：上下限截斷（是另一張表，不是勞保／勞退的）", () => {
  it("低於第 1 級 → 拉到 29,500", () => {
    expect(T.nhiSalaryOf(20_000)).toBe(T.NHI_SALARY_MIN);
    expect(T.NHI_SALARY_MIN).toBe(29_500);
  });
  it("高於第 58 級 → 壓到 313,000", () => {
    expect(T.nhiSalaryOf(500_000)).toBe(T.NHI_SALARY_MAX);
    expect(T.NHI_SALARY_MAX).toBe(313_000);
  });
  it("上限刻意高於勞保分級表天花板與勞退提繳上限（三張表不可混用）", () => {
    expect(T.NHI_SALARY_MAX).toBeGreaterThan(T.LABOR_INS_GRADES[T.LABOR_INS_GRADES.length - 1]);
    expect(T.NHI_SALARY_MAX).toBeGreaterThan(T.LABOR_PENSION_CAP);
  });
  it("截斷了要標記出來（clamped），教練才知道系統改過他填的數字", () => {
    const c = base();
    Object.assign(c.members[0], { nhiCat: "第一類 受雇者", nhiSalary: 500_000 });
    expect(E.nhiGeneral(c, c.members[0]).clamped).toBe(true);
    c.members[0].nhiSalary = 45_800;
    expect(E.nhiGeneral(c, c.members[0]).clamped).toBe(false);
  });
});

describe("補充保費：六類所得各自的門檻與計費基礎", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function withIncome(sub: string, amount: number, period = "年"): any {
    const c = base();
    Object.assign(c.members[0], { nhiCat: "第一類 受雇者", nhiSalary: 40_100, nhiDeps: 0 });
    c.incomes = [{ owner: "本人", type: "工作", subType: sub, period, amount }];
    return c;
  }

  it("六類都被涵蓋，而且每一類都有至少一個 subType 對得到", () => {
    const keys = E.NHI_SUPP_KINDS.map((k: { key: string }) => k.key);
    expect(keys).toEqual(["bonus", "parttime", "prof", "dividend", "interest", "rent"]);
    for (const k of E.NHI_SUPP_KINDS) expect(k.subs.length).toBeGreaterThan(0);
  });

  it("股利 20,000（一次給付）→ 達門檻按【全額】計費 20,000 × 2.11% = 422", () => {
    const c = withIncome("股利/利息", 20_000);
    expect(E.nhiSuppRows(c, c.members[0])[0].fee).toBe(422);
  });

  it("股利 19,999 → 未達門檻，一毛都不扣（不是扣「超過的部分」）", () => {
    const c = withIncome("股利/利息", 19_999);
    expect(E.nhiSuppRows(c, c.members[0])[0].fee).toBe(0);
  });

  it("利息（存款利息）50,000 一次 → 全額計費", () => {
    const c = withIncome("存款利息", 50_000);
    expect(E.nhiSuppRows(c, c.members[0])[0].fee).toBe(Math.round(50_000 * BZ.NHI_SUPP_RATE));
  });

  it("租金月收 30,000（period='月'）→ 一年 12 次、每次都達 20,000 門檻 → 全年 36 萬全額計費", () => {
    const c = withIncome("租金收入", 360_000, "月");
    const r = E.nhiSuppRows(c, c.members[0])[0];
    expect(r.times).toBe(12);
    expect(r.per).toBe(30_000);
    expect(r.charged).toBe(360_000);
    expect(r.fee).toBe(Math.round(360_000 * BZ.NHI_SUPP_RATE));
  });

  it("租金月收 15,000（period='月'）→ 單次未達 20,000 → 全年 18 萬一毛不扣", () => {
    const c = withIncome("租金收入", 180_000, "月");
    expect(E.nhiSuppRows(c, c.members[0])[0].fee).toBe(0);
  });

  it("兼職薪資的門檻是【基本工資】29,500，不是 20,000", () => {
    const lo = withIncome("兼職", 25_000);
    expect(E.nhiSuppRows(lo, lo.members[0])[0].fee).toBe(0);
    const hi = withIncome("兼職", 29_500);
    expect(E.nhiSuppRows(hi, hi.members[0])[0].fee).toBe(Math.round(29_500 * BZ.NHI_SUPP_RATE));
    expect(BZ.NHI_SUPP_WAGE_MIN).toBe(T.NHI_SALARY_MIN);   // 兩處同一個數，改一邊沒改另一邊這條會紅
  });

  it("執行業務所得 100,000 一次 → 全額計費", () => {
    const c = withIncome("執行業務所得", 100_000);
    expect(E.nhiSuppRows(c, c.members[0])[0].fee).toBe(Math.round(100_000 * BZ.NHI_SUPP_RATE));
  });

  it("高額獎金：只就【超過投保金額 4 倍】的部分計費（與其他五類的基礎不同）", () => {
    const c = withIncome("年終獎金", 300_000);           // 投保 40,100 × 4 = 160,400
    const r = E.nhiSuppRows(c, c.members[0])[0];
    expect(r.mode).toBe("excess");
    expect(r.threshold).toBe(40_100 * BZ.NHI_SUPP_BONUS_MULT);
    expect(r.charged).toBe(300_000 - 160_400);
    expect(r.fee).toBe(Math.round(139_600 * BZ.NHI_SUPP_RATE));
  });

  it("獎金沒超過 4 倍 → 不扣", () => {
    const c = withIncome("三節獎金", 100_000);
    expect(E.nhiSuppRows(c, c.members[0])[0].fee).toBe(0);
  });

  it("單次扣取上限 1,000 萬：股利一次領 2,000 萬只算 1,000 萬", () => {
    const c = withIncome("股利/利息", 20_000_000);
    const r = E.nhiSuppRows(c, c.members[0])[0];
    expect(r.charged).toBe(BZ.NHI_SUPP_CAP);
    expect(r.fee).toBe(Math.round(BZ.NHI_SUPP_CAP * BZ.NHI_SUPP_RATE));
  });

  it("⚠️⚠️ 薪資本身不重複扣：薪資／加班費／差旅補貼都不進補充保費", () => {
    for (const sub of ["薪資", "加班費", "差旅/交通補貼"]) {
      const c = withIncome(sub, 1_200_000);
      expect(E.nhiSuppKindOf(sub)).toBeNull();
      expect(E.nhiSuppRows(c, c.members[0])).toEqual([]);
    }
  });

  it("沒有 subType 的舊收入列一律不扣（不猜）", () => {
    const c = withIncome("", 1_200_000);
    expect(E.nhiSuppRows(c, c.members[0])).toEqual([]);
  });

  it("owner 留空的收入列歸給「本人」（與全站 primaryMember 的慣例一致）", () => {
    const c = withIncome("租金收入", 600_000);
    c.incomes[0].owner = "";
    expect(E.nhiSuppRows(c, c.members[0]).length).toBe(1);
  });

  it("別人名下的收入不會算到這位成員頭上", () => {
    const c = withIncome("租金收入", 600_000);
    c.incomes[0].owner = "配偶";
    expect(E.nhiSuppRows(c, c.members[0])).toEqual([]);
  });
});

describe("全家彙總與「未填時的行為」", () => {
  it("沒有任何成員填投保薪資 → filled=false、全部回 0（沒填不等於零保費）", () => {
    const c = base();
    c.incomes = [{ owner: "本人", type: "理財", subType: "租金收入", period: "年", amount: 600_000 }];
    const f = E.nhiFamily(c);
    expect(f.filled).toBe(false);
    expect(f.generalAnnual).toBe(0);
    expect(f.suppAnnual).toBe(0);
    expect(f.annual).toBe(0);
  });

  it("填了就算：一般保費＋補充保費＝合計", () => {
    const c = base();
    Object.assign(c.members[0], { nhiCat: "第一類 受雇者", nhiSalary: 53_000, nhiDeps: 2 });
    c.incomes = [{ owner: "本人", type: "理財", subType: "租金收入", period: "年", amount: 600_000 }];
    const f = E.nhiFamily(c);
    expect(f.filled).toBe(true);
    expect(f.generalAnnual).toBe(2_466 * 12);
    expect(f.suppAnnual).toBe(Math.round(600_000 * BZ.NHI_SUPP_RATE));
    expect(f.annual).toBe(f.generalAnnual + f.suppAnnual);
  });
});

describe("支出表同步 syncNHI()：比照 syncPremium()", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function filled(): any {
    const c = base();
    Object.assign(c.members[0], { nhiCat: "第一類 受雇者", nhiSalary: 53_000, nhiDeps: 2 });
    return c;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auto = (c: any) => c.expenses.filter((e: { nhiAuto?: boolean }) => e.nhiAuto);

  it("沒填 → 不產生任何支出列（既有個案一位不動）", () => {
    const c = base();
    E.syncNHI(c);
    expect(c.expenses).toEqual([]);
  });

  it("填了 → 產生一列，帶大類/細類/起訖", () => {
    const c = filled();
    E.syncNHI(c);
    expect(auto(c).length).toBe(1);
    const r = auto(c)[0];
    expect(r.cat).toBe("保險");
    expect(r.subCat).toBe("勞健保自付");
    expect(r.name).toBe(E.NHI_AUTO_NAME);
    expect(r.period).toBe("年");
    expect(r.start).toBe(40);          // 現齡
    expect(r.end).toBe(85);            // 預估壽命
    expect(r.amount).toBe(E.nhiFamily(c).annual);
  });

  it("⚠️ 重跑是【更新】不是複製（穩定標記 nhiAuto，比照 birthBid）", () => {
    const c = filled();
    E.syncNHI(c); E.syncNHI(c); E.syncNHI(c);
    expect(auto(c).length).toBe(1);
    c.members[0].nhiSalary = 45_800;
    E.syncNHI(c);
    expect(auto(c).length).toBe(1);
    expect(auto(c)[0].amount).toBe(E.nhiFamily(c).annual);
  });

  it("教練改過的起訖不會被下一次同步蓋回去", () => {
    const c = filled();
    E.syncNHI(c);
    auto(c)[0].start = 45; auto(c)[0].end = 70;
    c.members[0].nhiDeps = 0;
    E.syncNHI(c);
    expect(auto(c)[0].start).toBe(45);
    expect(auto(c)[0].end).toBe(70);
  });

  it("關掉（c.nhiExpenseOff）→ 那一列收回去，不留殘骸；再開就長回來", () => {
    const c = filled();
    E.syncNHI(c);
    expect(auto(c).length).toBe(1);
    c.nhiExpenseOff = true;
    E.syncNHI(c);
    expect(auto(c).length).toBe(0);
    expect(E.nhiExpenseOn(c)).toBe(false);
    c.nhiExpenseOff = false;
    E.syncNHI(c);
    expect(auto(c).length).toBe(1);
  });

  it("投保薪資被清掉 → 那一列跟著收回去（不留一個對不上任何資料的鬼列）", () => {
    const c = filled();
    E.syncNHI(c);
    c.members[0].nhiSalary = 0;
    E.syncNHI(c);
    expect(auto(c).length).toBe(0);
  });

  it("真的進總支出、影響現金流（Ray 明確要的那一條）", () => {
    const c = filled();
    const before = E.metrics(c).expTotal;
    E.syncNHI(c);
    expect(E.metrics(c).expTotal).toBe(before + E.nhiFamily(c).annual);
  });

  it("⚠️ subCat 用「勞健保自付」，它在 PREM_KEEP 名單裡 → syncPremium() 不會把它接管掉", () => {
    expect(HTML).toContain("var PREM_KEEP=['車險/住宅火險','勞健保自付','勞健保','國民年金保費'];");
  });
});
