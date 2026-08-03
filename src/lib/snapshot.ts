// 引擎轉接層：把 plan.data（v12 case）餵給移植引擎，算出快照與比較用指標。
// 只依賴 lib/engine（純函式），不碰 db/app/clerk。
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as EngineNS from "./engine";

const E: any = EngineNS;

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
  const c = E.newCase();
  c.profile = c.profile || {};
  c.profile.name = name;
  return c;
}

// 存檔時算的輕量快照（列表/卡片用）。
export function planSnapshot(data: unknown): { netWorth: number | null; healthGrade: string | null } {
  try {
    const m = E.metrics(data);
    const h = E.health(data);
    return { netWorth: Math.round(num(m?.net)), healthGrade: (h?.grade ?? null) as string | null };
  } catch {
    return { netWorth: null, healthGrade: null };
  }
}

export type PlanMetrics = {
  net: number;
  assetTotal: number;
  debtTotal: number;
  incTotal: number;
  expTotal: number;
  save: number;
  gap: number;
  grade: string | null;
  safety: number | null;
  freedom: number | null;
  vision: number | null;
};

// 版本比較用的完整指標。
export function planMetrics(data: unknown): PlanMetrics {
  try {
    const m = E.metrics(data) || {};
    const h = E.health(data) || {};
    let gap = 0;
    try { gap = num(E.totalGap(data)); } catch { gap = 0; }
    return {
      net: Math.round(num(m.net)),
      assetTotal: Math.round(num(m.assetTotal)),
      debtTotal: Math.round(num(m.debtTotal)),
      incTotal: Math.round(num(m.incTotal)),
      expTotal: Math.round(num(m.expTotal)),
      save: Math.round(num(m.save)),
      gap: Math.round(gap),
      grade: (h.grade ?? null) as string | null,
      safety: numOrNull(h.safety),
      freedom: numOrNull(h.freedom),
      vision: numOrNull(h.vision),
    };
  } catch {
    return { net: 0, assetTotal: 0, debtTotal: 0, incTotal: 0, expTotal: 0, save: 0, gap: 0, grade: null, safety: null, freedom: null, vision: null };
  }
}
