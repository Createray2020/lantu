// 引擎轉接層：把 plan.data（v12 case）餵給移植引擎，算出快照與比較用指標。
// 只依賴 lib/engine（純函式），不碰 db/app/clerk。
//
// 舊版是 `const E: any = EngineNS`，把整個引擎命名空間洗成 any → 編譯器對這條
// 「唯一會寫進 DB 的路徑」完全失效。改成具名 import，至少函式名打錯會被 tsc 抓到。
import { metrics, health, totalGap, newCase } from "./engine";

// plans.data 是無型別 jsonb，實際上可能是 null/空物件/舊結構；引擎對這些一律丟例外。
// 這裡先做最低限度的形狀檢查，判定「算不出來」時回 null，而不是讓 catch 把它變成 0。
function looksLikeCase(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  return !!c.profile && typeof c.profile === "object";
}

function num(v: unknown): number {
  const x = Number(v);
  return isNaN(x) ? 0 : x;
}
function numOrNull(v: unknown): number | null {
  const x = Number(v);
  return isNaN(x) ? null : Math.round(x);
}

// 新客戶的第一份空白案件（帶入姓名）。
export function newCaseData(name: string): unknown {
  const c = newCase() as Record<string, unknown>;
  const profile = (c.profile ?? {}) as Record<string, unknown>;
  profile.name = name;
  c.profile = profile;
  return c;
}

// 存檔時算的輕量快照（列表/卡片用）。
export function planSnapshot(data: unknown): { netWorth: number | null; healthGrade: string | null } {
  if (!looksLikeCase(data)) return { netWorth: null, healthGrade: null };
  try {
    const m = metrics(data);
    const h = health(data);
    return { netWorth: Math.round(num(m?.net)), healthGrade: (h?.grade ?? null) as string | null };
  } catch (e) {
    // 靜默吞掉會讓 health_grade 悄悄變 null 而沒人知道，至少留下 log。
    console.error("[planSnapshot] 無法計算", e);
    return { netWorth: null, healthGrade: null };
  }
}

// 所有數字欄位都可能是 null＝「算不出來」。
// 舊版失敗時回 net:0，版本比較頁會顯示「淨值 0 元」而不是「無法計算」，看不出資料壞掉。
export type PlanMetrics = {
  net: number | null;
  assetTotal: number | null;
  debtTotal: number | null;
  incTotal: number | null;
  expTotal: number | null;
  save: number | null;
  gap: number | null;
  grade: string | null;
  safety: number | null;
  freedom: number | null;
  vision: number | null;
};

const EMPTY_METRICS: PlanMetrics = {
  net: null, assetTotal: null, debtTotal: null, incTotal: null, expTotal: null,
  save: null, gap: null, grade: null, safety: null, freedom: null, vision: null,
};

// 版本比較用的完整指標。
export function planMetrics(data: unknown): PlanMetrics {
  if (!looksLikeCase(data)) return { ...EMPTY_METRICS };
  try {
    const m = metrics(data) || {};
    const h = health(data) || {};
    let gap: number | null = null;
    try { gap = Math.round(num(totalGap(data))); } catch { gap = null; }
    return {
      net: Math.round(num(m.net)),
      assetTotal: Math.round(num(m.assetTotal)),
      debtTotal: Math.round(num(m.debtTotal)),
      incTotal: Math.round(num(m.incTotal)),
      expTotal: Math.round(num(m.expTotal)),
      save: Math.round(num(m.save)),
      gap,
      grade: (h.grade ?? null) as string | null,
      safety: numOrNull(h.safety),
      freedom: numOrNull(h.freedom),
      vision: numOrNull(h.vision),
    };
  } catch (e) {
    console.error("[planMetrics] 無法計算", e);
    return { ...EMPTY_METRICS };
  }
}

/**
 * 一場諮詢的前後指標。摘要靠它算出「這次改善了多少」。
 *
 * ⚠️ 用 shortPV（現值缺口）當主指標，不是把各項缺口相加——
 *    「總缺口」的唯一定義是 projection() 的 shortPV，相加是錯的。
 *    shortPV 住在 metrics().proj 底下，不在 metrics() 頂層。
 */
export type SessionMetrics = { shortPV: number | null; net: number | null; gap: number | null };

export function sessionMetrics(data: unknown): SessionMetrics {
  if (!looksLikeCase(data)) return { shortPV: null, net: null, gap: null };
  try {
    const m = (metrics(data) ?? {}) as Record<string, unknown>;
    const proj = (m.proj ?? {}) as Record<string, unknown>;
    let gap: number | null = null;
    try { gap = Math.round(num(totalGap(data))); } catch { gap = null; }
    return { shortPV: Math.round(num(proj.shortPV)), net: Math.round(num(m.net)), gap };
  } catch (e) {
    console.error("[sessionMetrics] 無法計算", e);
    return { shortPV: null, net: null, gap: null };
  }
}
