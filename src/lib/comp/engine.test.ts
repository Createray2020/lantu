import { describe, it, expect } from "vitest";
import { splitCase, teamCreditIds, type ChainNode, type SplitInput } from "./engine";
import { V4_PRESET } from "./preset";
import { emptyParams, type CompParams } from "./types";

// 《財務顧問業務制度辦法 V4.0》裡的七個試算範例，就是這支引擎的驗收標準。
// 載入 V4 數值後，每一格數字都必須與辦法完全一致；任何規則開關被改壞，這裡會先紅。

const P = V4_PRESET;
const FEE = 60_000;

function n(id: string, rankCode: string): ChainNode {
  return { id, rankCode, name: `${id}(${rankCode})` };
}

/** 取某人的合計 %／金額；查不到回 null（比 undefined 好讀） */
function who(res: ReturnType<typeof splitCase>, id: string) {
  const l = res.lines.find((x) => x.payeeId === id);
  return l ? { pct: l.totalPct, amount: l.amount } : null;
}
function companyTotal(res: ReturnType<typeof splitCase>) {
  const ls = res.lines.filter((x) => x.payeeId === null);
  return { pct: ls.reduce((a, x) => a + x.totalPct, 0), amount: ls.reduce((a, x) => a + x.amount, 0) };
}

describe("範例一　C1 自推自執（C1 → S2 → 首席）", () => {
  const c1 = n("c1", "C1");
  const res = splitCase(
    { fee: FEE, promoter: c1, executor: c1, promoterChain: [n("s2", "S2"), n("chief", "CHIEF")], executorChain: [n("s2", "S2"), n("chief", "CHIEF")] },
    P,
  );

  it("C1 推廣15＋執案30＝45%＝27,000", () => {
    expect(who(res, "c1")).toEqual({ pct: 45, amount: 27_000 });
  });
  it("S2 直屬主管 11＋20＝31%＝18,600", () => {
    expect(who(res, "s2")).toEqual({ pct: 31, amount: 18_600 });
  });
  it("首席 4＋10＝14%＝8,400", () => {
    expect(who(res, "chief")).toEqual({ pct: 14, amount: 8_400 });
  });
  it("公司 10%＝6,000，驗算 100%", () => {
    expect(companyTotal(res)).toEqual({ pct: 10, amount: 6_000 });
    expect(res.totalPct).toBe(100);
    expect(res.balanced).toBe(true);
    expect(res.totalAmount).toBe(FEE);
  });
});

describe("範例二　公司派案（執案 S1，直屬主管首席）", () => {
  const res = splitCase(
    { fee: FEE, isCompanyLead: true, promoter: null, executor: n("s1", "S1"), executorChain: [n("chief", "CHIEF")] },
    P,
  );

  it("S1 執案 43%＝25,800（推廣端不分）", () => {
    expect(who(res, "s1")).toEqual({ pct: 43, amount: 25_800 });
  });
  it("首席 17%＝10,200", () => {
    expect(who(res, "chief")).toEqual({ pct: 17, amount: 10_200 });
  });
  it("公司 30%（派案）＋10%（營運）＝40%＝24,000", () => {
    expect(companyTotal(res)).toEqual({ pct: 40, amount: 24_000 });
    const lead = res.lines.find((l) => l.kind === "company_lead");
    expect(lead?.totalPct).toBe(30);
    expect(res.totalPct).toBe(100);
  });
});

describe("範例三　平階（S3 自推自執，直屬主管 S3，其上首席）", () => {
  const me = n("s3a", "S3");
  const chain = [n("s3b", "S3"), n("chief", "CHIEF")];
  const res = splitCase(
    { fee: FEE, promoter: me, executor: me, promoterChain: chain, executorChain: chain },
    P,
  );

  it("S3 執案者 85%＝51,000", () => {
    expect(who(res, "s3a")).toEqual({ pct: 85, amount: 51_000 });
  });
  it("平階直屬主管拿平階輔導獎金 2.5%＝1,500（差％為 0）", () => {
    expect(who(res, "s3b")).toEqual({ pct: 2.5, amount: 1_500 });
    const l = res.lines.find((x) => x.payeeId === "s3b")!;
    expect(l.promoPct).toBe(0);
    expect(l.execPct).toBe(0);
    expect(l.bonusPct).toBe(2.5);
  });
  it("首席讓出一半後剩 2.5%＝1,500", () => {
    expect(who(res, "chief")).toEqual({ pct: 2.5, amount: 1_500 });
  });
  it("公司仍為 10%、不另提撥，驗算 100%", () => {
    expect(companyTotal(res)).toEqual({ pct: 10, amount: 6_000 });
    expect(res.totalPct).toBe(100);
  });
  it("本案業績計入直屬主管與其上層的團隊輔導業績（§8）", () => {
    expect(teamCreditIds(
      { fee: FEE, promoter: me, executor: me, promoterChain: chain, executorChain: chain },
      P,
    )).toEqual(["s3b", "chief"]);
  });
});

