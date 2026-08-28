"use client";

// 案件與分潤明細。登錄一筆案件 → 引擎立刻算好分潤 → 月結批次 → 發放。
// 每一列分潤都能展開看「這個 % 怎麼來的」（sale trace 由引擎產生，不是這裡拼字串）。

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmImportAction, createBatchAction, createCaseAction, markBatchPaidAction,
  previewImportAction, recalcCaseAction, refundCaseAction, submitSurveyByCoachAction,
  updateCaseAction, type ImportPreview,
} from "./actions";
import { fmtMoney } from "@/lib/money";
import MoneyInput from "@/components/MoneyInput";

const INPUT = "bg-[#0d2b45] border border-white/15 rounded px-2 py-1 text-sm text-[#eef2f7] outline-none";
const EMPTY = "bg-[#0d2b45] border border-dashed border-[#3d5b78] rounded px-2 py-1 text-sm text-[#8fa6ba] outline-none";
const BTN = "rounded-lg px-3 py-1.5 text-sm border border-white/15 text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-40";
const BTN_SOLID = "rounded-lg px-3 py-1.5 text-sm bg-[#1d5c8a] border border-[#2b7cb5] text-white hover:bg-[#226ba0] disabled:opacity-40";

export type PayoutView = {
  id: string; payeeId: string | null; payeeName: string; kind: string; role: string | null;
  rankCode: string | null; promoPct: number; execPct: number; bonusPct: number; totalPct: number;
  amount: number; status: string; trace: string[];
};
export type CaseView = {
  id: string; clientName: string; serviceType: string; fee: number; refundAmount: number;
  isCompanyLead: boolean; promoterId: string | null; executorId: string | null;
  moduleCode: string; moduleName: string;
  signedAt: string | null; paidAt: string | null; surveyAt: string | null;
  caseYear: number; status: string; note: string | null;
  versionLabel: string;
  /** 已回收的問卷答案（與制度題目同序）；null＝尚未回收 */
  surveyAnswers: string[] | null;
  surveyBy: string | null;
  payouts: PayoutView[];
  balanced: boolean;
};
export type Peer = { id: string; label: string; rankCode: string | null };
export type ModuleOption = {
  code: string; name: string; price: number | null; splitMode: string;
  countPromotion: boolean; countMaintenance: boolean;
};
export type BatchView = { id: string; period: string; payoutDate: string | null; status: string; totalAmount: number };

const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "未結案", color: "#c99a5b" },
  closed: { label: "待發放", color: "#6f9fc4" },
  paid: { label: "已發放", color: "#6f8f74" },
  refunded: { label: "已退費", color: "#b05a4a" },
  void: { label: "作廢", color: "#6f869c" },
};

