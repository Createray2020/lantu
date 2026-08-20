import { describe, it, expect } from "vitest";
import { ranksForModule, resolveModuleParams, splitForModule, type ChainNode } from "./engine";
import { V4_PRESET } from "./preset";
import { isCounted, isCountedForMaintenance, personalStats, type CaseRow } from "./stats";
import type { CompParams, ModuleRow } from "./types";

// 服務模塊：每種服務內容各自的分潤結構。
// 這一組測試守住三件事：
//   1. 模塊留空＝沿用全域，不是 0（跟整套系統的「留空」語意一致）
//   2. 模塊覆寫比例／職級表後仍必須加總 100%
//   3. flat 模式不沿輔導鏈、不發平階獎金，未分配的一律歸公司

const P = V4_PRESET;
const n = (id: string, rankCode: string): ChainNode => ({ id, rankCode, name: id });
const CHAIN = [n("s2", "S2"), n("chief", "CHIEF")];
const ME = n("c1", "C1");
const base = { fee: 60_000, promoter: ME, executor: ME, promoterChain: CHAIN, executorChain: CHAIN };
const pct = (r: ReturnType<typeof splitForModule>, id: string | null) =>
  r.lines.find((l) => l.payeeId === id)?.totalPct ?? null;
const company = (r: ReturnType<typeof splitForModule>) =>
  r.lines.filter((l) => l.payeeId === null).reduce((a, l) => a + l.totalPct, 0);

function withModules(mods: ModuleRow[], extra?: Partial<CompParams>): CompParams {
  return { ...P, modules: mods, ...extra };
}

describe("模塊留空＝沿用全域", () => {
  it("V4 預設的兩個模塊都沒填比例，結果與不指定模塊完全相同（範例一）", () => {
    const plain = splitForModule(base, P, null);
    const full = splitForModule(base, P, "FULL");
    const spot = splitForModule(base, P, "SPOT");
    for (const r of [plain, full, spot]) {
      expect(pct(r, "c1")).toBe(45);
      expect(pct(r, "s2")).toBe(31);
      expect(pct(r, "chief")).toBe(14);
      expect(r.totalPct).toBe(100);
    }
  });

  it("找不到的模塊代號＝退回全域預設，不是丟錯", () => {
    const r = splitForModule(base, P, "NOT_EXIST");
    expect(pct(r, "c1")).toBe(45);
    expect(r.totalPct).toBe(100);
  });

  it("只填一格（執案端）時，另一格仍沿用全域", () => {
    const p = resolveModuleParams(
      withModules([{ code: "X", seq: 1, name: "X", splitExecPct: 70 }]), "X",
    );
    expect(p.settings.splitExecPct).toBe(70);
    expect(p.settings.splitPromoPct).toBe(30); // 全域值不動
  });
});

describe("模塊覆寫區塊比例", () => {
  const mods: ModuleRow[] = [
    { code: "SPOT2", seq: 1, name: "單點諮詢（加碼）", splitMode: "chain", splitPromoPct: 20, splitExecPct: 70 },
  ];

  it("推廣 20／執案 70：各層依新上限重算，加總仍為 100%", () => {
    const r = splitForModule(base, withModules(mods), "SPOT2");
    // C1 自身分潤率 15／30 都在上限內，照拿 45%。
    expect(pct(r, "c1")).toBe(45);
    // S2：推廣 20（被上限鉗到）−15＝5；執案 50−30＝20 → 25%
    expect(pct(r, "s2")).toBe(25);
    // 首席：推廣端已到 20% 上限故不計；執案 60−50＝10 → 10%
    expect(pct(r, "chief")).toBe(10);
    // 公司：執案端未用罄的 10% ＋ 營運 10%
    expect(company(r)).toBe(20);
    expect(r.totalPct).toBe(100);
  });

  it("職級分潤率高於模塊上限時鉗到上限並提示，不會超額分配", () => {
    const low: ModuleRow[] = [
      { code: "LOW", seq: 1, name: "低比例模塊", splitMode: "chain", splitPromoPct: 10, splitExecPct: 20 },
    ];
    const r = splitForModule(base, withModules(low), "LOW");
    // C1 的 15／30 都超過上限，各自鉗到 10／20
    expect(pct(r, "c1")).toBe(30);
    expect(r.lines.every((l) => l.totalPct >= 0)).toBe(true);
    expect(r.totalPct).toBe(100);
    expect(r.warnings.join()).toContain("高於");
  });
});

