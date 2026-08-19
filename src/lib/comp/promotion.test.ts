import { describe, it, expect } from "vitest";
import { V4_PRESET } from "./preset";
import { resolveChain, teamCreditChain, type AdvisorRow } from "./chain";
import {
  advisorStats, caseKey, isCounted, personalStats, teamStats, trainingHours, type CaseRow,
} from "./stats";
import { evalMaintenance, evalPromotion, evalTenure } from "./promotion";
import { splitCase } from "./engine";
import type { CompParams } from "./types";

const P = V4_PRESET;

// 組織：chief → s2 → c1a, c1b ；chief → s3 ；s3 → s3peer（平階）
//       c2sponsor（C2，掛在 s1 底下）→ c2new（C2，被平階招募 → 觸發代管）
const ORG: AdvisorRow[] = [
  { id: "chief", name: "首席", rankCode: "CHIEF", uplineId: null },
  { id: "s2", name: "阿凱", rankCode: "S2", uplineId: "chief" },
  { id: "c1a", name: "小陳", rankCode: "C1", uplineId: "s2" },
  { id: "c1b", name: "小林", rankCode: "C1", uplineId: "s2" },
  { id: "s3", name: "浩軍", rankCode: "S3", uplineId: "chief" },
  { id: "s3peer", name: "同階", rankCode: "S3", uplineId: "s3" },
  { id: "s1", name: "家慶", rankCode: "S1", uplineId: "chief" },
  { id: "c2sponsor", name: "推薦人", rankCode: "C2", uplineId: "s1" },
  { id: "c2new", name: "新人", rankCode: "C2", uplineId: "c2sponsor" },
];

function cs(o: Partial<CaseRow> & { id: string; executorId: string }): CaseRow {
  return {
    clientName: `客戶${o.id}`, fee: 60_000, caseYear: 2026,
    paidAt: "2026-03-01", surveyAt: "2026-03-10", status: "closed",
    ...o,
  };
}

describe("resolveChain：代管（§9）", () => {
  it("一般情形＝直接沿上線串到頂", () => {
    const r = resolveChain("c1a", ORG, P)!;
    expect(r.chain.map((n) => n.id)).toEqual(["s2", "chief"]);
    expect(r.skipped).toHaveLength(0);
  });

  it("C2 推薦人招募平階 C2 → 推薦人被略過，由 S1 代管", () => {
    const r = resolveChain("c2new", ORG, P)!;
    expect(r.chain.map((n) => n.id)).toEqual(["s1", "chief"]);
    expect(r.skipped.map((x) => x.id)).toEqual(["c2sponsor"]);
    expect(r.skipped[0].reason).toContain("代管");
  });

  it("代管後的鏈丟進引擎＝辦法附錄 D 的數字", () => {
    const r = resolveChain("c2new", ORG, P)!;
    const res = splitCase(
      { fee: 60_000, promoter: r.self, executor: r.self, promoterChain: r.chain, executorChain: r.chain },
      P,
    );
    const pct = (id: string) => res.lines.find((l) => l.payeeId === id)?.totalPct ?? null;
    expect(pct("c2new")).toBe(51);
    expect(pct("s1")).toBe(16);
    expect(pct("chief")).toBe(23);
    expect(pct("c2sponsor")).toBeNull(); // 推薦人代管期間不計分潤
    expect(res.totalPct).toBe(100);
  });

  it("關閉代管 → 推薦人回到鏈上（差％為 0，但仍在名單裡）", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, custodyUseCustodian: false } };
    const r = resolveChain("c2new", ORG, p)!;
    expect(r.chain.map((n) => n.id)).toEqual(["c2sponsor", "s1", "chief"]);
  });

  it("代管期間業績不計入推薦人的團隊輔導業績（§9-3）", () => {
    expect(teamCreditChain("c2new", ORG, P)).toEqual(["s1", "chief"]);
  });

  it("組織有環時不會無限迴圈", () => {
    const loop: AdvisorRow[] = [
      { id: "a", rankCode: "C1", uplineId: "b" },
      { id: "b", rankCode: "C2", uplineId: "a" },
    ];
    const r = resolveChain("a", loop, P)!;
    expect(r.chain.map((n) => n.id)).toEqual(["b"]);
  });
});

