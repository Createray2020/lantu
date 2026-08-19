"use client";

// 業務制度後台的編輯器（九個分頁）。
//
// 兩個貫穿全頁的設計：
// 1.「留空＝未設定」：數字欄清空時把 key 從 settings 物件刪掉，而不是寫 0。
//    畫面用虛線框＋「未設定」標記讓人一眼看出哪些還沒填。
// 2. 一律受控元件：Server Action 存檔後 revalidate 回傳新 RSC，
//    uncontrolled input 的實際值不會被 React 同步過去（會彈回舊值，看起來像存不進去）。
//    這個坑在 /admin 職級選單踩過一次，這裡從頭就用受控 state ＋ 明確存檔回饋。

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TABS, type Field, type TabSpec } from "./spec";
import {
  clearAllAction, createVersionAction, loadV4Action, publishVersionAction,
  saveRanksAction, saveSettingsAction, saveThresholdsAction, saveVersionMetaAction,
} from "./actions";
import type { CompParams, CompSettings, RankRow, ThresholdKind, ThresholdRow } from "@/lib/comp/types";
import { splitCase } from "@/lib/comp/engine";
import { SCENARIOS, isApplicable } from "@/lib/comp/scenarios";

type VersionLite = {
  id: string; version: string; status: string;
  effectiveFrom: string | null; changeNote: string | null;
};

const INPUT =
  "bg-[#0d2b45] rounded px-2 py-1 text-sm text-[#eef2f7] outline-none focus:border-[#e0bd8b]";
const FILLED = `${INPUT} border border-white/15`;
const EMPTY = `${INPUT} border border-dashed border-[#3d5b78] text-[#8fa6ba]`;
const BTN =
  "rounded-lg px-3 py-1.5 text-sm border border-white/15 text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-40";
const BTN_SOLID =
  "rounded-lg px-3 py-1.5 text-sm bg-[#1d5c8a] border border-[#2b7cb5] text-white hover:bg-[#226ba0] disabled:opacity-40";

function fmtInt(n: number | null | undefined) {
  return n === null || n === undefined ? "" : String(n);
}

