import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

/**
 * 退休期三段式金流。
 *
 * 改版前的錯：生活費列跑到 85 歲，`retire.monthLiving` 又從退休年齡起疊一次
 * → 退休後的生活費被算兩次，一生名目總支出高估約 18%，願景達成率被壓低。
 *
 * 改版後：家庭的生活/消費支出依「已退休賺薪成員的支出比例權重 w」從工作期換到退休期。
 * 本人先退、配偶後退 → 真的跑出三段，而不是某一天整批切換。
 * 這一支守住三件事：三段權重算得對、既有客戶（沒填新欄位）行為不變、雙重計算真的沒了。
 */

function couple() {
  const c = E.newCase();
  c.profile.age = 40;
  c.profile.retireAge = 65;
  c.profile.lifeExp = 85;
  c.params.horizon = 85;
  c.members = [
    { name: "本人", role: "本人", gender: "男", age: 40, depRatio: 100, expRatio: 40, indepAge: "" },
    { name: "配偶", role: "配偶", gender: "女", age: 38, retireAge: 60, depRatio: 0, expRatio: 30, indepAge: "" },
  ];
  c.expenses = [
    { name: "生活費", cat: "生活", amount: 600_000, infl: false, start: 40, end: 85, cut: 0 },
    { name: "保險費", cat: "保險", amount: 120_000, infl: false, start: 40, end: 85, cut: 0 },
  ];
  c.retire = { monthLiving: 50_000, retireReturn: 4, retireInflation: 1.5, prepared: [] };
  c.params.inflation = 0; // 測試專用：把通膨關掉，數字才好對
  return c;
}

describe("退休時點換算成本人年齡", () => {
  it("配偶 38 歲、60 歲退休 → 本人 62 歲那年發生", () => {
    const pts = E.earnerRetirePoints(couple());
    const self = pts.find((p: { primary: boolean }) => p.primary);
    const spouse = pts.find((p: { primary: boolean }) => !p.primary);
    expect(self.at).toBe(65);
    expect(spouse.at).toBe(62); // 40 + (60 − 38)
    expect(spouse.share).toBe(30);
  });

  it("只有賺薪成員（本人／配偶）算進來，子女不算", () => {
    const c = couple();
    c.members.push({ name: "小孩", role: "子女", age: 8, expRatio: 15, indepAge: 26 });
    expect(E.earnerRetirePoints(c)).toHaveLength(2);
  });

  it("沒填退休年齡的成員不產生切換點", () => {
    const c = couple();
    delete c.members[1].retireAge;
    expect(E.earnerRetirePoints(c)).toHaveLength(1);
  });
});

describe("三段權重 w", () => {
  it("配偶先退（本人 62）→ 本人 65 退 → 三段 0% / 42.9% / 100%", () => {
    const c = couple();
    expect(E.retiredWeight(c, 50)).toBe(0);
    expect(E.retiredWeight(c, 62)).toBe(0);                    // 當年還沒退
    expect(E.retiredWeight(c, 63)).toBeCloseTo(30 / 70, 6);    // 配偶已退
    expect(E.retiredWeight(c, 65)).toBeCloseTo(30 / 70, 6);
    expect(E.retiredWeight(c, 66)).toBe(1);                    // 兩人都退
    expect(E.retiredWeight(c, 85)).toBe(1);
  });

  it("降級一：配偶沒填退休年齡 → 只剩本人一個切換點，0→1", () => {
    const c = couple();
    delete c.members[1].retireAge;
    expect(E.retiredWeight(c, 65)).toBe(0);
    expect(E.retiredWeight(c, 66)).toBe(1);
  });

  it("降級二：支出比例% 全空 → 退回「本人退休即全面切換」，不會除以零", () => {
    const c = couple();
    c.members.forEach((m: { expRatio: number }) => (m.expRatio = 0));
    expect(E.retiredWeight(c, 64)).toBe(0);
    expect(E.retiredWeight(c, 66)).toBe(1);
    expect(Number.isNaN(E.retiredWeight(c, 66))).toBe(false);
  });

  it("單薪家庭：自然就是兩段", () => {
    const c = couple();
    c.members = [c.members[0]];
    expect(E.retiredWeight(c, 65)).toBe(0);
    expect(E.retiredWeight(c, 66)).toBe(1);
  });
});

