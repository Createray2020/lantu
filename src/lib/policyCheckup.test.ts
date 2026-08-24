import { describe, it, expect } from "vitest";
import * as E from "./engine";

/**
 * 保單檢查報告（2026/08/24）。
 *
 * 這一輪把 insure80 的五欄比對表（項目｜HAVE｜NEED｜狀況｜調整方向）搬進嵐途。
 * 這支測試釘住的是**語意**，不是版面：
 *   ・「狀況」只有三值，而且判定帶是可治理的參數（不是散在畫面裡的 magic number）
 *   ・保費類型的推導（保障歸保障、理財歸理財）
 *   ・coverageGaps() 的現況數字一位不能動——方案後只在傳第二個參數時才生效
 *   ・生效日與繳別推繳費月份（effDate 在這之前只是一個沒進過任何計算的字串）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Eng = E as any;

describe("checkupState：偏低／偏高／適中三值 ＋ 可調整的寬容帶", () => {
  it("預設 ±10%：差 7.5% 判適中，差 20% 就分邊", () => {
    expect(Eng.checkupState(111_000, 120_000)).toBe("mid");   // −7.5%
    expect(Eng.checkupState(96_000, 120_000)).toBe("low");    // −20%
    expect(Eng.checkupState(144_000, 120_000)).toBe("high");  // +20%
  });

  it("帶寬可以逐次覆寫；設 0 ＝ 只要不相等就分邊", () => {
    expect(Eng.checkupState(111_000, 120_000, 5)).toBe("low");
    expect(Eng.checkupState(120_001, 120_000, 0)).toBe("high");
    expect(Eng.checkupState(120_000, 120_000, 0)).toBe("mid");
  });

  it("需求為 0：有保額＝偏高（買了不需要的），沒保額＝適中（不必動）", () => {
    expect(Eng.checkupState(500_000, 0)).toBe("high");
    expect(Eng.checkupState(0, 0)).toBe("mid");
  });

  it("後台參數進得來（applyCheckupParams），空字串與非數字要被忽略", () => {
    Eng.applyCheckupParams({ CHECKUP_BAND: 25 });
    expect(Eng.checkupState(96_000, 120_000)).toBe("mid");    // −20% 落在 ±25% 內
    Eng.applyCheckupParams({ CHECKUP_BAND: "", TRIANGLE_RISK: null });
    expect(Eng.checkupState(96_000, 120_000)).toBe("mid");    // 沒被洗掉
    Eng.applyCheckupParams({ CHECKUP_BAND: 10 });             // 還原，別污染同檔其他測試
    expect(Eng.checkupState(96_000, 120_000)).toBe("low");
  });
});

describe("checkupRow：調整方向就是 |NEED−HAVE|，適中時一律 0", () => {
  it("偏低 → 可增加；偏高 → 可減少；適中 → 不須調整且 delta 為 0", () => {
    expect(Eng.checkupRow("人壽險保額", 4_064_000, 9_200_000)).toMatchObject({
      state: "low", label: "偏低", dir: "可增加", delta: 5_136_000, unit: "元",
    });
    expect(Eng.checkupRow("住院醫療險", 9_600, 3_000, "元/日")).toMatchObject({
      state: "high", label: "偏高", dir: "可減少", delta: 6_600, unit: "元/日",
    });
    expect(Eng.checkupRow("保障型保費", 111_000, 120_000)).toMatchObject({
      state: "mid", label: "適中", dir: "不須調整", delta: 0,
    });
  });
});

describe("保費類型：保障歸保障、理財歸理財", () => {
  it("沒填 premiumType 時由險種細分推，儲蓄/投資型/年金 → 理財型", () => {
    expect(Eng.premiumType({ subtype: "終身壽險" })).toBe("保障型");
    expect(Eng.premiumType({ subtype: "增額/儲蓄壽險" })).toBe("理財型");
    expect(Eng.premiumType({ subtype: "投資型壽險" })).toBe("理財型");
    expect(Eng.premiumType({ subtype: "年金" })).toBe("理財型");
  });

  it("教練填了就以填的為準（推導只是預設值）", () => {
    expect(Eng.premiumType({ subtype: "終身壽險", premiumType: "理財型" })).toBe("理財型");
  });

  it("失效/停效的保單不計入保費，也不計入給付明細", () => {
    expect(Eng.policyActive({ status: "有效" })).toBe(true);
    expect(Eng.policyActive({ status: "失效" })).toBe(false);
    expect(Eng.policyActive({ status: "停效" })).toBe(false);
    const c = Eng.sampleCase();
    c.policies = [
      { insured: "王大明(示範)", subtype: "終身壽險", premium: 100_000, status: "有效" },
      { insured: "王大明(示範)", subtype: "終身壽險", premium: 999_999, status: "失效" },
    ];
    expect(Eng.annualPremiumBy(c, "保障型")).toBe(100_000);
  });
});

describe("1 保費：理財金三角是 NEED 的來源", () => {
  it("保障型 NEED＝家庭年收入 ×10%、理財型 ×30%", () => {
    const c = Eng.sampleCase();
    const inc = Eng.crossTable(c).incTotal;
    const pm = Eng.premiumCheckup(c);
    expect(pm.income).toBe(inc);
    expect(pm.rows[0].item).toBe("保障型保費");
    expect(pm.rows[0].need).toBeCloseTo(inc * 0.1, 6);
    expect(pm.rows[1].item).toBe("理財型保費");
    expect(pm.rows[1].need).toBeCloseTo(inc * 0.3, 6);
  });
});

describe("insure 類動作的保額：五欄表與缺口表用同一套語意", () => {
  it("啟用中的保障動作一律計入「已備」（不接的話，排了保障反而看到缺口變大）", () => {
    const c = Eng.sampleCase();
    const before = Eng.coverageGaps(c).find((r: { kind: string }) => r.kind === "壽險").have;
    c.actions = [{ on: true, cat: "insure", coverKind: "壽險", cover: 5_000_000 }];
    const after = Eng.coverageGaps(c).find((r: { kind: string }) => r.kind === "壽險").have;
    expect(after).toBe(before + 5_000_000);
  });

  it("關掉的動作、別的類別、別的險種、別的被保人都不算", () => {
    const c = Eng.sampleCase();
    const pm = Eng.primaryMember(c).name;
    c.actions = [
      { on: false, cat: "insure", coverKind: "壽險", cover: 1_000_000 },
      { on: true, cat: "regular", coverKind: "壽險", cover: 1_000_000 },
      { on: true, cat: "insure", coverKind: "住院醫療", cover: 1_000 },
      { on: true, cat: "insure", coverKind: "壽險", cover: 7_000_000, member: "查無此人" },
    ];
    expect(Eng.actionCover(c, pm, "壽險")).toBe(0);
    expect(Eng.actionCover(c, pm, "住院醫療")).toBe(1_000);
  });

  it("動作沒指定成員時算在主要成員身上", () => {
    const c = Eng.sampleCase();
    const pm = Eng.primaryMember(c).name;
    c.actions = [{ on: true, cat: "insure", coverKind: "壽險", cover: 3_000_000 }];
    expect(Eng.actionCover(c, pm, "壽險")).toBe(3_000_000);
  });
});

describe("2 保障：把需求依險種跨成員加總後套五欄", () => {
  it("每一個 KINDS 都有一列，單位跟著險種走", () => {
    const c = Eng.sampleCase();
    const rows = Eng.coverageCheckupRows(c);
    const byItem = new Map<string, { unit: string }>(rows.map((r: { item: string; unit: string }) => [r.item, r]));
    expect(byItem.get("壽險")!.unit).toBe("元");
    expect(byItem.get("住院醫療")!.unit).toBe("元/日");
    expect(byItem.get("每月照護")!.unit).toBe("元/月");
  });

  /**
   * ⚠️⚠️ 這一條是這輪最容易再犯的錯，不要拿掉。
   * lifeNeed() 回的是「已扣掉已備與流動資產」的淨缺口；coverageGaps 的 have 卻是毛的已備。
   * 若五欄表直接用 coverageGaps 的 need，示範客戶的壽險會被判成
   * 「HAVE 1,448 萬 / NEED 324 萬 → 偏高，可減少 1,123 萬」——但他其實還差 324 萬。
   * 毛對毛才對得起來：NEED 走 grossLifeNeed，而「可增加」的金額要正好等於原本的淨缺口。
   */
  it("壽險一定是毛需求對毛已備，不能拿淨缺口去比", () => {
    const c = Eng.sampleCase();
    const life = Eng.coverageCheckupRows(c).find((r: { item: string }) => r.item === "壽險");
    const gapRow = Eng.coverageGaps(c).find((r: { kind: string }) => r.kind === "壽險");

    expect(life.state).toBe("low");                       // 示範客戶壽險是不足，不是過剩
    expect(life.need).toBeGreaterThan(life.have);
    // NEED（毛） − HAVE（毛） 必須等於原本 lifeNeed() 算出來的淨缺口
    expect(life.need - life.have).toBeCloseTo(gapRow.need, 6);
    expect(life.delta).toBeCloseTo(gapRow.need, 6);
    expect(life.dir).toBe("可增加");
  });

  it("insure 動作的保額進 HAVE，跟缺口表同一套語意（不能兩張表講不同的話）", () => {
    const c = Eng.sampleCase();
    const before = Eng.coverageCheckupRows(c).find((r: { item: string }) => r.item === "壽險").have;
    c.actions = [{ on: true, cat: "insure", coverKind: "壽險", cover: 4_000_000 }];
    const after = Eng.coverageCheckupRows(c).find((r: { item: string }) => r.item === "壽險").have;
    expect(after).toBe(before + 4_000_000);
    const gapHave = Eng.coverageGaps(c).find((r: { kind: string }) => r.kind === "壽險").have;
    expect(after).toBe(gapHave);
  });
});