export default function SystemEditor({
  versionId, versions, initial,
}: {
  versionId: string;
  versions: VersionLite[];
  initial: CompParams;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(TABS[0].id);
  const [settings, setSettings] = useState<CompSettings>(initial.settings ?? {});
  const [ranks, setRanks] = useState<RankRow[]>(initial.ranks ?? []);
  const [ths, setThs] = useState<ThresholdRow[]>(initial.thresholds ?? []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const spec = TABS.find((t) => t.id === tab)!;
  const params: CompParams = useMemo(
    () => ({ versionId, settings, ranks, thresholds: ths }),
    [versionId, settings, ranks, ths],
  );
  const current = versions.find((v) => v.id === versionId);
  const editable = current?.status !== "archived";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "失敗" });
      if (r.ok) router.refresh();
    });
  }

  function setKey<K extends keyof CompSettings>(key: K, val: CompSettings[K] | undefined) {
    setSettings((s) => {
      const next = { ...s };
      if (val === undefined || val === ("" as unknown as CompSettings[K])) delete next[key];
      else next[key] = val;
      return next;
    });
  }

  const rankCodes = ranks.map((r) => r.code).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* 版本列 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#0d2b45] px-4 py-3">
        <span className="text-xs text-[#a9bccf]">制度版本</span>
        <select
          value={versionId}
          onChange={(e) => router.push(`/admin/system?v=${e.target.value}`)}
          className={FILLED}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.version}（{v.status === "active" ? "生效中" : v.status === "draft" ? "草稿" : "已封存"}）
            </option>
          ))}
        </select>
        {!editable && (
          <span className="text-xs text-[#e0bd8b]">已封存版本為唯讀 —— 它是舊案分潤的依據</span>
        )}
        <div className="flex-1" />
        <Link href="/admin/system/simulator" className={BTN}>
          分潤試算器 →
        </Link>
        <button
          type="button"
          disabled={pending || !editable}
          onClick={() => run(() => loadV4Action(versionId), "已載入 V4 辦法數值（只填空白欄位）")}
          className={BTN}
        >
          載入 V4 辦法數值
        </button>
        <button
          type="button"
          disabled={pending || !editable}
          onClick={() => {
            if (confirm("確定把這個版本的所有數字清空？（開關與職級表也會一併清掉）")) {
              run(() => clearAllAction(versionId), "已全部清空");
            }
          }}
          className={BTN}
        >
          全部清空
        </button>
      </div>

      {/* 分頁 */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm border ${
              t.id === tab
                ? "bg-[#1d5c8a] border-[#2b7cb5] text-white"
                : "border-white/10 text-[#a9bccf] hover:bg-[#12334f]"
            }`}
          >
            <span className="opacity-60 mr-1">{i + 1}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* 內容 */}
      <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold">{spec.label}</h2>
          <p className="text-xs text-[#7f9ab2] mt-0.5">對應辦法{spec.law}</p>
          {spec.intro && <p className="text-sm text-[#a9bccf] mt-2 leading-relaxed">{spec.intro}</p>}
        </div>

        {spec.custom === "ranks" && (
          <RanksTable rows={ranks} setRows={setRanks} disabled={!editable || pending} />
        )}
        {spec.custom === "promotion" && (
          <>
            <ThresholdTable
              title="A 軌：個人路徑（第十一條）"
              kind="promotion_a"
              rows={ths} setRows={setThs} codes={rankCodes} disabled={!editable || pending}
              cols={{ team: false, mentor: false }}
            />
            <ThresholdTable
              title="B 軌：個人＋團隊路徑（第十二條）"
              note="A、B 兩軌擇一達成即可晉升。團隊門檻留空＝該階不開放 B 軌。"
              kind="promotion_b"
              rows={ths} setRows={setThs} codes={rankCodes} disabled={!editable || pending}
              cols={{ team: true, mentor: true }}
            />
          </>
        )}
        {spec.custom === "tenure" && (
          <ThresholdTable
            title="真除門檻表（第十五條）"
            note="核定職級為此表所列者，須於真除期間內達成；未達成時依實際完成度認階轉正。"
            kind="tenure"
            rows={ths} setRows={setThs} codes={rankCodes} disabled={!editable || pending}
            cols={{ team: false, mentor: true, from: false }}
          />
        )}
        {spec.custom === "versions" && (
          <VersionsPanel
            versions={versions} versionId={versionId} pending={pending} run={run}
          />
        )}

        {spec.sections.map((sec) => (
          <section key={sec.title} className="mt-6 first:mt-0">
            <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-1">
              {sec.title}
            </h3>
            {sec.note && <p className="text-xs text-[#7f9ab2] mb-2">{sec.note}</p>}
            <div className="grid gap-2 md:grid-cols-2">
              {sec.fields.map((f) => (
                <FieldRow
                  key={f.key as string}
                  field={f}
                  value={settings[f.key]}
                  onChange={(v) => setKey(f.key, v as never)}
                  codes={rankCodes}
                  disabled={!editable || pending}
                />
              ))}
            </div>
          </section>
        ))}

        {/* 存檔列 */}
        <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            disabled={pending || !editable}
            onClick={() => {
              if (spec.custom === "ranks") {
                run(() => saveRanksAction(versionId, ranks), "職級表已儲存");
              } else if (spec.custom === "promotion") {
                run(async () => {
                  const a = await saveThresholdsAction(versionId, "promotion_a", ths.filter((t) => t.kind === "promotion_a"));
                  if (!a.ok) return a;
                  return saveThresholdsAction(versionId, "promotion_b", ths.filter((t) => t.kind === "promotion_b"));
                }, "晉升門檻已儲存");
              } else if (spec.custom === "tenure") {
                run(async () => {
                  const t = await saveThresholdsAction(versionId, "tenure", ths.filter((x) => x.kind === "tenure"));
                  if (!t.ok) return t;
                  return saveSettingsAction(versionId, settings);
                }, "真除設定已儲存");
              } else {
                run(() => saveSettingsAction(versionId, settings), "已儲存");
              }
            }}
            className={BTN_SOLID}
          >
            {pending ? "存檔中…" : "儲存這一頁"}
          </button>
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-[#7fb894]" : "text-[#e08b7a]"}`}>
              {msg.ok ? `${msg.text} ✓` : `儲存失敗：${msg.text}`}
            </span>
          )}
        </div>

        {(spec.custom === "ranks" || spec.id === "rules" || spec.id === "split") && (
          <LiveCheck params={params} />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────── 單一欄位 ────────────────────────── */

function FieldRow({
  field, value, onChange, codes, disabled,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  codes: string[];
  disabled: boolean;
}) {
  const unset = value === undefined || value === null || value === "";
  const cls = unset ? EMPTY : FILLED;

  function numInput(unit?: string) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="any"
          value={value === undefined || value === null ? "" : String(value)}
          disabled={disabled}
          placeholder="未設定"
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? undefined : Number(raw));
          }}
          className={`${cls} w-28`}
        />
        {unit && <span className="text-xs text-[#7f9ab2]">{unit}</span>}
      </div>
    );
  }

  return (
    <label className="flex items-start justify-between gap-3 rounded-lg bg-[#0a2138] border border-white/5 px-3 py-2">
      <span className="text-sm text-[#cfdcea] leading-snug pt-1">
        {field.label}
        {field.hint && <span className="block text-[11px] text-[#6f869c]">{field.hint}</span>}
      </span>
      <span className="shrink-0">
        {field.type === "bool" && (
          <input
            type="checkbox"
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? true : false)}
            className="mt-1.5 h-4 w-4 accent-[#2b7cb5]"
          />
        )}
        {(field.type === "num" || field.type === "pct" || field.type === "money") &&
          numInput(field.type === "pct" ? "%" : field.type === "money" ? "元" : field.unit)}
        {field.type === "mmdd" && (
          <input
            type="text"
            value={(value as string) ?? ""}
            placeholder="MM-DD"
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={`${cls} w-28`}
          />
        )}
        {field.type === "text" && (
          <input
            type="text"
            value={(value as string) ?? ""}
            placeholder="未設定"
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={`${cls} w-56`}
          />
        )}
        {field.type === "select" && (
          <select
            value={(value as string) ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={`${cls} w-44`}
          >
            <option value="">未設定</option>
            {field.options?.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
        )}
        {field.type === "rank" && (
          <select
            value={(value as string) ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={`${cls} w-32`}
          >
            <option value="">未設定</option>
            {codes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {field.type === "list" && (
          <textarea
            rows={Math.max(2, ((value as string[]) ?? []).length + 1)}
            value={((value as string[]) ?? []).join("\n")}
            placeholder="一行一項；留空＝未設定"
            disabled={disabled}
            onChange={(e) => {
              const arr = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
              onChange(arr.length ? arr : undefined);
            }}
            className={`${cls} w-64 leading-snug`}
          />
        )}
      </span>
    </label>
  );
}

/* ────────────────────────── 職級表 ────────────────────────── */

function RanksTable({
  rows, setRows, disabled,
}: {
  rows: RankRow[];
  setRows: (f: (r: RankRow[]) => RankRow[]) => void;
  disabled: boolean;
}) {
  function upd(i: number, patch: Partial<RankRow>) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  }
  function move(i: number, d: number) {
    setRows((rs) => {
      const n = [...rs];
      const j = i + d;
      if (j < 0 || j >= n.length) return n;
      [n[i], n[j]] = [n[j], n[i]];
      return n.map((r, k) => ({ ...r, seq: k + 1 }));
    });
  }

  // 序必須遞增，否則差％會出現負值；這裡只提示不擋，讓人先看到問題再決定。
  const warn = rows.some((r, i) => {
    const p = rows[i - 1];
    if (!p) return false;
    const a = (r.promoPct ?? 0) < (p.promoPct ?? 0);
    const b = (r.execPct ?? 0) < (p.execPct ?? 0);
    return a || b;
  });

  const cell = "px-2 py-1.5 border-t border-white/8";
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
              <th className="px-2 py-2">序</th>
              <th className="px-2 py-2">職級群組</th>
              <th className="px-2 py-2">階</th>
              <th className="px-2 py-2">代號</th>
              <th className="px-2 py-2">推廣端 %</th>
              <th className="px-2 py-2">執案端 %</th>
              <th className="px-2 py-2">合計</th>
              <th className="px-2 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const total = (r.promoPct ?? 0) + (r.execPct ?? 0);
              const both = r.promoPct !== null && r.promoPct !== undefined
                && r.execPct !== null && r.execPct !== undefined;
              return (
                <tr key={i}>
                  <td className={`${cell} text-[#7f9ab2]`}>{i + 1}</td>
                  <td className={cell}>
                    <input value={r.groupName ?? ""} disabled={disabled} placeholder="未設定"
                      onChange={(e) => upd(i, { groupName: e.target.value || null })}
                      className={`${r.groupName ? FILLED : EMPTY} w-28`} />
                  </td>
                  <td className={cell}>
                    <input value={r.tierLabel ?? ""} disabled={disabled} placeholder="—"
                      onChange={(e) => upd(i, { tierLabel: e.target.value || null })}
                      className={`${r.tierLabel ? FILLED : EMPTY} w-16`} />
                  </td>
                  <td className={cell}>
                    <input value={r.code ?? ""} disabled={disabled} placeholder="必填"
                      onChange={(e) => upd(i, { code: e.target.value.trim() })}
                      className={`${r.code ? FILLED : EMPTY} w-20 font-mono`} />
                  </td>
                  <td className={cell}>
                    <input type="number" step="any" value={fmtInt(r.promoPct)} disabled={disabled} placeholder="未設定"
                      onChange={(e) => upd(i, { promoPct: e.target.value === "" ? null : Number(e.target.value) })}
                      className={`${r.promoPct == null ? EMPTY : FILLED} w-20`} />
                  </td>
                  <td className={cell}>
                    <input type="number" step="any" value={fmtInt(r.execPct)} disabled={disabled} placeholder="未設定"
                      onChange={(e) => upd(i, { execPct: e.target.value === "" ? null : Number(e.target.value) })}
                      className={`${r.execPct == null ? EMPTY : FILLED} w-20`} />
                  </td>
                  <td className={`${cell} text-[#a9bccf]`}>{both ? `${total}%` : "—"}</td>
                  <td className={`${cell} text-right whitespace-nowrap`}>
                    <button type="button" disabled={disabled} onClick={() => move(i, -1)} className="px-1 text-[#a9bccf] disabled:opacity-30">↑</button>
                    <button type="button" disabled={disabled} onClick={() => move(i, 1)} className="px-1 text-[#a9bccf] disabled:opacity-30">↓</button>
                    <button type="button" disabled={disabled}
                      onClick={() => setRows((rs) => rs.filter((_, k) => k !== i).map((x, k) => ({ ...x, seq: k + 1 })))}
                      className="px-1 text-[#e08b7a] disabled:opacity-30">刪</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[#6f869c]">
                尚未設定任何職級。按上方「載入 V4 辦法數值」可帶入辦法的七個職級。
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={disabled} className={BTN}
          onClick={() => setRows((rs) => [...rs, { code: "", seq: rs.length + 1, promoPct: null, execPct: null }])}>
          ＋ 新增職級
        </button>
        {warn && (
          <span className="text-xs text-[#e0bd8b]">
            提醒：有職級的分潤率低於前一階，差％會出現無法向上續算的斷點。
          </span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────── 門檻表 ────────────────────────── */

function ThresholdTable({
  title, note, kind, rows, setRows, codes, disabled, cols,
}: {
  title: string;
  note?: string;
  kind: ThresholdKind;
  rows: ThresholdRow[];
  setRows: (f: (r: ThresholdRow[]) => ThresholdRow[]) => void;
  codes: string[];
  disabled: boolean;
  cols: { team: boolean; mentor: boolean; from?: boolean };
}) {
  const showFrom = cols.from !== false;
  const mine = rows.map((r, idx) => ({ r, idx })).filter((x) => x.r.kind === kind);

  function upd(idx: number, patch: Partial<ThresholdRow>) {
    setRows((rs) => rs.map((r, k) => (k === idx ? { ...r, ...patch } : r)));
  }
  const cell = "px-2 py-1.5 border-t border-white/8";
  const numCls = (v: number | null | undefined) => `${v == null ? EMPTY : FILLED} w-24`;

  return (
    <section className="mt-6 first:mt-0">
      <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-1">{title}</h3>
      {note && <p className="text-xs text-[#7f9ab2] mb-2">{note}</p>}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
              {showFrom && <th className="px-2 py-2">起始職級</th>}
              <th className="px-2 py-2">{showFrom ? "晉升至" : "核定職級"}</th>
              <th className="px-2 py-2">個案數</th>
              <th className="px-2 py-2">顧問費</th>
              {cols.team && <th className="px-2 py-2">團隊業績</th>}
              {cols.mentor && <th className="px-2 py-2">育成條件</th>}
              <th className="px-2 py-2">啟用</th>
              <th className="px-2 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {mine.map(({ r, idx }) => (
              <tr key={idx}>
                {showFrom && (
                  <td className={cell}>
                    <select value={r.fromCode ?? ""} disabled={disabled}
                      onChange={(e) => upd(idx, { fromCode: e.target.value || null })}
                      className={`${r.fromCode ? FILLED : EMPTY} w-24`}>
                      <option value="">—</option>
                      {codes.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                )}
                <td className={cell}>
                  <select value={r.toCode ?? ""} disabled={disabled}
                    onChange={(e) => upd(idx, { toCode: e.target.value })}
                    className={`${r.toCode ? FILLED : EMPTY} w-24`}>
                    <option value="">必選</option>
                    {codes.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className={cell}>
                  <input type="number" value={fmtInt(r.cases)} disabled={disabled} placeholder="未設定"
                    onChange={(e) => upd(idx, { cases: e.target.value === "" ? null : Number(e.target.value) })}
                    className={numCls(r.cases)} />
                </td>
                <td className={cell}>
                  <input type="number" value={fmtInt(r.fees)} disabled={disabled} placeholder="未設定"
                    onChange={(e) => upd(idx, { fees: e.target.value === "" ? null : Number(e.target.value) })}
                    className={`${r.fees == null ? EMPTY : FILLED} w-32`} />
                </td>
                {cols.team && (
                  <td className={cell}>
                    <input type="number" value={fmtInt(r.teamCases)} disabled={disabled} placeholder="未設定"
                      onChange={(e) => upd(idx, { teamCases: e.target.value === "" ? null : Number(e.target.value) })}
                      className={numCls(r.teamCases)} />
                  </td>
                )}
                {cols.mentor && (
                  <td className={cell}>
                    <div className="flex items-center gap-1">
                      <input type="number" value={fmtInt(r.mentorCount)} disabled={disabled} placeholder="—"
                        onChange={(e) => upd(idx, { mentorCount: e.target.value === "" ? null : Number(e.target.value) })}
                        className={`${r.mentorCount == null ? EMPTY : FILLED} w-14`} />
                      <span className="text-xs text-[#7f9ab2]">位</span>
                      <select value={r.mentorRankCode ?? ""} disabled={disabled}
                        onChange={(e) => upd(idx, { mentorRankCode: e.target.value || null })}
                        className={`${r.mentorRankCode ? FILLED : EMPTY} w-20`}>
                        <option value="">—</option>
                        {codes.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span className="text-xs text-[#7f9ab2]">以上</span>
                    </div>
                  </td>
                )}
                <td className={cell}>
                  <input type="checkbox" checked={r.enabled !== false} disabled={disabled}
                    onChange={(e) => upd(idx, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-[#2b7cb5]" />
                </td>
                <td className={`${cell} text-right`}>
                  <button type="button" disabled={disabled}
                    onClick={() => setRows((rs) => rs.filter((_, k) => k !== idx))}
                    className="px-1 text-[#e08b7a] disabled:opacity-30">刪</button>
                </td>
              </tr>
            ))}
            {mine.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-[#6f869c]">
                尚未設定門檻 —— 這一軌目前不啟用（引擎會跳過，不會擋人）。
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" disabled={disabled} className={`${BTN} mt-2`}
        onClick={() => setRows((rs) => [...rs, { kind, toCode: "", seq: rs.filter((x) => x.kind === kind).length + 1, enabled: true }])}>
        ＋ 新增一列
      </button>
    </section>
  );
}

/* ────────────────────────── 版本管理 ────────────────────────── */

function VersionsPanel({
  versions, versionId, pending, run,
}: {
  versions: VersionLite[];
  versionId: string;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;
}) {
  const cur = versions.find((v) => v.id === versionId);
  const [name, setName] = useState(cur?.version ?? "");
  const [eff, setEff] = useState(cur?.effectiveFrom ?? "");
  const [note, setNote] = useState(cur?.changeNote ?? "");
  const [newName, setNewName] = useState("");

  const cell = "px-2 py-1.5 border-t border-white/8";
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
              <th className="px-2 py-2">版本</th><th className="px-2 py-2">生效日</th>
              <th className="px-2 py-2">狀態</th><th className="px-2 py-2">修訂重點</th>
              <th className="px-2 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className={v.id === versionId ? "bg-[#12334f]/40" : ""}>
                <td className={`${cell} font-semibold`}>{v.version}</td>
                <td className={`${cell} text-[#a9bccf]`}>{v.effectiveFrom || "—"}</td>
                <td className={cell}>
                  <span className={v.status === "active" ? "text-[#7fb894]" : v.status === "draft" ? "text-[#e0bd8b]" : "text-[#6f869c]"}>
                    {v.status === "active" ? "生效中" : v.status === "draft" ? "草稿" : "已封存"}
                  </span>
                </td>
                <td className={`${cell} text-[#a9bccf] max-w-[280px] truncate`}>{v.changeNote || "—"}</td>
                <td className={`${cell} text-right whitespace-nowrap`}>
                  {v.status === "draft" && (
                    <button type="button" disabled={pending} className={BTN}
                      onClick={() => {
                        if (confirm(`確定把「${v.version}」發布為生效版？目前生效中的版本會轉為已封存。`))
                          run(() => publishVersionAction(v.id), "已發布為生效版");
                      }}>
                      發布
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section>
        <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">目前版本資訊</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="版本名稱（如 V4.0）"
            className={`${FILLED} w-40`} />
          <input value={eff ?? ""} onChange={(e) => setEff(e.target.value)} placeholder="生效日 YYYY-MM-DD"
            className={`${eff ? FILLED : EMPTY} w-44`} />
          <input value={note ?? ""} onChange={(e) => setNote(e.target.value)} placeholder="修訂重點"
            className={`${note ? FILLED : EMPTY} flex-1 min-w-[220px]`} />
          <button type="button" disabled={pending} className={BTN_SOLID}
            onClick={() => run(
              () => saveVersionMetaAction(versionId, { version: name, effectiveFrom: eff || null, changeNote: note || null }),
              "版本資訊已儲存",
            )}>
            儲存版本資訊
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">建立新版本</h3>
        <p className="text-xs text-[#7f9ab2] mb-2">
          新版本會完整複製目前版本的職級、門檻與參數，先以草稿存在，可先試算；發布後才成為新案件的計算依據，已結案件不受影響。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新版本名稱（如 V5.0）"
            className={`${newName ? FILLED : EMPTY} w-48`} />
          <button type="button" disabled={pending || !newName.trim()} className={BTN}
            onClick={() => run(
              () => createVersionAction({ version: newName.trim(), copyFromId: versionId }),
              `已建立草稿版「${newName.trim()}」`,
            )}>
            複製目前版本為新草稿
          </button>
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────── 即時驗算 ────────────────────────── */

function LiveCheck({ params }: { params: CompParams }) {
  const results = useMemo(
    () =>
      SCENARIOS.map((s) => {
        if (!isApplicable(s, params)) return { s, res: null };
        return { s, res: splitCase(s.build(), params) };
      }),
    [params],
  );
  const runnable = results.filter((r) => r.res);
  const bad = runnable.filter((r) => !r.res!.balanced);

  return (
    <div className="mt-6 rounded-lg border border-white/10 bg-[#0a2138] p-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-bold">即時驗算</h3>
        <span className="text-xs text-[#7f9ab2]">
          用辦法的七個範例即時重跑目前設定（尚未存檔的改動也算在內）
        </span>
        <div className="flex-1" />
        {runnable.length === 0 ? (
          <span className="text-xs text-[#6f869c]">職級表尚未涵蓋範例所需代號</span>
        ) : bad.length === 0 ? (
          <span className="text-xs text-[#7fb894]">全部加總 100% ✓</span>
        ) : (
          <span className="text-xs text-[#e08b7a]">{bad.length} 個範例加總不等於 100%</span>
        )}
      </div>
      <div className="grid gap-1.5 md:grid-cols-2">
        {results.map(({ s, res }) => (
          <div key={s.id} className="rounded-md bg-[#0d2b45] px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#cfdcea]">{s.title}</span>
              <div className="flex-1" />
              {!res ? (
                <span className="text-[#6f869c]">不適用</span>
              ) : res.balanced ? (
                <span className="text-[#7fb894]">100% ✓</span>
              ) : (
                <span className="text-[#e08b7a]">{res.totalPct}%</span>
              )}
            </div>
            {res && (
              <div className="mt-1 text-[#8fa6ba] leading-relaxed">
                {res.lines.map((l, i) => (
                  <span key={i} className="mr-2 whitespace-nowrap">
                    {l.name} <b className="text-[#cfdcea]">{l.totalPct}%</b>
                  </span>
                ))}
              </div>
            )}
            {res && res.warnings.length > 0 && (
              <div className="mt-1 text-[#e0bd8b]">{res.warnings.join("；")}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export type { TabSpec };