describe("個案認定（§20、§21）", () => {
  const cases: CaseRow[] = [
    cs({ id: "1", executorId: "c1a", clientId: "cl1", fee: 30_000 }),
    cs({ id: "2", executorId: "c1a", clientId: "cl1", fee: 20_000 }), // 同客戶同年 → 併為一案，費用累加
    cs({ id: "3", executorId: "c1a", clientId: "cl1", fee: 40_000, caseYear: 2027 }), // 跨年 → 另一案
    cs({ id: "4", executorId: "c1a", clientId: "cl2", fee: 60_000, surveyAt: null }), // 問卷未回收 → 不計
    cs({ id: "5", executorId: "c1a", clientId: "cl3", fee: 60_000, paidAt: null }),   // 未實收 → 不計
    cs({ id: "6", executorId: "c1a", clientId: "cl4", fee: 60_000, status: "refunded" }), // 退費 → 不計
  ];

  it("同一自然人同年度合併為一個個案，顧問費累加", () => {
    const r = personalStats(cases, "c1a", P);
    expect(r.cases).toBe(2);            // cl1@2026、cl1@2027
    expect(r.fees).toBe(90_000);        // 30k+20k+40k
  });

  it("關閉合併時每筆收費各算一案", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, caseMergeSameYear: false } };
    expect(personalStats(cases, "c1a", p).cases).toBe(3);
  });

  it("問卷未回收／未實收／已退費都不計入", () => {
    expect(isCounted(cases[3], P.settings)).toBe(false);
    expect(isCounted(cases[4], P.settings)).toBe(false);
    expect(isCounted(cases[5], P.settings)).toBe(false);
  });

  it("關閉問卷結案制後，未回收問卷的案件就算數", () => {
    const p = { ...P.settings, promoRequireSurvey: false };
    expect(isCounted(cases[3], p)).toBe(true);
  });

  it("部分退費按實收計算（§23-2）", () => {
    const c = cs({ id: "x", executorId: "c1a", clientId: "cx", fee: 60_000, refundAmount: 20_000 });
    expect(personalStats([c], "c1a", P).fees).toBe(40_000);
  });

  it("沒有 clientId 時以姓名認人", () => {
    const a = cs({ id: "a", executorId: "c1a", clientName: "王小明" });
    const b = cs({ id: "b", executorId: "c1a", clientName: "王小明" });
    expect(caseKey(a, P.settings)).toBe(caseKey(b, P.settings));
  });
});

describe("團隊輔導業績（§13）", () => {
  const cases: CaseRow[] = [
    cs({ id: "1", executorId: "c1a", clientId: "cl1" }),
    cs({ id: "2", executorId: "c1b", clientId: "cl2" }),
    cs({ id: "3", executorId: "s2", clientId: "cl3" }),   // 主管自己執的案不計入自己的團隊業績
    cs({ id: "4", executorId: "s3peer", clientId: "cl4" }),
  ];

  it("鏈上逐層計入：s2 得下線兩案，chief 得全部四案", () => {
    expect(teamStats(cases, "s2", ORG, P).cases).toBe(2);
    expect(teamStats(cases, "chief", ORG, P).cases).toBe(4);
  });

  it("平階下線的案件照樣計入直屬主管（§8-1）", () => {
    expect(teamStats(cases, "s3", ORG, P).cases).toBe(1);
  });

  it("關閉逐層計入時只算直屬主管那一層", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, teamCreditEachLevel: false } };
    expect(teamStats(cases, "chief", ORG, p).cases).toBe(1); // 只有 s2/s3/s1 的直屬案
  });

  it("同業招募帶入的期初實績計入個人累計", () => {
    const a = { ...ORG[2], initialCases: 5, initialFees: 150_000 };
    const s = advisorStats(a, cases, ORG, P);
    expect(s.personalCases).toBe(6);
    expect(s.personalFees).toBe(210_000);
  });
});