describe("附錄 A　倒掛（S3 執案，直屬主管 S1，其上首席）", () => {
  const me = n("s3", "S3");
  const chain = [n("s1", "S1"), n("chief", "CHIEF")];
  const res = splitCase(
    { fee: FEE, promoter: me, executor: me, promoterChain: chain, executorChain: chain },
    P,
  );

  it("S3 85%＝51,000", () => expect(who(res, "s3")).toEqual({ pct: 85, amount: 51_000 }));
  it("倒掛的 S1 不計差％、也沒有平階獎金（0 元）", () => {
    expect(who(res, "s1")).toEqual({ pct: 0, amount: 0 });
  });
  it("首席依差額續算 5%＝3,000", () => {
    expect(who(res, "chief")).toEqual({ pct: 5, amount: 3_000 });
  });
  it("驗算 100%", () => expect(res.totalPct).toBe(100));
  it("該案業績仍計入 S1 的團隊輔導業績", () => {
    expect(teamCreditIds({ fee: FEE, executor: me, executorChain: chain }, P)).toContain("s1");
  });
});

describe("附錄 B　推廣與執案分屬不同人（推廣 C1、執案 S3，同一鏈）", () => {
  const res = splitCase(
    {
      fee: FEE,
      promoter: n("c1", "C1"),
      promoterChain: [n("s2", "S2"), n("s3", "S3"), n("chief", "CHIEF")],
      executor: n("s3", "S3"),
      executorChain: [n("chief", "CHIEF")],
    },
    P,
  );

  it("C1 推廣 15%＝9,000", () => expect(who(res, "c1")).toEqual({ pct: 15, amount: 9_000 }));
  it("S2 推廣端差％ 11%＝6,600", () => expect(who(res, "s2")).toEqual({ pct: 11, amount: 6_600 }));
  it("S3 推廣端 2%＋執案 57%＝59%＝35,400（同一人只出現一列）", () => {
    expect(who(res, "s3")).toEqual({ pct: 59, amount: 35_400 });
    expect(res.lines.filter((l) => l.payeeId === "s3")).toHaveLength(1);
  });
  it("首席 2%＋3%＝5%＝3,000", () => expect(who(res, "chief")).toEqual({ pct: 5, amount: 3_000 }));
  it("驗算 100%", () => expect(res.totalPct).toBe(100));
});

describe("附錄 C　輔導鏈不完整（公司直接招募的 S1 自推自執）", () => {
  const me = n("s1", "S1");
  const res = splitCase({ fee: FEE, promoter: me, executor: me, promoterChain: [], executorChain: [] }, P);

  it("S1 67%＝40,200", () => expect(who(res, "s1")).toEqual({ pct: 67, amount: 40_200 }));
  it("未分配差額 23%＝13,800 歸公司", () => {
    const r = res.lines.find((l) => l.kind === "company_remainder");
    expect(r?.totalPct).toBe(23);
    expect(r?.amount).toBe(13_800);
  });
  it("公司合計 33%＝19,800，驗算 100%", () => {
    expect(companyTotal(res)).toEqual({ pct: 33, amount: 19_800 });
    expect(res.totalPct).toBe(100);
  });
});

describe("附錄 D　認證顧問代管（C2 招募平階 C2，由 S1 代管）", () => {
  // 代管的語意在「有效輔導鏈」就處理掉了：推薦人 C2 不在鏈上，鏈直接從代管者 S1 起算。
  const me = n("c2b", "C2");
  const chain = [n("s1", "S1"), n("chief", "CHIEF")];
  const res = splitCase(
    { fee: FEE, promoter: me, executor: me, promoterChain: chain, executorChain: chain },
    P,
  );

  it("被招募的 C2 51%＝30,600", () => expect(who(res, "c2b")).toEqual({ pct: 51, amount: 30_600 }));
  it("推薦人（未晉升 S1）不在分潤名單內", () => expect(who(res, "c2a")).toBeNull());
  it("代管者 S1 16%＝9,600（非平階，走一般差％）", () => {
    expect(who(res, "s1")).toEqual({ pct: 16, amount: 9_600 });
  });
  it("首席 23%＝13,800", () => expect(who(res, "chief")).toEqual({ pct: 23, amount: 13_800 }));
  it("驗算 100%", () => expect(res.totalPct).toBe(100));
});