describe("模塊自訂職級表", () => {
  const params = withModules(
    [{ code: "LEC", seq: 1, name: "講座", splitMode: "chain" }],
    {
      ranks: [
        ...P.ranks,
        // 講座模塊：C1 只拿 10/20，其餘照舊
        { code: "C1", seq: 1, moduleCode: "LEC", promoPct: 10, execPct: 20 },
        { code: "S2", seq: 5, moduleCode: "LEC", promoPct: 26, execPct: 50 },
        { code: "CHIEF", seq: 7, moduleCode: "LEC", promoPct: 30, execPct: 60 },
      ],
    },
  );

  it("有自訂表就用自訂表", () => {
    expect(ranksForModule(params, "LEC").find((r) => r.code === "C1")?.promoPct).toBe(10);
    const r = splitForModule(base, params, "LEC");
    expect(pct(r, "c1")).toBe(30);        // 10 + 20
    expect(pct(r, "s2")).toBe(46);        // (26−10) + (50−20)
    expect(r.totalPct).toBe(100);
  });

  it("沒自訂表的模塊仍拿到預設表", () => {
    expect(ranksForModule(params, "FULL").find((r) => r.code === "C1")?.promoPct).toBe(15);
    expect(ranksForModule(params, null).find((r) => r.code === "C1")?.promoPct).toBe(15);
  });
});

describe("flat 模式（不走差％）", () => {
  const mods: ModuleRow[] = [
    { code: "COURSE", seq: 1, name: "課程", splitMode: "flat", flatExecPct: 40, flatPromoPct: 10 },
  ];
  const p = withModules(mods);

  it("自推自執＝兩個 % 相加，其餘歸公司", () => {
    const r = splitForModule(base, p, "COURSE");
    expect(pct(r, "c1")).toBe(50);
    expect(pct(r, "s2")).toBeNull();     // 不沿輔導鏈
    expect(pct(r, "chief")).toBeNull();
    expect(company(r)).toBe(50);
    expect(r.totalPct).toBe(100);
    expect(r.totalAmount).toBe(60_000);
  });

  it("推廣與執案不同人時各拿各的", () => {
    const r = splitForModule(
      { ...base, promoter: n("p1", "C3"), executor: n("e1", "S1"), promoterChain: [], executorChain: [] },
      p, "COURSE",
    );
    expect(pct(r, "e1")).toBe(40);
    expect(pct(r, "p1")).toBe(10);
    expect(company(r)).toBe(50);
  });

  it("公司派案時推廣端那 10% 歸公司", () => {
    const r = splitForModule({ ...base, isCompanyLead: true, promoter: null }, p, "COURSE");
    expect(pct(r, "c1")).toBe(40);
    expect(company(r)).toBe(60);
    expect(r.totalPct).toBe(100);
  });

  it("平階也不會發平階輔導獎金（flat 沒有輔導鏈概念）", () => {
    const peerChain = [n("c1b", "C1"), n("chief", "CHIEF")];
    const r = splitForModule({ ...base, promoterChain: peerChain, executorChain: peerChain }, p, "COURSE");
    expect(pct(r, "c1b")).toBeNull();
    expect(r.lines.every((l) => l.bonusPct === 0)).toBe(true);
  });

  it("比例未設定時以 0 計並給警告，加總仍為 100%", () => {
    const r = splitForModule(base, withModules([{ code: "X", seq: 1, name: "X", splitMode: "flat" }]), "X");
    expect(pct(r, "c1")).toBeNull();
    expect(company(r)).toBe(100);
    expect(r.warnings.join()).toContain("未設定");
    expect(r.balanced).toBe(true);
  });

  it("停用的模塊不生效，退回全域預設", () => {
    const off = withModules([{ ...mods[0], enabled: false }]);
    const r = splitForModule(base, off, "COURSE");
    expect(pct(r, "c1")).toBe(45);   // 走回差％
  });
});