describe("晉升判定（§10–§13）", () => {
  const c1 = ORG.find((a) => a.id === "c1a")!;

  it("A 軌雙指標都達標才晉升", () => {
    const r1 = evalPromotion(c1, { personalCases: 1, personalFees: 20_000, teamCases: 0 }, P);
    expect(r1.canPromote).toBe(false);
    expect(r1.nextCode).toBe("C2");
    const r2 = evalPromotion(c1, { personalCases: 1, personalFees: 30_000, teamCases: 0 }, P);
    expect(r2.canPromote).toBe(true);
    expect(r2.track).toBe("A");
  });

  it("關閉雙指標制 → 任一達標即可", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, promoDualIndex: false } };
    const r = evalPromotion(c1, { personalCases: 1, personalFees: 0, teamCases: 0 }, p);
    expect(r.canPromote).toBe(true);
  });

  it("認證顧問階段不適用 B 軌（§13-5）", () => {
    const r = evalPromotion(c1, { personalCases: 99, personalFees: 9_000_000, teamCases: 99 }, P);
    expect(r.trackB).toBeNull();
  });

  it("S2 走 B 軌：個人未達 A 軌但團隊達標即可晉升", () => {
    const s2 = ORG.find((a) => a.id === "s2")!;
    const r = evalPromotion(s2, { personalCases: 19, personalFees: 570_000, teamCases: 40 }, P);
    expect(r.trackA!.met).toBe(false);   // A 軌要 25 案／75 萬
    expect(r.trackB!.met).toBe(true);    // B 軌要 18 案／54 萬＋團隊 40
    expect(r.canPromote).toBe(true);
    expect(r.track).toBe("B");
  });

  it("S3→首席的 B 軌還要育成 2 位 S1 以上", () => {
    const s3 = ORG.find((a) => a.id === "s3")!;
    const stats = { personalCases: 25, personalFees: 750_000, teamCases: 70 };
    const no = evalPromotion(s3, stats, P, { mentoredCount: () => 1 });
    expect(no.trackB!.met).toBe(false);
    const yes = evalPromotion(s3, stats, P, { mentoredCount: () => 2 });
    expect(yes.trackB!.met).toBe(true);
  });

  it("門檻留空＝該軌不啟用，不會變成人人達標", () => {
    const p: CompParams = {
      ...P,
      thresholds: P.thresholds.map((t) =>
        t.kind === "promotion_a" && t.fromCode === "C1" ? { ...t, cases: null, fees: null } : t,
      ),
    };
    const r = evalPromotion(c1, { personalCases: 999, personalFees: 999_999, teamCases: 0 }, p);
    expect(r.trackA!.met).toBe(false);
    expect(r.canPromote).toBe(false);
  });

  it("真除期間不併行一般晉升", () => {
    const r = evalPromotion(
      { ...c1, tenureRankCode: "S3" },
      { personalCases: 99, personalFees: 999_999, teamCases: 0 },
      P,
    );
    expect(r.canPromote).toBe(false);
    expect(r.blocked).toContain("真除");
  });
});