describe("不變量：任何情境都必須加總 100%", () => {
  const codes = ["C1", "C2", "C3", "S1", "S2", "S3", "CHIEF"];
  it("隨機組合 300 種鏈／職級／派案，總和恆為 100%、金額恆等於顧問費", () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 300; i++) {
      const depth = Math.floor(rnd() * 4);
      const chain: ChainNode[] = Array.from({ length: depth }, (_, k) =>
        n(`u${k}`, codes[Math.floor(rnd() * codes.length)]),
      );
      const me = n("me", codes[Math.floor(rnd() * codes.length)]);
      const fee = 1_000 + Math.floor(rnd() * 500) * 137;
      const input: SplitInput = {
        fee,
        isCompanyLead: rnd() < 0.3,
        promoter: me,
        executor: me,
        promoterChain: chain,
        executorChain: chain,
      };
      const res = splitCase(input, P);
      expect(res.balanced, `第 ${i} 組不平衡：${res.totalPct}%`).toBe(true);
      expect(res.totalAmount).toBe(fee);
    }
  });
});

describe("留空的行為：未設定不擋人、不當成 0 分潤而是明白說出來", () => {
  it("完全空白的制度不會丟例外，只給警告", () => {
    const res = splitCase({ fee: FEE, promoter: n("a", "C1"), executor: n("a", "C1") }, emptyParams());
    expect(res.lines.length).toBeGreaterThan(0);
    expect(res.warnings.join()).toContain("未設定");
  });

  it("只設定分潤架構、職級率留空時，差額全歸公司且加總仍為 100%", () => {
    const p: CompParams = {
      settings: { splitPromoPct: 30, splitExecPct: 60 },
      ranks: [{ code: "C1", seq: 1 }],
      thresholds: [],
    };
    const res = splitCase({ fee: FEE, promoter: n("a", "C1"), executor: n("a", "C1") }, p);
    expect(res.totalPct).toBe(100);
    expect(companyTotal(res).pct).toBe(100);
  });

  it("平階獎金比例留空時不發放獎金（規則不啟用，而非發 0%）", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, peerBonusPct: undefined } };
    const me = n("s3a", "S3");
    const chain = [n("s3b", "S3"), n("chief", "CHIEF")];
    const res = splitCase({ fee: FEE, promoter: me, executor: me, promoterChain: chain, executorChain: chain }, p);
    expect(who(res, "s3b")).toEqual({ pct: 0, amount: 0 });
    expect(who(res, "chief")).toEqual({ pct: 5, amount: 3_000 });
    expect(res.totalPct).toBe(100);
  });
});

describe("規則開關真的會改變結果", () => {
  const me = n("s3", "S3");
  const chain = [n("s1", "S1"), n("chief", "CHIEF")];
  const input: SplitInput = { fee: FEE, promoter: me, executor: me, promoterChain: chain, executorChain: chain };

  it("關閉「倒掛續算」→ 鏈於倒掛層中斷，其餘差額歸公司", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, ruleInvertedSkip: false } };
    const res = splitCase(input, p);
    expect(who(res, "chief")).toBeNull();
    expect(companyTotal(res).pct).toBe(15); // 5% 未分配差額 ＋ 10% 營運
    expect(res.totalPct).toBe(100);
  });

  it("關閉「公司派案取推廣端」→ 推廣端回歸推廣者輔導鏈", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, ruleCompanyLeadTakesPromo: false } };
    const res = splitCase({ ...input, isCompanyLead: true }, p);
    expect(res.lines.some((l) => l.kind === "company_lead")).toBe(false);
    expect(who(res, "s3")!.pct).toBe(85);
  });

  it("追溯層數上限設 1 → 只算直屬主管那一層", () => {
    const p: CompParams = { ...P, settings: { ...P.settings, chainMaxLevels: 1 } };
    const res = splitCase(
      { fee: FEE, promoter: n("c1", "C1"), executor: n("c1", "C1"), promoterChain: [n("s2", "S2"), n("chief", "CHIEF")], executorChain: [n("s2", "S2"), n("chief", "CHIEF")] },
      p,
    );
    expect(who(res, "chief")).toBeNull();
    expect(who(res, "s2")!.pct).toBe(31);
    expect(res.totalPct).toBe(100);
  });
});