export default function CasesBoard({
  cases, peers, modules, batches, questions, marketingEnabled, defaultPeriod, defaultPayoutDate,
}: {
  cases: CaseView[];
  peers: Peer[];
  modules: ModuleOption[];
  batches: BatchView[];
  questions: string[];
  marketingEnabled: boolean;
  defaultPeriod: string;
  defaultPayoutDate: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "open" | "closed" | "paid" | "refunded">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [trace, setTrace] = useState<string | null>(null);
  const [surveyOf, setSurveyOf] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    clientName: "", moduleCode: modules[0]?.code ?? "", fee: "", isCompanyLead: false,
    promoterId: "", executorId: peers[0]?.id ?? "", selfBoth: true,
    signedAt: "", paidAt: "", surveyAt: "", note: "",
  });
  const [period, setPeriod] = useState(defaultPeriod);
  const [payoutDate, setPayoutDate] = useState(defaultPayoutDate);

  const shown = useMemo(
    () => (tab === "all" ? cases : cases.filter((c) => c.status === tab)),
    [cases, tab],
  );
  const nameOf = (id: string | null) =>
    id ? (peers.find((p) => p.id === id)?.label ?? id) : "—";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "失敗" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* 登錄案件 */}
      <details className="rounded-xl border border-white/10 bg-[#0d2b45] p-4" open={!cases.length}>
        <summary className="cursor-pointer text-sm font-bold">＋ 登錄案件</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="w-20 text-[#a9bccf]">客戶</span>
              <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="客戶姓名" className={`${form.clientName ? INPUT : EMPTY} flex-1`} />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <span className="w-20 text-[#a9bccf] pt-1">服務模塊</span>
              <span className="flex-1">
                <select value={form.moduleCode}
                  onChange={(e) => {
                    const m = modules.find((x) => x.code === e.target.value);
                    // 模塊有定價就帶入當預設；留空的模塊（如完整財務規劃）不覆蓋已輸入的金額。
                    setForm((f) => ({
                      ...f,
                      moduleCode: e.target.value,
                      fee: m?.price != null ? String(m.price) : f.fee,
                    }));
                  }}
                  className={`${INPUT} w-full`}>
                  {modules.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                </select>
                {(() => {
                  const m = modules.find((x) => x.code === form.moduleCode);
                  if (!m) return null;
                  const tags = [
                    m.splitMode === "flat" ? "固定比例分潤" : "差％逐層",
                    m.price == null ? "看實收" : `定價 ${fmtMoney(m.price)}`,
                    m.countPromotion ? "計入晉升" : "不計晉升",
                    m.countMaintenance ? "計入維持資格" : "不計維持資格",
                  ];
                  return <span className="block text-[11px] text-[#6f869c] mt-0.5">{tags.join(" · ")}</span>;
                })()}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-20 text-[#a9bccf]">顧問費</span>
              <MoneyInput value={form.fee === "" ? null : Number(form.fee)} allowEmpty
                onChange={(v) => setForm({ ...form, fee: v === null ? "" : String(v) })}
                placeholder="0" className={`${form.fee ? INPUT : EMPTY} w-36`} />
              <span className="text-xs text-[#7f9ab2]">元</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-20 text-[#a9bccf]">案件來源</span>
              <input type="checkbox" checked={form.isCompanyLead}
                onChange={(e) => setForm({ ...form, isCompanyLead: e.target.checked })}
                className="h-4 w-4 accent-[#2b7cb5]" />
              <span className="text-[#cfdcea]">公司派案</span>
            </label>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="w-20 text-[#a9bccf]">執案者</span>
              <select value={form.executorId} onChange={(e) => setForm({ ...form, executorId: e.target.value })}
                className={`${INPUT} flex-1`}>
                {peers.map((p) => <option key={p.id} value={p.id}>{p.label}{p.rankCode ? `（${p.rankCode}）` : ""}</option>)}
              </select>
            </label>
            {!form.isCompanyLead && (
              <label className="flex items-center gap-2 text-sm">
                <span className="w-20 text-[#a9bccf]">推廣者</span>
                <input type="checkbox" checked={form.selfBoth}
                  onChange={(e) => setForm({ ...form, selfBoth: e.target.checked })}
                  className="h-4 w-4 accent-[#2b7cb5]" />
                <span className="text-[#cfdcea] text-xs mr-1">自推自執</span>
                {!form.selfBoth && (
                  <select value={form.promoterId} onChange={(e) => setForm({ ...form, promoterId: e.target.value })}
                    className={`${form.promoterId ? INPUT : EMPTY} flex-1`}>
                    <option value="">（未指定）</option>
                    {peers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                )}
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <span className="w-20 text-[#a9bccf]">簽約日</span>
              <input type="date" value={form.signedAt} onChange={(e) => setForm({ ...form, signedAt: e.target.value })}
                className={`${form.signedAt ? INPUT : EMPTY} w-40`} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-20 text-[#a9bccf]">實收日</span>
              <input type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
                className={`${form.paidAt ? INPUT : EMPTY} w-40`} />
              <span className="text-[11px] text-[#6f869c]">未實收不進發放批次</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-20 text-[#a9bccf]">問卷回收</span>
              <input type="date" value={form.surveyAt} onChange={(e) => setForm({ ...form, surveyAt: e.target.value })}
                className={`${form.surveyAt ? INPUT : EMPTY} w-40`} />
              <span className="text-[11px] text-[#6f869c]">未回收不計晉升指標</span>
            </label>
          </div>
        </div>
        <button type="button" disabled={pending} className={`${BTN_SOLID} mt-3`}
          onClick={() => run(
            () => createCaseAction({
              clientName: form.clientName,
              moduleCode: form.moduleCode,
              fee: Number(form.fee) || 0,
              isCompanyLead: form.isCompanyLead,
              promoterId: form.isCompanyLead ? null : (form.selfBoth ? form.executorId : form.promoterId || null),
              executorId: form.executorId,
              signedAt: form.signedAt || null,
              paidAt: form.paidAt || null,
              surveyAt: form.surveyAt || null,
              note: form.note || null,
            }),
            "案件已登錄，分潤已計算",
          )}>
          {pending ? "處理中…" : "登錄並計算分潤"}
        </button>
      </details>

      {/* 篩選 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([["all", "全部"], ["open", "未結案"], ["closed", "待發放"], ["paid", "已發放"], ["refunded", "已退費"]] as const)
          .map(([v, l]) => (
            <button key={v} type="button" onClick={() => setTab(v)}
              className={`rounded-lg px-3 py-1.5 text-sm border ${
                tab === v ? "bg-[#1d5c8a] border-[#2b7cb5] text-white" : "border-white/10 text-[#a9bccf] hover:bg-[#12334f]"
              }`}>
              {l}
            </button>
          ))}
        <div className="flex-1" />
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-[#7fb894]" : "text-[#e08b7a]"}`}>
            {msg.ok ? `${msg.text} ✓` : `失敗：${msg.text}`}
          </span>
        )}
        <a href="/api/comp/export?kind=cases" className={`${BTN} inline-block`}>匯出案件</a>
        <button type="button" className={BTN} onClick={() => setImportOpen((o) => !o)}>
          {importOpen ? "收合匯入" : "批次匯入"}
        </button>
      </div>

      {importOpen && (
        <ImportPanel
          pending={pending}
          onDone={(text) => { setMsg({ ok: true, text }); setImportOpen(false); router.refresh(); }}
        />
      )}

      {/* 案件列表 */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
              <th className="px-3 py-2">客戶</th>
              <th className="px-3 py-2 text-right">顧問費</th>
              <th className="px-3 py-2">推廣者</th>
              <th className="px-3 py-2">執案者</th>
              <th className="px-3 py-2">問卷</th>
              <th className="px-3 py-2">實收</th>
              <th className="px-3 py-2">狀態</th>
              <th className="px-3 py-2">制度版本</th>
              <th className="px-3 py-2 text-right">動作</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const st = STATUS[c.status] ?? { label: c.status, color: "#a9bccf" };
              return (
                <Fragment key={c.id}>
                  <tr className="border-t border-white/8">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{c.clientName}</div>
                      <div className="text-[11px] text-[#6f869c]">
                        {c.moduleName || "未指定模塊"} · {c.caseYear} 年度
                        {c.isCompanyLead && " · 公司派案"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMoney(c.fee)}
                      {c.refundAmount > 0 && (
                        <div className="text-[11px] text-[#e08b7a]">退 {fmtMoney(c.refundAmount)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#a9bccf]">{c.isCompanyLead ? "公司" : nameOf(c.promoterId)}</td>
                    <td className="px-3 py-2 text-[#a9bccf]">{nameOf(c.executorId)}</td>
                    <td className="px-3 py-2 text-[#a9bccf]">
                      {c.surveyAt
                        ? <>{c.surveyAt}{c.surveyBy === "coach" && <span className="block text-[11px] text-[#6f869c]">教練代填</span>}</>
                        : <span className="text-[#c99a5b]">未回收</span>}
                    </td>
                    <td className="px-3 py-2 text-[#a9bccf]">{c.paidAt ?? <span className="text-[#c99a5b]">未實收</span>}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold"
                        style={{ background: st.color + "22", color: st.color }}>
                        {st.label}
                      </span>
                      {!c.balanced && <div className="text-[11px] text-[#e08b7a]">分潤未達 100%</div>}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-[#6f869c]">{c.versionLabel}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" className="text-xs text-[#a9bccf] underline mr-2"
                        onClick={() => setOpen(open === c.id ? null : c.id)}>
                        {open === c.id ? "收合" : "明細"}
                      </button>
                    </td>
                  </tr>

                  {open === c.id && (
                    <tr className="bg-[#0a2138]">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="overflow-x-auto rounded-lg border border-white/10">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
                                <th className="px-3 py-1.5">受分潤人</th>
                                <th className="px-3 py-1.5">身分</th>
                                <th className="px-3 py-1.5 text-right">推廣端</th>
                                <th className="px-3 py-1.5 text-right">執案端</th>
                                <th className="px-3 py-1.5 text-right">平階獎金</th>
                                <th className="px-3 py-1.5 text-right">合計</th>
                                <th className="px-3 py-1.5 text-right">金額</th>
                                <th className="px-3 py-1.5">狀態</th>
                                <th className="px-3 py-1.5"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.payouts.map((p) => (
                                <Fragment key={p.id}>
                                  <tr className="border-t border-white/8">
                                    <td className="px-3 py-1.5">{p.payeeName}</td>
                                    <td className="px-3 py-1.5 text-[11px] text-[#6f869c]">{p.role}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{p.promoPct || "—"}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{p.execPct || "—"}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{p.bonusPct || "—"}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{p.totalPct}%</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(p.amount)}</td>
                                    <td className="px-3 py-1.5 text-[11px] text-[#a9bccf]">
                                      {p.status === "pending" ? "待入批" : p.status === "batched" ? "已入批" : "已發放"}
                                    </td>
                                    <td className="px-3 py-1.5 text-right">
                                      <button type="button" className="text-xs text-[#a9bccf] underline"
                                        onClick={() => setTrace(trace === p.id ? null : p.id)}>
                                        {trace === p.id ? "收合" : "查明細"}
                                      </button>
                                    </td>
                                  </tr>
                                  {trace === p.id && (
                                    <tr className="bg-[#081a2b]">
                                      <td colSpan={9} className="px-4 py-2 text-xs text-[#8fa6ba] leading-relaxed">
                                        {p.trace.map((t, k) => <div key={k}>· {t}</div>)}
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              ))}
                              <tr className="border-t-2 border-white/20 bg-[#12334f]/40">
                                <td className="px-3 py-1.5 font-bold" colSpan={5}>驗算</td>
                                <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                                  {c.payouts.reduce((a, p) => a + p.totalPct, 0).toFixed(2).replace(/\.00$/, "")}%
                                </td>
                                <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                                  {fmtMoney(c.payouts.reduce((a, p) => a + p.amount, 0))}
                                </td>
                                <td colSpan={2}></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button type="button" disabled={pending} className={BTN}
                            onClick={() => run(() => recalcCaseAction(c.id), "已重算分潤")}>
                            重算分潤
                          </button>
                          <button type="button" disabled={pending} className={BTN}
                            onClick={() => setSurveyOf(surveyOf === c.id ? null : c.id)}>
                            {c.surveyAt ? "檢視問卷" : "代填問卷"}
                          </button>
                          {!c.paidAt && (
                            <button type="button" disabled={pending} className={BTN}
                              onClick={() => run(
                                () => updateCaseAction(c.id, { paidAt: new Date().toISOString().slice(0, 10) }),
                                "已標記實收",
                              )}>
                              標記實收
                            </button>
                          )}
                          <RefundBox caseId={c.id} fee={c.fee} disabled={pending}
                            onRefund={(amt) => run(() => refundCaseAction(c.id, amt), "已依實收重算分潤")} />
                        </div>

                        {surveyOf === c.id && (
                          <CoachSurvey
                            c={c} questions={questions} marketingEnabled={marketingEnabled}
                            disabled={pending}
                            onSubmit={(answers, optIn) => run(
                              () => submitSurveyByCoachAction({
                                caseId: c.id, questions, answers, marketingOptIn: optIn,
                              }),
                              "問卷已存（案件結案）",
                            )}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-[#6f869c]">尚無案件。</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 發放批次 */}
      <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
        <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">月結發放批次</h3>
        <p className="text-xs text-[#7f9ab2] mb-3">
          只有「已實收且未退費」的分潤會進批（§22-1）。批次標記發放後，該筆分潤永久凍結，
          之後改制度或重算都不會動到已發出去的錢。
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="YYYY-MM"
            className={`${INPUT} w-28`} />
          <input type="date" value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)}
            className={`${INPUT} w-40`} />
          <button type="button" disabled={pending} className={BTN_SOLID}
            onClick={() => run(() => createBatchAction(period, payoutDate), `${period} 批次已產生`)}>
            產生／更新批次
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
                <th className="px-3 py-2">月份</th><th className="px-3 py-2">發放日</th>
                <th className="px-3 py-2 text-right">總額</th><th className="px-3 py-2">狀態</th>
                <th className="px-3 py-2 text-right">動作</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-white/8">
                  <td className="px-3 py-2 font-semibold">{b.period}</td>
                  <td className="px-3 py-2 text-[#a9bccf]">{b.payoutDate ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(b.totalAmount)}</td>
                  <td className="px-3 py-2">
                    <span className={b.status === "paid" ? "text-[#7fb894]" : "text-[#e0bd8b]"}>
                      {b.status === "paid" ? "已發放" : "待發放"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <a href={`/api/comp/export?kind=batch&batchId=${b.id}`}
                      className={`${BTN} mr-1 inline-block`}>
                      匯出清冊
                    </a>
                    {b.status !== "paid" && (
                      <button type="button" disabled={pending} className={BTN}
                        onClick={() => {
                          if (confirm(`確定把 ${b.period} 批次（${fmtMoney(b.totalAmount)} 元）標記為已發放？發放後不可重算。`))
                            run(() => markBatchPaidAction(b.id), "已標記發放");
                        }}>
                        標記已發放
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[#6f869c]">尚無批次。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ImportPanel({
  pending, onDone,
}: {
  pending: boolean;
  onDone: (note: string) => void;
}) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const okCount = preview?.rows.filter((r) => r.ok).length ?? 0;
  const badCount = (preview?.rows.length ?? 0) - okCount;
  const disabled = pending || busy;

  async function readFile(f: File) {
    setErr(null);
    setPreview(null);
    const text = await f.text();
    setCsv(text);
    start(async () => {
      const r = await previewImportAction(text);
      if (r.ok) setPreview(r.data);
      else setErr(r.error);
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
      <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-1">批次匯入案件</h3>
      <p className="text-xs text-[#7f9ab2] mb-3">
        教練以 Email 對應（姓名會重複、內部 id 不適合手填）。上傳後會先預覽，確認才寫入；
        有問題的列會標出來且不會被匯入。日期可用 YYYY-MM-DD 或民國年。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a href="/api/comp/export?kind=template" className={BTN}>下載範本</a>
        <input type="file" accept=".csv,text/csv" disabled={disabled}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }}
          className="text-xs text-[#a9bccf] file:mr-2 file:rounded-lg file:border file:border-white/15 file:bg-transparent file:px-3 file:py-1.5 file:text-[#a9bccf]" />
        {busy && <span className="text-xs text-[#a9bccf]">解析中…</span>}
      </div>

      {err && <p className="mt-2 text-sm text-[#e08b7a]">{err}</p>}

      {preview?.missingHeaders.length ? (
        <p className="mt-3 text-sm text-[#e08b7a]">
          缺少欄位：{preview.missingHeaders.join("、")}。請用範本的表頭。
        </p>
      ) : null}

      {preview && preview.rows.length > 0 && (
        <>
          <p className="mt-3 text-xs text-[#a9bccf]">
            共 {preview.rows.length} 列：可匯入 <b className="text-[#7fb894]">{okCount}</b> 筆
            {badCount > 0 && <>，<b className="text-[#e08b7a]">{badCount}</b> 筆有問題（不會匯入）</>}
          </p>
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#12334f] text-[#a9bccf] text-left">
                <tr>
                  <th className="px-2 py-1.5">列</th><th className="px-2 py-1.5">客戶</th>
                  <th className="px-2 py-1.5">服務模塊</th><th className="px-2 py-1.5">顧問費</th>
                  <th className="px-2 py-1.5">推廣者</th><th className="px-2 py-1.5">執案者</th>
                  <th className="px-2 py-1.5">簽約日</th><th className="px-2 py-1.5">狀態</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className={`border-t border-white/8 ${r.ok ? "" : "bg-[#e08b7a]/10"}`}>
                    <td className="px-2 py-1.5 text-[#6f869c]">{r.line}</td>
                    <td className="px-2 py-1.5">{r.display.clientName}</td>
                    <td className="px-2 py-1.5">{r.display.moduleName}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.display.fee}</td>
                    <td className="px-2 py-1.5">{r.display.promoter}</td>
                    <td className="px-2 py-1.5">{r.display.executor}</td>
                    <td className="px-2 py-1.5">{r.display.signedAt}</td>
                    <td className="px-2 py-1.5">
                      {r.ok
                        ? <span className="text-[#7fb894]">可匯入</span>
                        : <span className="text-[#e08b7a]">{r.errors.join("；")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" disabled={disabled || okCount === 0} className={`${BTN_SOLID} mt-3`}
            onClick={() => start(async () => {
              const r = await confirmImportAction(csv);
              if (r.ok) onDone(r.note);
              else setErr(r.error);
            })}>
            {busy ? "匯入中…" : `確認匯入 ${okCount} 筆`}
          </button>
        </>
      )}
    </div>
  );
}

function CoachSurvey({
  c, questions, marketingEnabled, disabled, onSubmit,
}: {
  c: CaseView;
  questions: string[];
  marketingEnabled: boolean;
  disabled: boolean;
  onSubmit: (answers: string[], optIn: boolean) => void;
}) {
  const [answers, setAnswers] = useState<string[]>(
    questions.map((_, i) => c.surveyAnswers?.[i] ?? ""),
  );
  const [optIn, setOptIn] = useState(false);
  const filled = answers.some((a) => a.trim());

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-[#0d2b45] p-3">
      <div className="text-sm font-bold mb-1">回饋問卷{c.surveyAt ? `（已於 ${c.surveyAt} 回收）` : "・代填"}</div>
      <p className="text-xs text-[#7f9ab2] mb-3">
        優先請客戶自己在客戶端填寫；這裡是客戶不方便自填、或案件沒掛 CRM 客戶時的備援，
        送出後會標記為「教練代填」。
      </p>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <label key={i} className="block">
            <span className="block text-xs text-[#cfdcea] mb-0.5">{i + 1}. {q}</span>
            <textarea rows={2} value={answers[i] ?? ""} disabled={disabled}
              onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))}
              className={`${answers[i] ? INPUT : EMPTY} w-full leading-relaxed`} />
          </label>
        ))}
      </div>
      {marketingEnabled && (
        <label className="flex items-center gap-2 mt-2 text-xs text-[#a9bccf]">
          <input type="checkbox" checked={optIn} disabled={disabled}
            onChange={(e) => setOptIn(e.target.checked)} className="h-4 w-4 accent-[#2b7cb5]" />
          客戶已同意作為見證素材
        </label>
      )}
      <button type="button" disabled={disabled || !filled} className={`${BTN_SOLID} mt-3`}
        onClick={() => onSubmit(answers, optIn)}>
        存檔並結案
      </button>
    </div>
  );
}

function RefundBox({
  fee, disabled, onRefund,
}: {
  caseId: string; fee: number; disabled: boolean; onRefund: (amt: number) => void;
}) {
  const [amt, setAmt] = useState("");
  return (
    <span className="flex items-center gap-1">
      <MoneyInput value={amt === "" ? null : Number(amt)} allowEmpty
        onChange={(v) => setAmt(v === null ? "" : String(v))} placeholder="退費金額"
        className={`${amt ? INPUT : EMPTY} w-28`} />
      <button type="button" disabled={disabled || !amt} className={BTN}
        onClick={() => {
          const n = Number(amt);
          if (confirm(`退費 ${fmtMoney(n)} 元（原 ${fmtMoney(fee)}）？系統會依實收比例重算全鏈分潤。`))
            onRefund(n);
        }}>
        退費重算
      </button>
    </span>
  );
}
