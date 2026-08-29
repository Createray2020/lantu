import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";
import * as BZ from "./bizTax";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

/**
 * D2 產險比對線。
 *
 * ⚠️⚠️ 這是一條**平行於 KINDS 的骨幹**（PKINDS / PPOLICY_MAP），刻意不塞進人身險：
 *    KINDS 是「成員 × 人身險種」的骨架，保障準備度、全家保障地圖、五欄表全部吃它，
 *    把產險塞進去等於在每一張人身險的表上多出不相干的列。
 * ⚠️⚠️ 缺口也刻意不併進 gapTotals() / health().riskCover ——
 *    與 Ray 2026/08/29「三種給付單位不相加」是同一條原則。
 *
 * 查證的數字與出處：
 *   ・住宅地震基本保險：保額 150 萬／戶、臨時住宿費用 20 萬（法定；財團法人住宅地震保險基金）
 *   ・強制汽車責任保險：死亡／失能 300 萬（金管會，115.07.01 生效，原 200 萬）、傷害醫療 20 萬
 *   ・勞基法 §59：職災死亡 ＝ 喪葬費 5 個月 ＋ 死亡補償 40 個月 ＝ 45 個月平均工資
 *   ・公共意外責任常見基準：每人 300 萬／每一事故 1,500 萬／財損 200 萬／期間總額 3,400 萬
 *   ・建物每坪重置造價：產險公會「臺灣地區住宅類建築造價參考表」約 4.3～13.2 萬元/坪（估算）
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function base(): any {
  const c = E.newCase();
  c.profile.age = 40;
  c.assets = [];
  c.policies = [];
  c.companies = [];
  c.propNeed = {};
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function row(c: any, kind: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return E.propGaps(c).find((r: any) => r.kind === kind);
}
const realty = (value: number, name = "自住房", type = "自住不動產") => ({
  name, owner: "本人", mainCat: "自用資產", type, cls: "固定",
  currency: "台幣", fxRate: 1, cost: value, value, ret: 0, income: 0, movable: false,
});
const car = (value: number, name = "自用車") => ({
  name, owner: "本人", mainCat: "自用資產", type: "自用車輛", cls: "固定",
  currency: "台幣", fxRate: 1, cost: value, value, ret: 0, income: 0, movable: false,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pol = (subtype: string, f: Record<string, number>): any =>
  ({ insured: "本人", name: subtype, bigCat: "產物", subtype, status: "有效", premium: 5000, ...f });

describe("骨幹：產險是另一條線，不是 KINDS 的一部分", () => {
  it("PKINDS 與 KINDS 完全不交集", () => {
    for (const k of E.PKINDS) expect(E.KINDS).not.toContain(k);
  });
  it("Ray 拍板的四項就是四個分組，七列全部歸得進去", () => {
    expect(E.PGROUPS).toEqual(["住宅火險＋地震險", "第三人責任險（車）", "車體險", "雇主／公共意外責任"]);
    for (const k of E.PKINDS) expect(E.PGROUPS).toContain(E.PKIND_GROUP[k]);
  });
  it("每一列都指得到保單端的欄位與需求端的覆寫欄位（不留孤兒）", () => {
    for (const k of E.PKINDS) {
      expect(E.PPOLICY_MAP[k]).toBeTruthy();
      expect(E.PPOLICY_MAP[k].subs.length).toBeGreaterThan(0);
      expect(E.PNEED_FIELD[k]).toBeTruthy();
    }
  });
  it("保單險種細分對得回比對列（保單卡上要告訴教練這張保單算在哪一列）", () => {
    expect(E.propKindsOfSub("住宅火險")).toEqual(["住宅火險"]);
    expect(E.propKindsOfSub("汽車第三人責任")).toEqual([
      "汽車第三人責任（體傷·每人）", "汽車第三人責任（財損·每次事故）",
    ]);
    expect(E.propKindsOfSub("旅平險")).toEqual([]);
  });
});

describe("① 住宅火險＋地震險：需求端從資產表的不動產自動帶", () => {
  it("填了建坪 → 建坪 × 每坪重置單價（預設 70,000）", () => {
    const c = base();
    c.assets = [realty(15_000_000)];
    c.propNeed = { ping: 40 };
    const r = row(c, "住宅火險");
    expect(r.need).toBe(40 * BZ.PROP_PING_COST);
    expect(r.auto).toBe(true);
    expect(r.src).toContain("建坪");
  });

  it("每坪單價可覆寫（造價表 4.3～13.2 萬/坪，系統預設值是估算）", () => {
    const c = base();
    c.assets = [realty(15_000_000)];
    c.propNeed = { ping: 30, pingPrice: 108_000 };
    expect(row(c, "住宅火險").need).toBe(30 * 108_000);
  });

  it("沒填建坪 → 由市價 × 建物佔比粗估，並在 src 說清楚那是粗估", () => {
    const c = base();
    c.assets = [realty(15_000_000)];
    const r = row(c, "住宅火險");
    expect(r.need).toBe(Math.round(15_000_000 * BZ.PROP_BUILDING_RATIO));
    expect(r.src).toContain("粗估");
  });

  it("⚠️⚠️ 重置成本不含土地：資產表的「土地」與「車位」不進火險需求", () => {
    const c = base();
    c.assets = [
      realty(10_000_000),
      { ...realty(20_000_000, "祖產土地", "土地"), mainCat: "可投資資產" },
      { ...realty(2_000_000, "地下車位", "車位"), mainCat: "可投資資產" },
    ];
    expect(E.propRealty(c).length).toBe(1);
    expect(E.propRealtyValue(c)).toBe(10_000_000);
    expect(row(c, "住宅火險").need).toBe(Math.round(10_000_000 * BZ.PROP_BUILDING_RATIO));
  });

  it("自動值可被教練覆寫，覆寫後不再標「估算」", () => {
    const c = base();
    c.assets = [realty(15_000_000)];
    c.propNeed = { fire: 6_000_000 };
    const r = row(c, "住宅火險");
    expect(r.need).toBe(6_000_000);
    expect(r.auto).toBe(false);
    expect(r.src).toBe("教練手動指定");
  });

  it("地震險是【法定定額】150 萬／戶（不是建議值），臨時住宿費 20 萬另計", () => {
    const c = base();
    c.assets = [realty(15_000_000), realty(8_000_000, "出租套房", "出租不動產")];
    expect(BZ.QUAKE_BASIC_SUM).toBe(1_500_000);
    expect(BZ.QUAKE_LODGING).toBe(200_000);
    const r = row(c, "住宅地震基本保險");
    expect(r.need).toBe(2 * BZ.QUAKE_BASIC_SUM);
    expect(r.src).toContain("法定基本保額");
  });

  it("沒有不動產 → 火險與地震險需求都是 0（不憑空生需求）", () => {
    const c = base();
    expect(row(c, "住宅火險").need).toBe(0);
    expect(row(c, "住宅地震基本保險").need).toBe(0);
  });

  it("已備：住宅火險／居家綜合的 pAmount 進「已備」，地震險走自己那一列", () => {
    const c = base();
    c.assets = [realty(15_000_000)];
    c.policies = [pol("住宅火險", { pAmount: 3_000_000 }), pol("地震險", { pAmount: 1_500_000 })];
    expect(row(c, "住宅火險").have).toBe(3_000_000);
    expect(row(c, "住宅地震基本保險").have).toBe(1_500_000);
    expect(row(c, "住宅地震基本保險").gap).toBe(0);
  });
});

describe("② 第三人責任險（車）：體傷／財損兩個獨立限額", () => {
  it("有車 → 帶出體傷每人與財損每次事故的建議級距", () => {
    const c = base();
    c.assets = [car(600_000)];
    expect(row(c, "汽車第三人責任（體傷·每人）").need).toBe(BZ.CAR_LIAB_BODILY);
    expect(row(c, "汽車第三人責任（財損·每次事故）").need).toBe(BZ.CAR_LIAB_PROPERTY);
  });

  it("體傷那一列的說明要點出強制險的上限（超過的部分才靠任意險）", () => {
    const c = base();
    c.assets = [car(600_000)];
    expect(BZ.CALI_DEATH).toBe(3_000_000);
    expect(BZ.CALI_MEDICAL).toBe(200_000);
    expect(row(c, "汽車第三人責任（體傷·每人）").src).toContain("強制險");
  });

  it("已備：pBodily 與 pProperty 分開讀，不會互相污染", () => {
    const c = base();
    c.assets = [car(600_000)];
    c.policies = [pol("汽車第三人責任", { pBodily: 2_000_000, pProperty: 300_000 })];
    expect(row(c, "汽車第三人責任（體傷·每人）").have).toBe(2_000_000);
    expect(row(c, "汽車第三人責任（財損·每次事故）").have).toBe(300_000);
    expect(row(c, "汽車第三人責任（體傷·每人）").gap).toBe(BZ.CAR_LIAB_BODILY - 2_000_000);
  });

  it("機車第三人也算進同兩列", () => {
    const c = base();
    c.assets = [car(80_000, "機車")];
    c.policies = [pol("機車第三人", { pBodily: 1_000_000, pProperty: 100_000 })];
    expect(row(c, "汽車第三人責任（體傷·每人）").have).toBe(1_000_000);
  });

  it("沒車 → 需求 0", () => {
    const c = base();
    expect(row(c, "汽車第三人責任（體傷·每人）").need).toBe(0);
    expect(row(c, "汽車第三人責任（財損·每次事故）").need).toBe(0);
  });
});

describe("③ 車體險：需求＝車輛資產現值", () => {
  it("從資產表的車輛自動帶現值（含匯率，走 aVal）", () => {
    const c = base();
    c.assets = [car(600_000), { ...car(20_000, "美國車"), currency: "美金", fxRate: 32 }];
    expect(row(c, "車體損失險").need).toBe(600_000 + 20_000 * 32);
  });
  it("車位不算車（名稱含「車」但不是車輛）", () => {
    const c = base();
    c.assets = [{ ...realty(2_000_000, "地下車位", "車位"), mainCat: "可投資資產" }];
    expect(E.propVehicles(c).length).toBe(0);
    expect(row(c, "車體損失險").need).toBe(0);
  });
  it("已備讀 汽車車體 的 pAmount", () => {
    const c = base();
    c.assets = [car(600_000)];
    c.policies = [pol("汽車車體", { pAmount: 500_000 })];
    const r = row(c, "車體損失險");
    expect(r.have).toBe(500_000);
    expect(r.gap).toBe(100_000);
  });
});

describe("④ 雇主責任／公共意外：接既有的企業模組（c.companies[]）", () => {
  it("雇主責任＝平均月薪 × 45 個月（勞基法 §59：死亡補償 40 ＋ 喪葬費 5）", () => {
    const c = base();
    c.companies = [{ cid: "co1", name: "甲公司", employees: 8 }];
    c.propNeed = { avgWage: 50_000 };
    expect(BZ.EMPLOYER_COMP_MONTHS).toBe(45);
    const r = row(c, "雇主責任（每人）");
    expect(r.need).toBe(50_000 * 45);
    expect(r.src).toContain("勞基法");
  });

  it("沒填平均月薪 → 退回基本工資（＝健保分級表第 1 級），並標成估算", () => {
    const c = base();
    c.companies = [{ cid: "co1", name: "甲公司", employees: 3 }];
    expect(E.propAvgWage(c)).toBe(E.NHI_SALARY_MIN);
    expect(row(c, "雇主責任（每人）").need).toBe(E.NHI_SALARY_MIN * 45);
    expect(row(c, "雇主責任（每人）").auto).toBe(true);
  });

  it("員工數：優先看 propNeed 覆寫，否則加總 c.companies[].employees", () => {
    const c = base();
    c.companies = [{ cid: "a", employees: 4 }, { cid: "b", employees: 6 }];
    expect(E.propEmployees(c)).toBe(10);
    c.propNeed = { employees: 25 };
    expect(E.propEmployees(c)).toBe(25);
  });

  it("公共意外＝多數縣市自治條例的最低基準（每一事故體傷 1,500 萬）", () => {
    const c = base();
    c.companies = [{ cid: "co1", employees: 5 }];
    expect(BZ.PUBLIC_LIAB_STD).toEqual([3_000_000, 15_000_000, 2_000_000, 34_000_000]);
    expect(row(c, "公共意外責任（每一事故體傷）").need).toBe(BZ.PUBLIC_LIAB_STD[1]);
  });

  it("沒有公司也沒有員工數 → 兩列需求都是 0（一般受薪家庭不會被硬塞企業責任）", () => {
    const c = base();
    expect(row(c, "雇主責任（每人）").need).toBe(0);
    expect(row(c, "公共意外責任（每一事故體傷）").need).toBe(0);
  });

  it("已備讀 雇主責任／公共意外 的 pBodily", () => {
    const c = base();
    c.companies = [{ cid: "co1", employees: 5 }];
    c.policies = [pol("雇主責任", { pBodily: 2_000_000 }), pol("公共意外", { pBodily: 10_000_000 })];
    expect(row(c, "雇主責任（每人）").have).toBe(2_000_000);
    expect(row(c, "公共意外責任（每一事故體傷）").have).toBe(10_000_000);
  });
});

describe("已備的一般規則", () => {
  it("只算「產物」大類的有效保單（失效／停效的不算）", () => {
    const c = base();
    c.assets = [realty(10_000_000)];
    c.policies = [
      pol("住宅火險", { pAmount: 3_000_000 }),
      { ...pol("住宅火險", { pAmount: 9_000_000 }), status: "失效" },
    ];
    expect(row(c, "住宅火險").have).toBe(3_000_000);
  });

  it("人身大類的保單即使 subtype 撞名也不會被算進來", () => {
    const c = base();
    c.assets = [realty(10_000_000)];
    c.policies = [{ ...pol("住宅火險", { pAmount: 9_000_000 }), bigCat: "人身" }];
    expect(row(c, "住宅火險").have).toBe(0);
  });
});

describe("⚠️⚠️ 缺口獨立：不進 gapTotals()／health().riskCover／人身險任何一張表", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function loaded(): any {
    const c = E.sampleCase();
    c.propNeed = { ping: 50 };
    c.companies = [{ cid: "co1", employees: 10 }];
    c.assets.push(car(800_000));
    return c;
  }

  it("產險需求／保單存在，人身缺口三堆與健康度一位不動", () => {
    const c = loaded();
    const before = {
      gap: E.gapTotals(c), base: E.gapNeedBase(c),
      grade: E.health(c).grade, safety: E.health(c).safety,
      riskCover: E.health(c).raw.riskCover,
    };
    c.policies.push(
      pol("住宅火險", { pAmount: 4_000_000 }),
      pol("汽車第三人責任", { pBodily: 2_000_000, pProperty: 300_000 }),
      pol("雇主責任", { pBodily: 1_500_000 }),
    );
    expect(E.propGapTotals(c).rows).toBeGreaterThan(0);
    expect(E.gapTotals(c)).toEqual(before.gap);
    expect(E.gapNeedBase(c)).toEqual(before.base);
    expect(E.health(c).grade).toBe(before.grade);
    expect(E.health(c).safety).toBe(before.safety);
    expect(E.health(c).raw.riskCover).toBe(before.riskCover);
  });

  it("產險完全沒保（缺口最大）也不會把財務安全度拉低——它不在那個分數裡", () => {
    const a = loaded(), b = loaded();
    b.policies = b.policies.filter(() => true);
    a.policies.push(pol("住宅火險", { pAmount: 99_000_000 }));
    expect(E.health(a).safety).toBe(E.health(b).safety);
  });

  it("coverageGaps() 的險種只有人身的 KINDS，不會冒出產險列", () => {
    const c = loaded();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kinds = [...new Set(E.coverageGaps(c).map((g: any) => g.kind))];
    for (const k of kinds) expect(E.PKINDS).not.toContain(k);
  });

  it("propGapTotals()：缺口只加正的，需求／已備都是 0 的列整列不計", () => {
    const c = base();
    c.assets = [realty(10_000_000)];
    const t = E.propGapTotals(c);
    expect(t.rows).toBe(2);                      // 只有火險與地震險有需求
    expect(t.gap).toBeGreaterThan(0);
    c.policies = [pol("住宅火險", { pAmount: 999_000_000 })];
    expect(E.propGapTotals(c).gap).toBe(BZ.QUAKE_BASIC_SUM);   // 超額的火險不會抵掉地震險的缺口
  });

  it("全空的新客戶：一列都不出現（報告書那一段整段不印）", () => {
    expect(E.propGapTotals(base()).rows).toBe(0);
  });
});
