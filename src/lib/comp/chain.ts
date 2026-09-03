// 業務制度：有效輔導鏈的解析。
//
// 引擎（splitCase）只吃「已經解析好的鏈」，代管、離職歸屬這類人事規則全部在這一層處理。
// 這樣分是刻意的：分潤的算術要能被辦法逐條驗證，人事規則變動不該讓算術跟著重寫。
//
// 代管（辦法第九條）：
//   C1–C3 顧問招募之平階或更高階顧問，於推薦人晉升 S1 前，
//   由推薦人之直屬主管（S1 以上）代管；代管期間差％與平階獎金均依代管者計算，
//   推薦人本人此期間不計分潤、也不計團隊輔導業績（附錄 D）。

import type { ChainNode } from "./engine";
import type { CompParams } from "./types";

export type AdvisorRow = {
  id: string;
  name?: string | null;
  rankCode?: string | null;
  uplineId?: string | null;
  status?: string | null;
};

export type ResolvedChain = {
  /** 執案者（或推廣者）本人 */
  self: ChainNode;
  /** 由下而上的有效輔導鏈，不含本人 */
  chain: ChainNode[];
  /** 因代管而被略過的層（畫面上要說得出「為什麼這個人沒分到」） */
  skipped: { id: string; name: string; rankCode: string; reason: string }[];
};

/** 職級序（seq）查表；查不到回 -1（未設定職級的人一律視為最低）。 */
export function seqOf(params: CompParams, code: string | null | undefined): number {
  if (!code) return -1;
  const r = params.ranks.find((x) => x.code === code);
  return r ? r.seq : -1;
}

function toNode(a: AdvisorRow): ChainNode {
  return { id: a.id, rankCode: a.rankCode ?? "", name: a.name || a.id };
}

/**
 * 解析某位顧問的有效輔導鏈。
 * @param advisors 全組織名單（用 uplineId 串成樹）
 */
export function resolveChain(
  advisorId: string,
  advisors: AdvisorRow[],
  params: CompParams,
): ResolvedChain | null {
  const byId = new Map(advisors.map((a) => [a.id, a]));
  const me = byId.get(advisorId);
  if (!me) return null;

  const s = params.settings;
  const custodyMin = s.custodyMinRankCode ? seqOf(params, s.custodyMinRankCode) : -1;
  const useCustodian = s.custodyUseCustodian !== false;
  const mySeq = seqOf(params, me.rankCode);

  const chain: ChainNode[] = [];
  const skipped: ResolvedChain["skipped"] = [];
  const seen = new Set<string>([me.id]);

  let cur = me.uplineId ? byId.get(me.uplineId) : undefined;
  let level = 0;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const curSeq = seqOf(params, cur.rankCode);

    // 代管只發生在「直屬主管（推薦人）」這一層：
    // 推薦人職級未達門檻，且被招募者與其平階或更高階 → 這一層讓給更上層代管。
    const isDirect = level === 0;
    const custody =
      useCustodian &&
      isDirect &&
      custodyMin >= 0 &&
      curSeq >= 0 &&
      curSeq < custodyMin &&
      mySeq >= curSeq;

    if (custody) {
      skipped.push({
        id: cur.id,
        name: cur.name || cur.id,
        rankCode: cur.rankCode ?? "",
        reason: `推薦人尚未晉升 ${s.custodyMinRankCode}，由其直屬主管代管（§9-2）；代管期間不計分潤與團隊業績`,
      });
    } else {
      chain.push(toNode(cur));
      level++;
    }
    cur = cur.uplineId ? byId.get(cur.uplineId) : undefined;
  }

  return { self: toNode(me), chain, skipped };
}

/** 這一案會計入哪些人的團隊輔導業績（§8、§13）：執案者的有效鏈，逐層向上。 */
export function teamCreditChain(
  executorId: string,
  advisors: AdvisorRow[],
  params: CompParams,
): string[] {
  const r = resolveChain(executorId, advisors, params);
  if (!r) return [];
  return params.settings.teamCreditEachLevel === false
    ? r.chain.slice(0, 1).map((n) => n.id)
    : r.chain.map((n) => n.id);
}

/** 直轄顧問（直接招募並輔導的下一層）。 */
export function directReports(coachId: string, advisors: AdvisorRow[]): AdvisorRow[] {
  return advisors.filter((a) => a.uplineId === coachId);
}
