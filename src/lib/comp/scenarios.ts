// 辦法裡的七個試算範例，做成可重用的情境包。
// 三個地方共用：制度設定頁的即時驗算條、試算器的快速情境按鈕、引擎測試。
//
// 職級以 code 表示；若制度的職級表被改名／改階，情境會自動退化為「找不到職級」
// 而不是硬跑出錯誤數字（isApplicable 會先擋）。

import type { SplitInput, ChainNode } from "./engine";
import type { CompParams } from "./types";

export type Scenario = {
  id: string;
  title: string;
  law: string;
  desc: string;
  fee: number;
  build: () => SplitInput;
  /** 這個情境會用到的職級代號 */
  codes: string[];
};

const nd = (id: string, rankCode: string, name?: string): ChainNode => ({
  id, rankCode, name: name ?? `${rankCode}`,
});

const FEE = 60_000;

export const SCENARIOS: Scenario[] = [
  {
    id: "ex1",
    title: "範例一　C1 自推自執",
    law: "§4 範例一",
    desc: "輔導鏈 C1 → S2 → 首席，顧問費 6 萬。",
    fee: FEE,
    codes: ["C1", "S2", "CHIEF"],
    build: () => {
      const me = nd("me", "C1", "執案者 C1");
      const chain = [nd("u1", "S2", "直屬主管 S2"), nd("u2", "CHIEF", "首席顧問")];
      return { fee: FEE, promoter: me, executor: me, promoterChain: chain, executorChain: chain };
    },
  },
  {
    id: "ex2",
    title: "範例二　公司派案",
    law: "§4 範例二",
    desc: "公司官網導入客戶，指派 S1 執案，直屬主管為首席。推廣端全數歸公司。",
    fee: FEE,
    codes: ["S1", "CHIEF"],
    build: () => ({
      fee: FEE, isCompanyLead: true, promoter: null,
      executor: nd("me", "S1", "執案者 S1"),
      executorChain: [nd("u1", "CHIEF", "首席顧問")],
    }),
  },
  {
    id: "ex3",
    title: "範例三　平階案件",
    law: "§4 範例三",
    desc: "S3 自推自執，直屬主管同為 S3，其上為首席 —— 觸發平階輔導獎金。",
    fee: FEE,
    codes: ["S3", "CHIEF"],
    build: () => {
      const me = nd("me", "S3", "執案者 S3");
      const chain = [nd("u1", "S3", "直屬主管 S3・平階"), nd("u2", "CHIEF", "首席顧問")];
      return { fee: FEE, promoter: me, executor: me, promoterChain: chain, executorChain: chain };
    },
  },
  {
    id: "apxA",
    title: "附錄 A　倒掛結構",
    law: "附錄 A",
    desc: "同業招募核定 S3 者執案，直屬主管為 S1（職級較低），由首席依差額續算。",
    fee: FEE,
    codes: ["S3", "S1", "CHIEF"],
    build: () => {
      const me = nd("me", "S3", "執案者 S3");
      const chain = [nd("u1", "S1", "直屬主管 S1・倒掛"), nd("u2", "CHIEF", "首席顧問")];
      return { fee: FEE, promoter: me, executor: me, promoterChain: chain, executorChain: chain };
    },
  },
  {
    id: "apxB",
    title: "附錄 B　推廣與執案分屬不同人",
    law: "附錄 B",
    desc: "C1 開發客戶後轉由鏈上層 S3 執案；推廣端依 C1 的鏈、執案端依 S3 的鏈分配。",
    fee: FEE,
    codes: ["C1", "S2", "S3", "CHIEF"],
    build: () => ({
      fee: FEE,
      promoter: nd("p", "C1", "推廣者 C1"),
      promoterChain: [nd("u1", "S2", "S2"), nd("me", "S3", "執案者 S3"), nd("u2", "CHIEF", "首席顧問")],
      executor: nd("me", "S3", "執案者 S3"),
      executorChain: [nd("u2", "CHIEF", "首席顧問")],
    }),
  },
  {
    id: "apxC",
    title: "附錄 C　輔導鏈不完整",
    law: "附錄 C",
    desc: "公司直接招募的 S1 自推自執，其上無直屬主管，未分配差額歸公司。",
    fee: FEE,
    codes: ["S1"],
    build: () => {
      const me = nd("me", "S1", "執案者 S1");
      return { fee: FEE, promoter: me, executor: me, promoterChain: [], executorChain: [] };
    },
  },
  {
    id: "apxD",
    title: "附錄 D　認證顧問代管",
    law: "附錄 D",
    desc: "C2 招募平階 C2，推薦人未晉升 S1，由其直屬主管 S1 代管（推薦人不在有效鏈上）。",
    fee: FEE,
    codes: ["C2", "S1", "CHIEF"],
    build: () => {
      const me = nd("me", "C2", "被招募的 C2");
      const chain = [nd("u1", "S1", "代管者 S1"), nd("u2", "CHIEF", "首席顧問")];
      return { fee: FEE, promoter: me, executor: me, promoterChain: chain, executorChain: chain };
    },
  },
];

/** 目前的職級表是否足以跑這個情境（改過職級代號時用來擋掉誤導的數字）。 */
export function isApplicable(s: Scenario, params: CompParams): boolean {
  const codes = new Set(params.ranks.map((r) => r.code));
  return s.codes.every((c) => codes.has(c));
}
