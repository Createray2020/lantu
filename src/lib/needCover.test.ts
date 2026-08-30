import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 壽險需求裡的「清償負債」與「準備教育金」該不該算給這個人（2026/08/30 Ray 拍板）。
 *
 * 改版前 grossLifeNeed() 把全部負債餘額與全部教育金加進**每一位**被保人的需求，
 * 不分他有沒有在賺錢——3 歲的孩子會被算出一千四百萬的壽險缺口，
 * 而教練得當著客戶的面解釋那個數字。
 *
 * 判定順序：手動勾選（payDebt／fundEdu）> 角色（本人／配偶要，其餘不要）。
 * 找不到那位成員時一律回 true，維持改版前的行為——一個字打錯就把整筆需求靜默歸零，
 * 比「算多了」難發現得多。
 */

const NEED = {
  funeral: 500_000, protectYears: 20, estateTax: 0,
  room: 2000, selfPay: 1500, nursing: 1500, miscDaily: 3000,
  incomeCompDay: 0, incomeCompMonth: 0, disability: 0,
  firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0, careMonths: 0,
};

function family() {
  const c = E.sampleCase();
  c.members = [
    { name: "阿爸", role: "本人", gender: "男", age: 40, worked: 15, insType: "勞保", insSalary: 45800, depRatio: 100, expRatio: 40, indepAge: "" },
    { name: "阿母", role: "配偶", gender: "女", age: 38, worked: 12, insType: "勞保", insSalary: 40100, depRatio: 0, expRatio: 30, indepAge: "" },
    { name: "小孩", role: "子女", gender: "男", age: 3, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 15, indepAge: 24 },
    { name: "阿嬤", role: "父母", gender: "女", age: 70, worked: 0, insType: "健保眷屬", insSalary: 0, depRatio: 0, expRatio: 15, indepAge: "" },
  ];
  c.needs = [
    { member: "阿爸", ...NEED },
    { member: "阿母", ...NEED },
    { member: "小孩", ...NEED },
    { member: "阿嬤", ...NEED },
  ];
  return c;
}

const debtAndEdu = (c: unknown) =>
  E.sum((c as { liabilities: unknown[] }).liabilities, (l: unknown) => E.lBal(l)) + E.eduTotal(c);

describe("依角色判定（沒有手動勾選時）", () => {
  const c = family();

  it("本人與配偶：負債與教育金都算進去", () => {
    expect(E.needCoversDebt(c, c.needs[0])).toBe(true);
    expect(E.needCoversEdu(c, c.needs[0])).toBe(true);
    expect(E.needCoversDebt(c, c.needs[1])).toBe(true);
    expect(E.needCoversEdu(c, c.needs[1])).toBe(true);
  });

  it("子女與父母：兩項都不算——他們走了，家庭收入沒有減少", () => {
    for (const nd of [c.needs[2], c.needs[3]]) {
      expect(E.needCoversDebt(c, nd)).toBe(false);
      expect(E.needCoversEdu(c, nd)).toBe(false);
    }
  });

  it("孩子的壽險毛需求裡不再有房貸與學費", () => {
    const kid = E.grossLifeNeed(c, c.needs[2]);
    // 剩下的是「喪葬 ＋ 父母奉養 × 保障年數」——負債與教育金整段消失。
    const parents = E.familyAnnualParentSupport(c) * NEED.protectYears;
    expect(kid).toBeCloseTo(NEED.funeral + parents, 6);
    // 改版前那一段是「＋ 全部負債 ＋ 全部教育金」，規模就是這個
    expect(debtAndEdu(c)).toBeGreaterThan(10_000_000);
  });

  it("保障年數填 0 的孩子（正常填法）→ 需求就只剩喪葬費", () => {
    const c2 = family();
    c2.needs[2].protectYears = 0;
    expect(E.grossLifeNeed(c2, c2.needs[2])).toBe(NEED.funeral);
  });

  it("本人的需求一位不動——這次改動不准動到經濟支柱的數字", () => {
    const c2 = family();
    const dad = E.grossLifeNeed(c2, c2.needs[0]);
    expect(dad).toBeGreaterThan(debtAndEdu(c2));
  });
});

