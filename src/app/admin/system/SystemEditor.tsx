"use client";

// 業務制度後台的編輯器（九個分頁）。
//
// 兩個貫穿全頁的設計：
// 1.「留空＝未設定」：數字欄清空時把 key 從 settings 物件刪掉，而不是寫 0。
//    畫面用虛線框＋「未設定」標記讓人一眼看出哪些還沒填。
// 2. 一律受控元件：Server Action 存檔後 revalidate 回傳新 RSC，
//    uncontrolled input 的實際值不會被 React 同步過去（會彈回舊值，看起來像存不進去）。
//    這個坑在 /admin 職級選單踩過一次，這裡從頭就用受控 state ＋ 明確存檔回饋。

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TABS, type Field, type TabSpec } from "./spec";
import {
  clearAllAction, createVersionAction, diffVersionAction, loadV4Action, publishVersionAction,
  saveModulesAction, saveRanksAction, saveSettingsAction, saveThresholdsAction, saveVersionMetaAction,
} from "./actions";
import type { Change } from "@/lib/comp/diff";
import type {
  CompParams, CompSettings, ModuleRow, RankRow, ThresholdKind, ThresholdRow,
} from "@/lib/comp/types";
import { splitForModule } from "@/lib/comp/engine";
import { SCENARIOS, isApplicable } from "@/lib/comp/scenarios";

type VersionLite = {
  id: string; version: string; status: string;
  effectiveFrom: string | null; changeNote: string | null;
};

const INPUT =
  "bg-[#0d2b45] rounded px-2 py-1 text-sm text-[#eef2f7] outline-none focus:border-[#e0bd8b]";