describe("保費排程：生效日 ＋ 繳別（effDate 開始進計算）", () => {
  it("民國年三碼自動 +1911，西元年原樣", () => {
    expect(Eng.effYear({ effDate: "111/08/23" })).toBe(2022);
    expect(Eng.effYear({ effDate: "2022/08/23" })).toBe(2022);
    expect(Eng.effYear({ effDate: "" })).toBe(0);
    expect(Eng.effMonth({ effDate: "2022/08/23" })).toBe(8);
  });

  it("繳費月份依繳別平均分佈，起點是生效日的月份", () => {
    expect(Eng.premiumMonths({ effDate: "2022/08/23", payMode: "年繳" })).toEqual([8]);
    expect(Eng.premiumMonths({ effDate: "2022/08/23", payMode: "半年繳" })).toEqual([2, 8]);
    expect(Eng.premiumMonths({ effDate: "2022/08/23", payMode: "季繳" })).toEqual([2, 5, 8, 11]);
    expect(Eng.premiumMonths({ effDate: "2022/08/23", payMode: "月繳" }).length).toBe(12);
    expect(Eng.premiumMonths({ effDate: "", payMode: "月繳" })).toEqual([]);   // 沒生效日就推不出來
  });

  it("每期保費＝年繳化 ÷ 期數", () => {
    expect(Eng.premiumPerPay({ premium: 12_000, payMode: "月繳" })).toBe(1_000);
    expect(Eng.premiumPerPay({ premium: 12_000 })).toBe(12_000);
  });

  it("繳費年期留空＝視為仍在繳；填了就在期滿那年停", () => {
    const p = { effDate: "2020/06/10", payYears: 6, status: "有效", premium: 1 };
    expect(Eng.payingInYear(p, 2019)).toBe(false);
    expect(Eng.payingInYear(p, 2020)).toBe(true);
    expect(Eng.payingInYear(p, 2025)).toBe(true);
    expect(Eng.payingInYear(p, 2026)).toBe(false);
    expect(Eng.payingInYear({ ...p, payYears: "" }, 2099)).toBe(true);
    expect(Eng.payingInYear({ ...p, status: "失效" }, 2021)).toBe(false);
  });

  it("各年／各月／繳費人三張表對得起來", () => {
    const c = Eng.sampleCase();
    c.policies = [
      { insured: "A", owner: "甲", subtype: "終身壽險", premium: 120_000, payMode: "月繳", effDate: "2022/03/01", payYears: 20, status: "有效" },
      { insured: "B", owner: "甲", subtype: "年金", premium: 60_000, payMode: "半年繳", effDate: "2022/03/01", payYears: 6, status: "有效" },
    ];
    const y = Eng.premiumByYear(c, 2026, 2);
    expect(y[0]).toMatchObject({ year: 2026, total: 180_000, protect: 120_000, invest: 60_000 });
    const m = Eng.premiumByMonth(c, 2026);
    expect(m.reduce((s: number, x: { amount: number }) => s + x.amount, 0)).toBeCloseTo(180_000, 6);
    expect(m[2].amount).toBeCloseTo(10_000 + 30_000, 6);   // 3 月：月繳一期 ＋ 半年繳一期
    const p = Eng.premiumByPayer(c);
    expect(p).toEqual([{ payer: "甲", total: 180_000, count: 2 }]);
  });
});