describe("工作期支出：只有生活＋消費會依權重縮減", () => {
  it("w=0 全額、w=1 只剩非生活類、混合期按比例", () => {
    const c = couple();
    expect(E.workPhaseExpense(c, 50, 1, 0)).toBe(720_000);           // 60萬生活 + 12萬保險
    expect(E.workPhaseExpense(c, 70, 1, 1)).toBe(120_000);           // 生活歸零，保險照跑
    expect(E.workPhaseExpense(c, 63, 1, 30 / 70)).toBeCloseTo(600_000 * (1 - 30 / 70) + 120_000, 6);
  });

  it("消費類跟生活類一起切換（Ray 選的是這兩類）", () => {
    const c = couple();
    c.expenses = [{ name: "旅遊", cat: "消費", amount: 100_000, infl: false, start: 40, end: 85, cut: 0 }];
    expect(E.workPhaseExpense(c, 70, 1, 1)).toBe(0);
  });

  it("孝親／稅賦／貸款不受退休影響，照自己的起訖歲跑", () => {
    const c = couple();
    c.expenses = [
      { name: "孝親金", cat: "孝親", amount: 240_000, infl: false, start: 40, end: 70, cut: 0 },
      { name: "所得稅", cat: "稅賦", amount: 80_000, infl: false, start: 40, end: 85, cut: 0 },
    ];
    expect(E.workPhaseExpense(c, 68, 1, 1)).toBe(320_000);
    expect(E.workPhaseExpense(c, 75, 1, 1)).toBe(80_000); // 孝親已到訖歲
  });
});

describe("退休期支出明細表", () => {
  it("逐列起訖歲：照護費 80 歲後才上來、旅遊只到 75", () => {
    const c = couple();
    c.retireExpenses = [
      { name: "生活", cat: "生活", amount: 400_000, infl: false, startAge: "", endAge: "" },
      { name: "旅遊", cat: "消費", amount: 200_000, infl: false, startAge: 65, endAge: 75 },
      { name: "照護", cat: "生活", amount: 300_000, infl: false, startAge: 80, endAge: "" },
    ];
    expect(E.retireAnnual(c, 70, 1)).toBe(600_000);   // 生活 + 旅遊
    expect(E.retireAnnual(c, 78, 1)).toBe(400_000);   // 旅遊已結束
    expect(E.retireAnnual(c, 82, 1)).toBe(700_000);   // 照護上來
  });

  it("起歲留空＝從本人退休那年起；訖歲留空＝到預估壽命", () => {
    const c = couple();
    c.retireExpenses = [{ name: "生活", cat: "生活", amount: 400_000, infl: false, startAge: "", endAge: "" }];
    expect(E.retireAnnual(c, 64, 1)).toBe(0);
    expect(E.retireAnnual(c, 65, 1)).toBe(400_000);
    expect(E.retireAnnual(c, 85, 1)).toBe(400_000);
    expect(E.retireAnnual(c, 86, 1)).toBe(0);
  });

  it("明細表空著就退回舊的 monthLiving×12（既有客戶不受影響）", () => {
    const c = couple();
    c.retireExpenses = [];
    expect(E.retireAnnual(c, 70, 1)).toBe(50_000 * 12);
  });
});