describe("手動勾選蓋過角色", () => {
  it("成年子女是主要經濟來源：勾了就算進去", () => {
    const c = family();
    c.needs[2].payDebt = true;
    c.needs[2].fundEdu = true;
    expect(E.needCoversDebt(c, c.needs[2])).toBe(true);
    const parents = E.familyAnnualParentSupport(c) * NEED.protectYears;
    expect(E.grossLifeNeed(c, c.needs[2])).toBeCloseTo(NEED.funeral + parents + debtAndEdu(c), 6);
  });

  it("本人也可以關掉（例如房貸有房貸壽險已經涵蓋）", () => {
    const c = family();
    c.needs[0].payDebt = false;
    expect(E.needCoversDebt(c, c.needs[0])).toBe(false);
    expect(E.needCoversEdu(c, c.needs[0])).toBe(true);   // 只關一項，另一項不受影響
  });

  it("兩個開關互不干擾", () => {
    const c = family();
    c.needs[2].fundEdu = true;                            // 只備教育金、不清償負債
    expect(E.needCoversDebt(c, c.needs[2])).toBe(false);
    expect(E.needCoversEdu(c, c.needs[2])).toBe(true);
    const parents = E.familyAnnualParentSupport(c) * NEED.protectYears;
    expect(E.grossLifeNeed(c, c.needs[2])).toBeCloseTo(NEED.funeral + parents + E.eduTotal(c), 6);
  });
});

describe("找不到成員時維持改版前的行為", () => {
  it.each([["打錯字", "小孩子"], ["空白", ""], ["沒填", undefined]])(
    "%s → 兩項都算（寧可算多，也不要一個字打錯就靜默歸零）",
    (_label, name) => {
      const c = family();
      const nd = { ...NEED, member: name };
      expect(E.needCoversDebt(c, nd)).toBe(true);
      expect(E.needCoversEdu(c, nd)).toBe(true);
    },
  );

  it("成員沒有 role 欄位（舊資料）→ 不是本人／配偶，兩項都不算", () => {
    const c = family();
    delete c.members[2].role;
    expect(E.needCoversDebt(c, c.needs[2])).toBe(false);
  });
});

describe("下游：缺口、五欄表、風險保全都跟著變", () => {
  it("孩子的壽險缺口不再是天文數字", () => {
    const c = family();
    const kidGap = E.coverageGaps(c).find(
      (g: { member: string; kind: string }) => g.member === "小孩" && g.kind === "壽險",
    );
    expect(kidGap.need).toBeCloseTo(E.grossLifeNeed(c, c.needs[2]), 6);
    expect(kidGap.need).toBeLessThan(6_000_000);   // 改版前是 1,700 萬以上
  });

  it("保單檢查五欄表的壽險需求＝四位成員的 grossLifeNeed 合計（毛對毛）", () => {
    const c = family();
    const life = E.coverageCheckupRows(c).find((r: { item: string }) => r.item === "壽險");
    const sum = c.needs.reduce((s: number, nd: unknown) => s + E.grossLifeNeed(c, nd), 0);
    expect(life.need).toBeCloseTo(sum, 6);
  });
});

describe("雙實作對拍：engine.ts ↔ lantu-app.html", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  beforeAll(async () => {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  });

  it("needCoversDebt / needCoversEdu / grossLifeNeed 兩邊逐字一致", () => {
    expect(HTML).toContain("function needCoversDebt(c,nd){");
    expect(HTML).toContain("function needCoversEdu(c,nd){");
    expect(HTML).toContain(" if(typeof (nd&&nd.payDebt)==='boolean')return nd.payDebt;");
    expect(HTML).toContain("  +(needCoversEdu(c,nd)?eduTotal(c):0)+n(nd.funeral)+n(nd.estateTax)");
  });

  it.each([0, 1, 2, 3])("第 %i 位被保人：兩邊的毛需求相同", (i) => {
    const c = family();
    expect(w.grossLifeNeed(JSON.parse(JSON.stringify(c)), c.needs[i]))
      .toBeCloseTo(E.grossLifeNeed(c, c.needs[i]), 6);
  });

  it("手動勾選之後兩邊也一樣", () => {
    const c = family();
    c.needs[2].payDebt = true;
    c.needs[0].fundEdu = false;
    for (const i of [0, 2]) {
      expect(w.grossLifeNeed(JSON.parse(JSON.stringify(c)), c.needs[i]))
        .toBeCloseTo(E.grossLifeNeed(c, c.needs[i]), 6);
    }
  });

  it("需求卡的『自動帶入的責任』與明細框都跟著開關走（不然表上寫 920 萬、需求裡沒有它）", () => {
    expect(HTML).toContain(" var coversDebt=needCoversDebt(c,nd),coversEdu=needCoversEdu(c,nd);");
    expect(HTML).toContain("(coversDebt?'負債表餘額合計':offWhy)");
    expect(HTML).toContain(" var liabN=needCoversDebt(c,nd)?liab:0,eduN=needCoversEdu(c,nd)?edu:0;");
  });
});