describe("真除與認階轉正（§15-4）", () => {
  const a = { id: "x", rankCode: "S3", uplineId: "chief", tenureRankCode: "S3", tenureUntil: "2027-01-31" };

  it("達成核定職級門檻 → 直接轉正", () => {
    const r = evalTenure(a, { cases: 5, fees: 150_000 }, P, "2027-02-01");
    expect(r.met).toBe(true);
    expect(r.settledCode).toBe("S3");
  });

  it("核定 S3 但只完成 4 案／12 萬 → 認階為 S2（辦法舉例）", () => {
    const r = evalTenure(a, { cases: 4, fees: 120_000 }, P, "2027-02-01");
    expect(r.met).toBe(false);
    expect(r.settledCode).toBe("S2");
    expect(r.note).toContain("認階");
  });

  it("只完成 3 案／9 萬 → 認階為 S1", () => {
    expect(evalTenure(a, { cases: 3, fees: 90_000 }, P, "2027-02-01").settledCode).toBe("S1");
  });

  it("未達最低真除門檻 → 落到保底職級 C3", () => {
    expect(evalTenure(a, { cases: 1, fees: 10_000 }, P, "2027-02-01").settledCode).toBe("C3");
  });

  it("關閉認階轉正 → 未達標直接落保底", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, tenureStepDown: false } };
    expect(evalTenure(a, { cases: 4, fees: 120_000 }, p, "2027-02-01").settledCode).toBe("C3");
  });

  it("首席的真除還要育成 1 位直轄顧問完成首案", () => {
    const chiefA = { ...a, tenureRankCode: "CHIEF" };
    expect(evalTenure(chiefA, { cases: 6, fees: 180_000, mentored: 0 }, P, "2027-02-01").met).toBe(false);
    expect(evalTenure(chiefA, { cases: 6, fees: 180_000, mentored: 1 }, P, "2027-02-01").met).toBe(true);
  });

  it("非真除狀態＝不適用", () => {
    expect(evalTenure({ id: "y", rankCode: "C1" }, { cases: 0, fees: 0 }, P, "2026-08-19").applicable).toBe(false);
  });

  it("期限未到不算過期", () => {
    expect(evalTenure(a, { cases: 0, fees: 0 }, P, "2026-08-19").expired).toBe(false);
    expect(evalTenure(a, { cases: 0, fees: 0 }, P, "2027-03-01").expired).toBe(true);
  });
});

describe("維持資格（§16–§19）", () => {
  const a = { id: "m", rankCode: "S1", uplineId: "chief", hireDate: "2024-05-01" };

  it("兩個門檻都達成才算通過", () => {
    expect(evalMaintenance(a, { year: 2026, execCases: 1, trainHours: 8 }, P).pass).toBe(true);
    expect(evalMaintenance(a, { year: 2026, execCases: 0, trainHours: 8 }, P).pass).toBe(false);
    expect(evalMaintenance(a, { year: 2026, execCases: 1, trainHours: 6 }, P).pass).toBe(false);
  });

  it("未達時列出暫停項目（職級不降級）", () => {
    const r = evalMaintenance(a, { year: 2026, execCases: 0, trainHours: 0 }, P);
    expect(r.penalties).toEqual(["暫停招募直轄顧問資格", "暫停公司派案受派資格"]);
  });

  it("訓練時數留空＝不檢查該項", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, trainHours: undefined } };
    expect(evalMaintenance(a, { year: 2026, execCases: 1, trainHours: 0 }, p).pass).toBe(true);
  });

  it("到職當年度首年豁免（§19-2）", () => {
    const rookie = { ...a, hireDate: "2026-03-01" };
    const r = evalMaintenance(rookie, { year: 2026, execCases: 0, trainHours: 0 }, P);
    expect(r.pass).toBe(true);
    expect(r.exempt).toBe(true);
    expect(r.exemptReason).toContain("首年度");
  });

  it("人工豁免（育嬰／重大傷病／兵役）", () => {
    const r = evalMaintenance(a, { year: 2026, execCases: 0, trainHours: 0, manualExempt: "育嬰" }, P);
    expect(r.pass).toBe(true);
    expect(r.exemptReason).toBe("育嬰");
  });
});

describe("訓練時數認列（§16-2）", () => {
  const recs = [
    { kind: "internal", hours: 2, year: 2026, status: "approved" },
    { kind: "internal", hours: 2, year: 2026, status: "approved" },
    { kind: "speaker", hours: 4, year: 2026, status: "approved" },
    { kind: "external", hours: 6, year: 2026, status: "approved" },   // 上限 3
    { kind: "external", hours: 3, year: 2026, status: "pending" },    // 未核准不計
    { kind: "internal", hours: 2, year: 2025, status: "approved" },   // 別的年度
  ];

  it("外部課程受年度上限，未核准與跨年度不計", () => {
    const r = trainingHours(recs, P, 2026);
    expect(r.internal).toBe(4);
    expect(r.speaker).toBe(4);
    expect(r.externalRaw).toBe(6);
    expect(r.external).toBe(3);
    expect(r.total).toBe(11);
  });

  it("上限留空＝不設限", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, trainExternalCap: undefined } };
    expect(trainingHours(recs, p, 2026).external).toBe(6);
  });
});