describe("$領回：五個型別與期間內可領金額", () => {
  const one = { freq: 0, ageFrom: 65, ageTo: 65, amount: 1_000_000 };
  const many = { freq: 5, ageFrom: 60, ageTo: 80, amount: 100_000 };

  it("一次領：只在那一歲算得到", () => {
    expect(Eng.paybackInSpan(one, 60, 70)).toBe(1_000_000);
    expect(Eng.paybackInSpan(one, 66, 90)).toBe(0);
    expect(Eng.paybackTotal(one)).toBe(1_000_000);
  });

  it("週期領：每 freq 年一次，只算落在區間內的次數", () => {
    expect(Eng.paybackTotal(many)).toBe(500_000);            // 60,65,70,75,80
    expect(Eng.paybackInSpan(many, 65, 75)).toBe(300_000);   // 65,70,75
    expect(Eng.paybackInSpan(many, 61, 64)).toBe(0);
  });

  it("policyPaybacks 逐張保單展開，領受人留空時退回被保人", () => {
    const c = Eng.sampleCase();
    c.policies = [{ insured: "王大明(示範)", name: "某某終身壽險", paybacks: [{ type: "$祝壽", ageFrom: 90, amount: 500_000 }] }];
    const rows = Eng.policyPaybacks(c);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "$祝壽", receiver: "王大明(示範)", ageFrom: 90, ageTo: 90, amount: 500_000 });
    expect(Eng.policyPaybackBetween(c, 85, 95)).toBe(500_000);
    expect(Eng.policyPaybackBetween(c, 60, 80)).toBe(0);
  });

  it("PAYBACK_TYPES 就是 insure80 的五個型別", () => {
    expect(Eng.PAYBACK_TYPES).toEqual(["$生存", "$滿期", "$祝壽", "$年金", "$投資"]);
  });
});

