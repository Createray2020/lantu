// 制度版本差異對照（純函式）。
//
// 發布新版之前要看得到「這次改了哪些數字」。沒有這個畫面，
// 版本管理只是一個安心用的名詞——沒人知道按下發布之後制度到底變成什麼樣。

import type { CompParams, ModuleRow, RankRow, ThresholdRow } from "./types";
import { fmtMoney } from "@/lib/money";

export type Change = {
  /** 分類：讓畫面能照制度分頁分組 */
  group: string;
  label: string;
  before: string;
  after: string;
  kind: "added" | "removed" | "changed";
};

const UNSET = "未設定";

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return UNSET;
  if (typeof v === "boolean") return v ? "開" : "關";
  if (Array.isArray(v)) return v.length ? v.join("／") : UNSET;
  if (typeof v === "number") return fmtMoney(v);
  return String(v);
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  return (a ?? null) === (b ?? null);
}

function diffRecords<T extends Record<string, unknown>>(
  group: string,
  before: T[],
  after: T[],
  keyOf: (r: T) => string,
  labelOf: (r: T) => string,
  fields: { key: keyof T; label: string }[],
): Change[] {
  const out: Change[] = [];
  const bMap = new Map(before.map((r) => [keyOf(r), r]));
  const aMap = new Map(after.map((r) => [keyOf(r), r]));

  for (const [k, a] of aMap) {
    const b = bMap.get(k);
    if (!b) {
      out.push({ group, label: labelOf(a), before: "（無）", after: "新增", kind: "added" });
      continue;
    }
    for (const f of fields) {
      if (!same(b[f.key], a[f.key])) {
        out.push({
          group,
          label: `${labelOf(a)} · ${f.label}`,
          before: show(b[f.key]),
          after: show(a[f.key]),
          kind: "changed",
        });
      }
    }
  }
  for (const [k, b] of bMap) {
    if (!aMap.has(k)) {
      out.push({ group, label: labelOf(b), before: "存在", after: "已刪除", kind: "removed" });
    }
  }
  return out;
}

const THRESHOLD_KIND_LABEL: Record<string, string> = {
  promotion_a: "晉升 A 軌",
  promotion_b: "晉升 B 軌",
  tenure: "真除門檻",
};

/**
 * 比較兩個制度版本。
 * before 是目前生效版，after 是要發布的草稿版。
 */
export function diffParams(before: CompParams, after: CompParams): Change[] {
  const out: Change[] = [];

  // 單值參數與開關
  const keys = [...new Set([
    ...Object.keys(before.settings ?? {}),
    ...Object.keys(after.settings ?? {}),
  ])].sort();
  for (const k of keys) {
    const b = (before.settings as Record<string, unknown>)[k];
    const a = (after.settings as Record<string, unknown>)[k];
    if (!same(b, a)) {
      out.push({ group: "參數與開關", label: k, before: show(b), after: show(a), kind: "changed" });
    }
  }

  out.push(...diffRecords<ModuleRow & Record<string, unknown>>(
    "服務模塊",
    (before.modules ?? []) as (ModuleRow & Record<string, unknown>)[],
    (after.modules ?? []) as (ModuleRow & Record<string, unknown>)[],
    (m) => m.code,
    (m) => `${m.name}（${m.code}）`,
    [
      { key: "name", label: "名稱" },
      { key: "splitMode", label: "分潤模式" },
      { key: "splitPromoPct", label: "推廣端%" },
      { key: "splitExecPct", label: "執案端%" },
      { key: "flatExecPct", label: "執行者固定%" },
      { key: "flatPromoPct", label: "推廣者固定%" },
      { key: "price", label: "定價" },
      { key: "countPromotion", label: "計入晉升" },
      { key: "countMaintenance", label: "計入維持資格" },
      { key: "enabled", label: "啟用" },
    ],
  ));

  out.push(...diffRecords<RankRow & Record<string, unknown>>(
    "職級與分潤率",
    before.ranks as (RankRow & Record<string, unknown>)[],
    after.ranks as (RankRow & Record<string, unknown>)[],
    (r) => `${r.moduleCode ?? ""}|${r.code}`,
    (r) => (r.moduleCode ? `${r.code}（${r.moduleCode} 自訂）` : r.code),
    [
      { key: "seq", label: "序" },
      { key: "groupName", label: "群組" },
      { key: "tierLabel", label: "階" },
      { key: "promoPct", label: "推廣端%" },
      { key: "execPct", label: "執案端%" },
    ],
  ));

  out.push(...diffRecords<ThresholdRow & Record<string, unknown>>(
    "門檻",
    before.thresholds as (ThresholdRow & Record<string, unknown>)[],
    after.thresholds as (ThresholdRow & Record<string, unknown>)[],
    (t) => `${t.kind}|${t.toCode}`,
    (t) => `${THRESHOLD_KIND_LABEL[t.kind] ?? t.kind} → ${t.toCode}`,
    [
      { key: "fromCode", label: "起始職級" },
      { key: "cases", label: "個案數" },
      { key: "fees", label: "顧問費" },
      { key: "teamCases", label: "團隊業績" },
      { key: "mentorCount", label: "育成人數" },
      { key: "mentorRankCode", label: "育成職級" },
      { key: "enabled", label: "啟用" },
    ],
  ));

  return out;
}