const FILLED = `${INPUT} border border-white/15`;
import MoneyInput from "@/components/MoneyInput";

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
  const [mods, setMods] = useState<ModuleRow[]>(initial.modules ?? []);
  // 職級分頁正在編哪一組表：""＝預設表，其餘＝模塊代號。
  const [rankModule, setRankModule] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const spec = TABS.find((t) => t.id === tab)!;
  const params: CompParams = useMemo(
    () => ({ versionId, settings, ranks, thresholds: ths, modules: mods }),
    [versionId, settings, ranks, ths, mods],
  );
  const current = versions.find((v) => v.id === versionId);
  const editable = current?.status !== "archived";

  // 有沒有還沒存的改動。用「跟載進來的那份比對」而不是各處埋旗標——
  // 漏掉一個 setter 就等於漏掉一次警告，而這裡寧可多問一次也不要靜靜丟掉東西。
  const dirty = useMemo(
    () =>
      JSON.stringify({ settings, ranks, thresholds: ths, modules: mods }) !==
      JSON.stringify({
        settings: initial.settings ?? {},
        ranks: initial.ranks ?? [],
        thresholds: initial.thresholds ?? [],
        modules: initial.modules ?? [],
      }),
    [settings, ranks, ths, mods, initial],
  );

  /**
   * 一次把整個版本的設定都送出。
   *
   * ⚠️ 舊寫法是「只存當前分頁那一種」：在「晉升」頁改了門檻、切到「真除」頁再按儲存，
   *    晉升那些改動就無聲無息地不見了（state 還在畫面上，看起來像存過了）。
   *    分頁只是版面的分組，資料是同一份 —— 存就整份存。
   */
  async function saveAll(): Promise<{ ok: boolean; error?: string }> {
    const m = await saveModulesAction(versionId, mods);
    if (!m.ok) return m;

    // 職級表依 moduleCode 分區覆寫：預設表（""）與每個有自訂表的模塊都要各存一次。
    const scopes = [...new Set(ranks.map((r) => r.moduleCode ?? ""))];
    if (!scopes.includes("")) scopes.push("");
    for (const scope of scopes) {
      const r = await saveRanksAction(
        versionId,
        ranks.filter((x) => (x.moduleCode ?? "") === scope),
        scope,
      );
      if (!r.ok) return r;
    }

    const kinds: ThresholdKind[] = ["promotion_a", "promotion_b", "tenure"];
    for (const kind of kinds) {
      const r = await saveThresholdsAction(versionId, kind, ths.filter((x) => x.kind === kind));
      if (!r.ok) return r;
    }

    return saveSettingsAction(versionId, settings);
  }

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

  // 門檻表與各種職級下拉一律以「預設表」為準：模塊自訂表只換分潤率，不該長出新職級。
  const rankCodes = [...new Set(ranks.filter((r) => !(r.moduleCode ?? "")).map((r) => r.code))].filter(Boolean);
  const rankRowsOfModule = ranks.filter((r) => (r.moduleCode ?? "") === rankModule);

  return (
    <div className="space-y-4">
      {/* 版本列 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#0d2b45] px-4 py-3">
        <span className="text-xs text-[#a9bccf]">制度版本</span>
        <select
          value={versionId}
          // 換版本＝整頁重載，state 裡沒存的東西全部消失。先問一句。
          onChange={(e) => {
            const next = e.target.value;
            if (next === versionId) return;
            if (dirty && !confirm("這個版本有還沒儲存的變更，切換版本會把它們丟掉。確定要切換？")) return;
            router.push(`/admin/system?v=${next}`);
          }}
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

        {spec.custom === "modules" && (
          <ModulesTable rows={mods} setRows={setMods} disabled={!editable || pending} />
        )}
        {spec.custom === "ranks" && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#a9bccf]">正在編輯</span>
              <select value={rankModule} onChange={(e) => setRankModule(e.target.value)}
                className={FILLED}>
                <option value="">預設表（所有模塊的 fallback）</option>
                {mods.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}（{m.code}）自訂表
                  </option>
                ))}
              </select>
              {rankModule && rankRowsOfModule.length === 0 && (
                <span className="text-xs text-[#e0bd8b]">
                  這個模塊還沒有自訂表 —— 目前沿用預設表。按下方「複製預設表」再改。
                </span>
              )}
              {rankModule && (
                <button type="button" disabled={!editable || pending} className={BTN}
                  onClick={() => setRanks((rs) => [
                    ...rs.filter((r) => (r.moduleCode ?? "") !== rankModule),
                    ...rs.filter((r) => !(r.moduleCode ?? "")).map((r) => ({ ...r, moduleCode: rankModule })),
                  ])}>
                  複製預設表到這個模塊
                </button>
              )}
              {rankModule && rankRowsOfModule.length > 0 && (
                <button type="button" disabled={!editable || pending} className={BTN}
                  onClick={() => {
                    if (confirm("刪掉這個模塊的自訂表？之後這個模塊會沿用預設表。"))
                      setRanks((rs) => rs.filter((r) => (r.moduleCode ?? "") !== rankModule));
                  }}>
                  刪除自訂表（改回沿用預設）
                </button>
              )}
            </div>
            <RanksTable
              isDefault={rankModule === ""}
              rows={rankRowsOfModule}
              setRows={(f) => setRanks((rs) => [
                ...rs.filter((r) => (r.moduleCode ?? "") !== rankModule),
                ...f(rs.filter((r) => (r.moduleCode ?? "") === rankModule))
                  .map((r) => ({ ...r, moduleCode: rankModule })),
              ])}
              disabled={!editable || pending}
            />
          </>
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
            versions={versions} versionId={versionId} pending={pending} run={run} start={start}
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
            onClick={() => run(saveAll, "已儲存全部設定")}
            className={BTN_SOLID}
          >
            {pending ? "存檔中…" : "儲存變更"}
          </button>
          <span className="text-xs text-[#7f9ab2]">
            一次存下全部分頁的改動（服務模塊、職級表、門檻、參數）。
          </span>
          {dirty && !msg && (
            <span className="text-sm text-[#e0bd8b]">有未儲存的變更</span>
          )}
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-[#7fb894]" : "text-[#e08b7a]"}`}>
              {msg.ok ? `${msg.text} ✓` : `儲存失敗：${msg.text}`}
            </span>
          )}
        </div>

        {(spec.custom === "ranks" || spec.custom === "modules" || spec.id === "rules") && (
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
    // 金額欄要千分位（<input type=number> 規格上顯示不了逗號 → 改 MoneyInput）。
    // ⚠️ 「留空＝該門檻不檢查，不是 0」是業務制度的地基語意，所以 allowEmpty。
    if (unit === "元") {
      return (
        <div className="flex items-center gap-1">
          <MoneyInput
            value={value === undefined || value === null ? null : Number(value)}
            allowEmpty
            disabled={disabled}
            placeholder="未設定"
            onChange={(v) => onChange(v === null ? undefined : v)}
            className={`${cls} w-28`}
          />
          <span className="text-xs text-[#7f9ab2]">{unit}</span>
        </div>
      );
    }
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

/* ────────────────────────── 服務模塊 ────────────────────────── */

function ModulesTable({
  rows, setRows, disabled,
}: {
  rows: ModuleRow[];
  setRows: (f: (r: ModuleRow[]) => ModuleRow[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  function upd(i: number, patch: Partial<ModuleRow>) {
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  }
  const numCls = (v: number | null | undefined) => `${v == null ? EMPTY : FILLED} w-20`;
  const cell = "px-2 py-1.5 border-t border-white/8";

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
              <th className="px-2 py-2">代號</th>
              <th className="px-2 py-2">服務名稱</th>
              <th className="px-2 py-2">分潤模式</th>
              <th className="px-2 py-2">定價</th>
              <th className="px-2 py-2">計入晉升</th>
              <th className="px-2 py-2">計入維持</th>
              <th className="px-2 py-2">啟用</th>
              <th className="px-2 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <Fragment key={i}>
                <tr>
                  <td className={cell}>
                    <input value={m.code ?? ""} disabled={disabled} placeholder="必填"
                      onChange={(e) => upd(i, { code: e.target.value.trim().toUpperCase() })}
                      className={`${m.code ? FILLED : EMPTY} w-24 font-mono`} />
                  </td>
                  <td className={cell}>
                    <input value={m.name ?? ""} disabled={disabled} placeholder="必填"
                      onChange={(e) => upd(i, { name: e.target.value })}
                      className={`${m.name ? FILLED : EMPTY} w-48`} />
                  </td>
                  <td className={cell}>
                    <select value={m.splitMode ?? "chain"} disabled={disabled}
                      onChange={(e) => upd(i, { splitMode: e.target.value as "chain" | "flat" })}
                      className={`${FILLED} w-32`}>
                      <option value="chain">差％逐層</option>
                      <option value="flat">固定比例</option>
                    </select>
                  </td>
                  <td className={cell}>
                    <MoneyInput value={m.price} allowEmpty disabled={disabled} placeholder="看實收"
                      onChange={(v) => upd(i, { price: v })}
                      className={`${m.price == null ? EMPTY : FILLED} w-28`} />
                  </td>
                  <td className={cell}>
                    <input type="checkbox" checked={m.countPromotion !== false} disabled={disabled}
                      onChange={(e) => upd(i, { countPromotion: e.target.checked })}
                      className="h-4 w-4 accent-[#2b7cb5]" />
                  </td>
                  <td className={cell}>
                    <input type="checkbox" checked={m.countMaintenance !== false} disabled={disabled}
                      onChange={(e) => upd(i, { countMaintenance: e.target.checked })}
                      className="h-4 w-4 accent-[#2b7cb5]" />
                  </td>
                  <td className={cell}>
                    <input type="checkbox" checked={m.enabled !== false} disabled={disabled}
                      onChange={(e) => upd(i, { enabled: e.target.checked })}
                      className="h-4 w-4 accent-[#2b7cb5]" />
                  </td>
                  <td className={`${cell} text-right whitespace-nowrap`}>
                    <button type="button" className="text-xs text-[#a9bccf] underline mr-2"
                      onClick={() => setOpen(open === m.code ? null : m.code)}>
                      {open === m.code ? "收合" : "比例"}
                    </button>
                    <button type="button" disabled={disabled}
                      onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                      className="text-[#e08b7a] text-xs disabled:opacity-30">刪</button>
                  </td>
                </tr>
                {open === m.code && (
                  <tr className="bg-[#0a2138]">
                    <td colSpan={8} className="px-4 py-3">
                      {(m.splitMode ?? "chain") === "chain" ? (
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-xs text-[#a9bccf]">推廣端 %
                            <input type="number" step="any" value={fmtInt(m.splitPromoPct)} disabled={disabled}
                              placeholder="沿用全域"
                              onChange={(e) => upd(i, { splitPromoPct: e.target.value === "" ? null : Number(e.target.value) })}
                              className={`${numCls(m.splitPromoPct)} block mt-0.5`} />
                          </label>
                          <label className="text-xs text-[#a9bccf]">執案端 %
                            <input type="number" step="any" value={fmtInt(m.splitExecPct)} disabled={disabled}
                              placeholder="沿用全域"
                              onChange={(e) => upd(i, { splitExecPct: e.target.value === "" ? null : Number(e.target.value) })}
                              className={`${numCls(m.splitExecPct)} block mt-0.5`} />
                          </label>
                          <p className="text-xs text-[#7f9ab2] flex-1 min-w-[240px]">
                            兩格都留空＝完全沿用全域預設。公司營運＝100 − 推廣 − 執案。
                            要讓這個模塊用不同的職級分潤率，到「職級與分潤率」分頁切到本模塊建自訂表。
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-xs text-[#a9bccf]">執行者固定 %
                            <input type="number" step="any" value={fmtInt(m.flatExecPct)} disabled={disabled}
                              placeholder="未設定"
                              onChange={(e) => upd(i, { flatExecPct: e.target.value === "" ? null : Number(e.target.value) })}
                              className={`${numCls(m.flatExecPct)} block mt-0.5`} />
                          </label>
                          <label className="text-xs text-[#a9bccf]">推廣者固定 %
                            <input type="number" step="any" value={fmtInt(m.flatPromoPct)} disabled={disabled}
                              placeholder="未設定"
                              onChange={(e) => upd(i, { flatPromoPct: e.target.value === "" ? null : Number(e.target.value) })}
                              className={`${numCls(m.flatPromoPct)} block mt-0.5`} />
                          </label>
                          <p className="text-xs text-[#7f9ab2] flex-1 min-w-[240px]">
                            固定比例模式不沿輔導鏈、不發平階獎金；自推自執時兩個 % 相加。
                            未分配的部分全歸公司。適合講座、課程這類沒有輔導鏈概念的收入。
                          </p>
                        </div>
                      )}
                      <label className="mt-3 block text-xs text-[#a9bccf]">備註
                        <input value={m.note ?? ""} disabled={disabled}
                          onChange={(e) => upd(i, { note: e.target.value || null })}
                          className={`${m.note ? FILLED : EMPTY} w-full mt-0.5`} />
                      </label>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[#6f869c]">
                尚未設定服務模塊。按上方「載入 V4 辦法數值」可帶入「完整財務規劃服務」與「單點諮詢服務」兩個模塊。
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled} className={BTN}
          onClick={() => setRows((rs) => [...rs, {
            code: "", seq: rs.length + 1, name: "", splitMode: "chain",
            price: null, countPromotion: true, countMaintenance: true, enabled: true,
          }])}>
          ＋ 新增模塊
        </button>
        <span className="text-xs text-[#6f869c]">
          定價留空＝每案自行輸入實收（如完整財務規劃）；有填就在案件登錄時帶入當預設，仍可改。
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────── 職級表 ────────────────────────── */

function RanksTable({
  rows, setRows, disabled, isDefault = false,
}: {
  rows: RankRow[];
  setRows: (f: (r: RankRow[]) => RankRow[]) => void;
  disabled: boolean;
  /** 預設表才顯示「使用權益」三欄（客戶上限與定價跟賣哪個模塊無關）。 */
  isDefault?: boolean;
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
              {isDefault && <th className="px-2 py-2">客戶上限</th>}
              {isDefault && <th className="px-2 py-2">月費</th>}
              {isDefault && <th className="px-2 py-2">年費</th>}
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
                  {isDefault && (
                    <td className={cell}>
                      <input type="number" step="1" min="0" value={fmtInt(r.clientCap)} disabled={disabled} placeholder="不限"
                        onChange={(e) => upd(i, { clientCap: e.target.value === "" ? null : Number(e.target.value) })}
                        className={`${r.clientCap == null ? EMPTY : FILLED} w-20`} />
                    </td>
                  )}
                  {isDefault && (
                    <td className={cell}>
                      <MoneyInput value={r.priceMonth} allowEmpty disabled={disabled} placeholder="未設定"
                        onChange={(v) => upd(i, { priceMonth: v })}
                        className={`${r.priceMonth == null ? EMPTY : FILLED} w-24`} />
                    </td>
                  )}
                  {isDefault && (
                    <td className={cell}>
                      <MoneyInput value={r.priceYear} allowEmpty disabled={disabled} placeholder="未設定"
                        onChange={(v) => upd(i, { priceYear: v })}
                        className={`${r.priceYear == null ? EMPTY : FILLED} w-24`} />
                    </td>
                  )}
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
              <tr><td colSpan={isDefault ? 11 : 8} className="px-3 py-8 text-center text-[#6f869c]">
                尚未設定任何職級。按上方「載入 V4 辦法數值」可帶入辦法的八個級別
                （實習教練 · 認證教練 C1–C3 · 資深教練 S1–S3 · 首席教練）。
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
                  <MoneyInput value={r.fees} allowEmpty disabled={disabled} placeholder="未設定"
                    onChange={(v) => upd(idx, { fees: v })}
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
  versions, versionId, pending, run, start,
}: {
  versions: VersionLite[];
  versionId: string;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => void;
  start: (fn: () => void) => void;
}) {
  const cur = versions.find((v) => v.id === versionId);
  const active = versions.find((v) => v.status === "active");
  const [name, setName] = useState(cur?.version ?? "");
  const [eff, setEff] = useState(cur?.effectiveFrom ?? "");
  const [note, setNote] = useState(cur?.changeNote ?? "");
  const [newName, setNewName] = useState("");
  const [diff, setDiff] = useState<{ changes: Change[]; unpaidCases: number } | null>(null);
  const [diffFor, setDiffFor] = useState<string | null>(null);

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
                  {v.status !== "active" && active && (
                    <button type="button" disabled={pending} className={`${BTN} mr-1`}
                      onClick={() => {
                        setDiff(null);
                        setDiffFor(v.id);
                        start(async () => {
                          const r = await diffVersionAction(v.id, active.id);
                          if (r.ok && r.data) setDiff(r.data);
                        });
                      }}>
                      與生效版比對
                    </button>
                  )}
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

      {diffFor && (
        <section className="rounded-lg border border-white/10 bg-[#0a2138] p-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold">
              「{versions.find((v) => v.id === diffFor)?.version}」與生效版「{active?.version}」的差異
            </h3>
            <div className="flex-1" />
            <button type="button" className="text-xs text-[#a9bccf] underline"
              onClick={() => { setDiffFor(null); setDiff(null); }}>
              收合
            </button>
          </div>
          {!diff ? (
            <p className="text-xs text-[#6f869c]">比對中…</p>
          ) : diff.changes.length === 0 ? (
            <p className="text-xs text-[#7fb894]">兩版完全相同，沒有任何差異。</p>
          ) : (
            <>
              <p className="text-xs text-[#e0bd8b] mb-2">
                共 {diff.changes.length} 項差異。發布後，生效版底下
                <b> {diff.unpaidCases} </b>
                筆尚未發放的案件會依新制度重算；已發放的不受影響（§31）。
              </p>
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#12334f] text-[#a9bccf] text-left">
                      <th className="px-2 py-1.5">分類</th>
                      <th className="px-2 py-1.5">項目</th>
                      <th className="px-2 py-1.5">生效版</th>
                      <th className="px-2 py-1.5">草稿版</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.changes.map((c, i) => (
                      <tr key={i} className="border-t border-white/8">
                        <td className="px-2 py-1.5 text-[#6f869c]">{c.group}</td>
                        <td className="px-2 py-1.5">{c.label}</td>
                        <td className="px-2 py-1.5 text-[#a9bccf]">{c.before}</td>
                        <td className={`px-2 py-1.5 font-semibold ${
                          c.kind === "removed" ? "text-[#e08b7a]" : "text-[#7fb894]"
                        }`}>{c.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

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
  // 驗算條可切模塊：改了某個模塊的比例，這裡就用那個模塊重跑辦法範例。
  const [mc, setMc] = useState("");
  const results = useMemo(
    () =>
      SCENARIOS.map((s) => {
        if (!isApplicable(s, params)) return { s, res: null };
        return { s, res: splitForModule(s.build(), params, mc) };
      }),
    [params, mc],
  );
  const runnable = results.filter((r) => r.res);
  const bad = runnable.filter((r) => !r.res!.balanced);

  return (
    <div className="mt-6 rounded-lg border border-white/10 bg-[#0a2138] p-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-bold">即時驗算</h3>
        <select value={mc} onChange={(e) => setMc(e.target.value)}
          className={`${FILLED} text-xs`}>
          <option value="">全域預設</option>
          {(params.modules ?? []).map((m) => (
            <option key={m.code} value={m.code}>{m.name}</option>
          ))}
        </select>
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