describe("模塊的計入開關", () => {
  const mods: ModuleRow[] = [
    { code: "FULL", seq: 1, name: "完整規劃", countPromotion: true, countMaintenance: true },
    { code: "TRAIN", seq: 2, name: "培訓課程", countPromotion: false, countMaintenance: false },
    { code: "MIX", seq: 3, name: "分潤算但不計維持", countPromotion: true, countMaintenance: false },
  ];
  const p = withModules(mods);
  const c = (id: string, moduleCode: string): CaseRow => ({
    id, executorId: "me", clientId: `cl${id}`, clientName: `客${id}`, moduleCode,
    fee: 60_000, caseYear: 2026, paidAt: "2026-03-01", surveyAt: "2026-03-10", status: "closed",
  });

  it("關掉「計入晉升」的模塊不進晉升指標", () => {
    expect(isCounted(c("1", "FULL"), p.settings, p.modules)).toBe(true);
    expect(isCounted(c("2", "TRAIN"), p.settings, p.modules)).toBe(false);
  });

  it("可以做出「分潤算、維持資格不算」的組合", () => {
    const row = c("3", "MIX");
    expect(isCounted(row, p.settings, p.modules)).toBe(true);
    expect(isCountedForMaintenance(row, p.settings, p.modules)).toBe(false);
  });

  it("晉升指標只算開關開著的模塊", () => {
    const cases = [c("1", "FULL"), c("2", "TRAIN"), c("3", "MIX")];
    expect(personalStats(cases, "me", p).cases).toBe(2);          // FULL + MIX
    expect(personalStats(cases, "me", p).fees).toBe(120_000);
  });

  it("維持資格的執案數再少一件（MIX 不算）", () => {
    const cases = [c("1", "FULL"), c("2", "TRAIN"), c("3", "MIX")];
    expect(personalStats(cases, "me", p, { year: 2026, forMaintenance: true }).cases).toBe(1);
  });

  it("沒指定模塊的案件一律計入（不因為沒填就被排除）", () => {
    const row = { ...c("9", ""), moduleCode: "" };
    expect(isCounted(row, p.settings, p.modules)).toBe(true);
    expect(isCountedForMaintenance(row, p.settings, p.modules)).toBe(true);
  });
});

describe("不變量：任何模塊設定都必須加總 100%", () => {
  it("隨機 200 組模塊設定 × 情境，總和恆為 100%、金額恆等於顧問費", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const codes = ["C1", "C2", "C3", "S1", "S2", "S3", "CHIEF"];
    for (let i = 0; i < 200; i++) {
      const flat = rnd() < 0.5;
      const m: ModuleRow = flat
        ? {
            code: "M", seq: 1, name: "M", splitMode: "flat",
            flatExecPct: Math.round(rnd() * 80),
            flatPromoPct: Math.round(rnd() * 20),
          }
        : {
            code: "M", seq: 1, name: "M", splitMode: "chain",
            splitPromoPct: rnd() < 0.5 ? null : Math.round(rnd() * 40),
            splitExecPct: rnd() < 0.5 ? null : Math.round(rnd() * 60),
          };
      const depth = Math.floor(rnd() * 4);
      const chain = Array.from({ length: depth }, (_, k) =>
        n(`u${k}`, codes[Math.floor(rnd() * codes.length)]),
      );
      const me = n("me", codes[Math.floor(rnd() * codes.length)]);
      const fee = 1_000 + Math.floor(rnd() * 400) * 251;
      const r = splitForModule(
        {
          fee, isCompanyLead: rnd() < 0.3,
          promoter: me, executor: me, promoterChain: chain, executorChain: chain,
        },
        withModules([m]), "M",
      );
      expect(r.balanced, `第 ${i} 組（${flat ? "flat" : "chain"}）不平衡：${r.totalPct}%`).toBe(true);
      expect(r.totalAmount).toBe(fee);
    }
  });
});