describe("雙重計算真的沒了", () => {
  it("全退休那年：生活費只算一次（退休期的），不是工作期＋退休期相加", () => {
    const c = couple();
    c.retireExpenses = [{ name: "退休生活", cat: "生活", amount: 400_000, infl: false, startAge: "", endAge: "" }];
    const rows = E.metrics(c).proj.rows;
    const r70 = rows.find((r: { age: number }) => r.age === 70);
    // expense 欄＝工作期側(保險 12 萬) + 教育 0 + 退休期 40 萬
    expect(Math.round(r70.expense)).toBe(520_000);
    // 改版前這一年會是 60萬(生活列還在跑) + 12萬 + 60萬(monthLiving) = 132 萬
    expect(Math.round(r70.expense)).toBeLessThan(1_320_000);
  });

  it("混合期：生活費介於工作期與退休期之間", () => {
    const c = couple();
    c.retireExpenses = [{ name: "退休生活", cat: "生活", amount: 400_000, infl: false, startAge: 62, endAge: "" }];
    const rows = E.metrics(c).proj.rows;
    const r63 = rows.find((r: { age: number }) => r.age === 63);
    const w = 30 / 70;
    expect(Math.round(r63.expense)).toBe(Math.round(600_000 * (1 - w) + 120_000 + 400_000 * w));
  });

  it("一生名目總支出因此下降（示範案）", () => {
    const c = E.sampleCase();
    const noRetireList = JSON.parse(JSON.stringify(c));
    noRetireList.retireExpenses = [];
    // 兩種填法都不該回到「生活費算兩次」的量級
    expect(E.metrics(c).proj.totalOutflow).toBeLessThan(133_000_000);
    expect(E.metrics(noRetireList).proj.totalOutflow).toBeLessThan(133_000_000);
  });
});

describe("退休需求試算", () => {
  it("沒填明細表時，總需求與改版前的封閉式年金公式完全一致（回歸保護）", () => {
    const c = E.sampleCase();
    c.retireExpenses = [];
    const r = c.retire, infl = E.n(c.params.inflation) / 100, g = E.n(r.retireInflation) / 100, rr = E.n(r.retireReturn) / 100;
    const years = E.n(c.profile.retireAge) - E.n(c.profile.age), m = E.n(c.profile.lifeExp) - E.n(c.profile.retireAge);
    const annualFV = E.n(r.monthLiving) * 12 * Math.pow(1 + infl, years);
    const expected = annualFV * (1 - Math.pow((1 + g) / (1 + rr), m)) / (rr - g);
    expect(E.retireNeed(c).total).toBeCloseTo(expected, 4);
  });

  it("有明細表時改吃明細表，且吃得到後段才啟動的項目（年金公式吃不到）", () => {
    const c = couple();
    c.params.inflation = 0;
    c.retire.retireInflation = 0;
    c.retire.retireReturn = 0;
    c.retireExpenses = [{ name: "照護", cat: "生活", amount: 300_000, infl: false, startAge: 80, endAge: "" }];
    // 80~85 共 6 年 × 30 萬，折現率 0 → 180 萬
    expect(E.retireNeed(c).total).toBeCloseTo(1_800_000, 0);
  });

  it("明細表逐年折現：金額固定時與封閉式等價", () => {
    const c = couple();
    // infl:true 才會跟著「退休後通膨」成長，對上封閉式的成長型年金
    c.retireExpenses = [{ name: "生活", cat: "生活", amount: 600_000, infl: true, startAge: "", endAge: "" }];
    const flat = E.retireNeed(c).total;
    const c2 = couple();
    c2.retire.monthLiving = 50_000; // 60 萬/年
    c2.retireExpenses = [];
    expect(flat).toBeCloseTo(E.retireNeed(c2).total, 4);
  });
});

describe("延後退休情境", () => {
  it("retireDelay 會同時推本人與配偶的退休年齡", () => {
    const c = couple();
    c.plan = { retireDelay: 5, movableToOverseas: 0, allocations: [] };
    const s = E.scenario(c);
    expect(s.afterCase.profile.retireAge).toBe(70);
    expect(s.afterCase.members[1].retireAge).toBe(65);
  });
});
