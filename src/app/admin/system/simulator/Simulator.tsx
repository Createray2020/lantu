"use client";

// 分潤試算器。跟案件實際分潤共用同一支引擎（src/lib/comp/engine.ts），
// 所以「試算出來的數字」與「日後真的發下去的數字」不可能不一致。

import { Fragment, useMemo, useState } from "react";
import { ranksForModule, splitForModule, type ChainNode } from "@/lib/comp/engine";
import { SCENARIOS, isApplicable } from "@/lib/comp/scenarios";
import type { CompParams } from "@/lib/comp/types";
import { fmtMoney } from "@/lib/money";
import MoneyInput from "@/components/MoneyInput";

const INPUT = "bg-[#0d2b45] border border-white/15 rounded px-2 py-1 text-sm text-[#eef2f7] outline-none";
const BTN = "rounded-lg px-3 py-1.5 text-sm border border-white/15 text-[#a9bccf] hover:bg-[#17406a]";

type Row = { rankCode: string };

export default function Simulator({ params }: { params: CompParams }) {
  const modules = (params.modules ?? []).filter((m) => m.enabled !== false);
  const [moduleCode, setModuleCode] = useState(modules[0]?.code ?? "");
  const activeModule = modules.find((m) => m.code === moduleCode) ?? null;
  const codes = ranksForModule(params, moduleCode).map((r) => r.code);
  const [fee, setFee] = useState(60_000);
  const [companyLead, setCompanyLead] = useState(false);
  const [selfBoth, setSelfBoth] = useState(true);
  const [execCode, setExecCode] = useState(codes[0] ?? "");
  const [promoCode, setPromoCode] = useState(codes[0] ?? "");
  const [chain, setChain] = useState<Row[]>([]);
  const [openTrace, setOpenTrace] = useState<number | null>(null);

  const input = useMemo(() => {
    const up: ChainNode[] = chain
      .filter((c) => c.rankCode)
      .map((c, i) => ({ id: `u${i}`, rankCode: c.rankCode, name: `第 ${i + 1} 層 ${c.rankCode}` }));
    const exec: ChainNode = { id: "exec", rankCode: execCode, name: `執案者 ${execCode}` };
    const promo: ChainNode = selfBoth
      ? { ...exec, name: `推廣＋執案 ${execCode}` }
      : { id: "promo", rankCode: promoCode, name: `推廣者 ${promoCode}` };
    return {
      fee,
      isCompanyLead: companyLead,
      promoter: companyLead ? null : promo,
      executor: selfBoth ? { ...exec, name: `推廣＋執案 ${execCode}` } : exec,
      // 推廣者與執案者同一人時兩邊共用同一條鏈；分開時推廣者的鏈由使用者另行設定，
      // 這一版先以同一條鏈試算（分屬不同鏈的情境走案件頁）。
      promoterChain: up,
      executorChain: up,
    };
  }, [fee, companyLead, selfBoth, execCode, promoCode, chain]);

  const res = useMemo(() => splitForModule(input, params, moduleCode), [input, params, moduleCode]);
  const noRanks = codes.length === 0;

  function applyScenario(id: string) {
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    const b = s.build();
    setFee(b.fee);
    setCompanyLead(!!b.isCompanyLead);
    setExecCode(b.executor.rankCode);
    const sameHolder = !!b.promoter && b.promoter.id === b.executor.id;
    setSelfBoth(sameHolder);
    setPromoCode(b.promoter?.rankCode ?? b.executor.rankCode);
    setChain((b.executorChain ?? []).map((n) => ({ rankCode: n.rankCode })));
  }

  return (
    <div className="space-y-4">
      {noRanks && (
        <div className="rounded-lg border border-[#e0bd8b]/40 bg-[#e0bd8b]/10 px-4 py-3 text-sm text-[#e0bd8b]">
          職級表還沒設定，無法試算。請先到「業務制度 › 職級與分潤率」按「載入 V4 辦法數值」。
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4 space-y-3">
          <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2">案件條件</h3>
          {modules.length > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <span className="w-24 text-[#a9bccf] pt-1">服務模塊</span>
              <span className="flex-1">
                <select value={moduleCode}
                  onChange={(e) => {
                    const m = modules.find((x) => x.code === e.target.value);
                    setModuleCode(e.target.value);
                    if (m?.price != null) setFee(m.price);
                  }}
                  className={`${INPUT} w-full`}>
                  {modules.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                </select>
                {activeModule && (
                  <span className="block text-[11px] text-[#6f869c] mt-0.5">
                    {activeModule.splitMode === "flat" ? "固定比例分潤（不沿輔導鏈）" : "差％逐層"}
                    {" · "}
                    {activeModule.price == null ? "看實收" : `定價 ${fmtMoney(activeModule.price)}`}
                    {ranksForModule(params, moduleCode).some((r) => (r.moduleCode ?? "")) && " · 使用本模塊自訂職級表"}
                  </span>
                )}
              </span>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <span className="w-24 text-[#a9bccf]">顧問費</span>
            <MoneyInput value={fee} onChange={(v) => setFee(v ?? 0)}
              className={`${INPUT} w-36`} />
            <span className="text-xs text-[#7f9ab2]">元</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-24 text-[#a9bccf]">案件來源</span>
            <input type="checkbox" checked={companyLead} onChange={(e) => setCompanyLead(e.target.checked)}
              className="h-4 w-4 accent-[#2b7cb5]" />
            <span className="text-[#cfdcea]">公司派案（推廣端全數歸公司）</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-24 text-[#a9bccf]">執案者職級</span>
            <select value={execCode} onChange={(e) => setExecCode(e.target.value)} className={`${INPUT} w-28`}>
              {codes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-1 ml-2">
              <input type="checkbox" checked={selfBoth} onChange={(e) => setSelfBoth(e.target.checked)}
                className="h-4 w-4 accent-[#2b7cb5]" />
              <span className="text-[#cfdcea]">自推自執</span>
            </label>
          </label>
          {!selfBoth && !companyLead && (
            <label className="flex items-center gap-2 text-sm">
              <span className="w-24 text-[#a9bccf]">推廣者職級</span>
              <select value={promoCode} onChange={(e) => setPromoCode(e.target.value)} className={`${INPUT} w-28`}>
                {codes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
          <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">
            輔導鏈（由下而上，不含本人）
          </h3>
          {activeModule?.splitMode === "flat" && (
            <p className="text-xs text-[#e0bd8b] mb-2">
              這個模塊採固定比例分潤，不沿輔導鏈計算，下面設定不影響結果。
            </p>
          )}
          <div className="space-y-2">
            {chain.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-[#7f9ab2] w-14">第 {i + 1} 層</span>
                <select value={c.rankCode}
                  onChange={(e) => setChain((cs) => cs.map((x, k) => (k === i ? { rankCode: e.target.value } : x)))}
                  className={`${INPUT} w-28`}>
                  <option value="">—</option>
                  {codes.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                <button type="button" className="text-[#e08b7a] text-xs px-1"
                  onClick={() => setChain((cs) => cs.filter((_, k) => k !== i))}>刪</button>
              </div>
            ))}
            {chain.length === 0 && (
              <p className="text-xs text-[#6f869c]">
                沒有上層＝輔導鏈不完整，未分配的差額歸公司（§6-4）。
              </p>
            )}
          </div>
          <button type="button" className={`${BTN} mt-3`}
            onClick={() => setChain((cs) => [...cs, { rankCode: codes[codes.length - 1] ?? "" }])}>
            ＋ 加一層
          </button>
        </div>
      </div>

      {/* 結果 */}
      <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2">逐層分潤明細</h3>
          <div className="flex-1" />
          <span className={`text-sm ${res.balanced ? "text-[#7fb894]" : "text-[#e08b7a]"}`}>
            驗算 {res.totalPct}%{res.balanced ? " ✓" : " ✗"}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
                <th className="px-3 py-2">角色</th>
                <th className="px-3 py-2 text-right">推廣端</th>
                <th className="px-3 py-2 text-right">執案端</th>
                <th className="px-3 py-2 text-right">平階獎金</th>
                <th className="px-3 py-2 text-right">合計</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {res.lines.map((l, i) => (
                <Fragment key={i}>
                  <tr className="border-t border-white/8">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{l.name}</div>
                      <div className="text-[11px] text-[#6f869c]">{l.role}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.promoPct || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.execPct || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.bonusPct || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{l.totalPct}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.amount)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-xs text-[#a9bccf] underline"
                        onClick={() => setOpenTrace(openTrace === i ? null : i)}>
                        {openTrace === i ? "收合" : "明細"}
                      </button>
                    </td>
                  </tr>
                  {openTrace === i && (
                    <tr className="bg-[#0a2138]">
                      <td colSpan={7} className="px-4 py-2 text-xs text-[#8fa6ba] leading-relaxed">
                        {l.trace.map((t, k) => <div key={k}>· {t}</div>)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="border-t-2 border-white/20 bg-[#12334f]/40">
                <td className="px-3 py-2 font-bold">驗算</td>
                <td colSpan={3}></td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{res.totalPct}%</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtMoney(res.totalAmount)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        {res.warnings.length > 0 && (
          <p className="mt-2 text-xs text-[#e0bd8b]">尚未設定：{res.warnings.join("；")}</p>
        )}
      </div>

      {/* 快速情境 */}
      <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
        <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-1">辦法範例</h3>
        <p className="text-xs text-[#7f9ab2] mb-3">
          這七個情境同時是分潤引擎的單元測試案例。載入 V4 數值後，每一格數字都必須與辦法完全一致。
        </p>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => {
            const ok = isApplicable(s, params);
            return (
              <button key={s.id} type="button" disabled={!ok} title={ok ? s.desc : "目前職級表缺少此範例所需的職級代號"}
                onClick={() => applyScenario(s.id)}
                className={`${BTN} disabled:opacity-30`}>
                {s.title}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