describe("生命資產表：只呈現、不比對", () => {
  it("給付明細依分組收攏，未知分組落到「其他」", () => {
    const c = Eng.sampleCase();
    c.policies = [{
      insured: "王大明(示範)", name: "某某", status: "有效",
      benefits: [
        { group: "壽險", item: "身故", amount: 1_000_000, unit: "元" },
        { group: "防癌", item: "癌症住院", amount: 4_500, unit: "元/日" },
        { group: "亂填的", item: "??", amount: 1, unit: "元" },
      ],
    }];
    const gs = Eng.benefitsByGroup(c, "王大明(示範)");
    expect(gs.map((g: { group: string }) => g.group)).toEqual(["壽險", "防癌", "其他"]);
    // 90+ 項的呈現不會影響 9 種 KINDS 的比對
    expect(Eng.coverageCheckupRows(c).length).toBe(Eng.KINDS.length * (c.needs || []).length ? Eng.KINDS.length : 0);
  });
});

describe("解約金與主約效益分析", () => {
  it("解約金取「該保單年度末」的登錄值", () => {
    const p = { effDate: "2020/06/10", surrender: [{ year: 5, amount: 123_456 }] };
    expect(Eng.policyYearAt(p, 2024)).toBe(5);
    expect(Eng.surrenderAt(p, 5)).toBe(123_456);
    expect(Eng.surrenderAt(p, 6)).toBe(0);
  });

  it("效益＝（身故給付＋可領回）÷ 累計已繳；附約不單獨列", () => {
    const c = Eng.sampleCase();
    c.policies = [
      { policyKind: "主約", name: "主", insured: "A", effDate: "2020/01/01", premium: 100_000, payYears: 20, life: 5_000_000, status: "有效" },
      { policyKind: "附約", name: "附", insured: "A", effDate: "2020/01/01", premium: 10_000, status: "有效" },
    ];
    const rows = Eng.masterAnalysis(c, 2025);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "主", polYear: 6, paid: 600_000, death: 5_000_000 });
    expect(rows[0].ratio).toBeCloseTo(5_000_000 / 600_000, 6);
  });

  it("累計已繳不會超過繳費年期", () => {
    const c = Eng.sampleCase();
    c.policies = [{ policyKind: "主約", name: "繳完了", insured: "A", effDate: "2000/01/01", premium: 100_000, payYears: 6, life: 0, status: "有效" }];
    expect(Eng.masterAnalysis(c, 2026)[0].paid).toBe(600_000);
  });
});
