"use client";

// 顧問職級與晉升追蹤。上半是總表，點開是個人頁（可編制度欄位＋看雙軌進度＋異動時間軸）。

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recomputeAllAction, saveAdvisorAction, setRankAction } from "./actions";
import { fmtMoney } from "@/lib/money";
import MoneyInput from "@/components/MoneyInput";

const INPUT = "bg-[#0d2b45] border border-white/15 rounded px-2 py-1 text-sm text-[#eef2f7] outline-none";
const EMPTY = "bg-[#0d2b45] border border-dashed border-[#3d5b78] rounded px-2 py-1 text-sm text-[#8fa6ba] outline-none";
const BTN = "rounded-lg px-3 py-1.5 text-sm border border-white/15 text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-40";
const BTN_SOLID = "rounded-lg px-3 py-1.5 text-sm bg-[#1d5c8a] border border-[#2b7cb5] text-white hover:bg-[#226ba0] disabled:opacity-40";

export type GapView = { label: string; need: number; have: number; met: boolean; unit?: "money" | "count" };
export type TrackView = { toCode: string; gaps: GapView[]; met: boolean } | null;
export type EventView = { id: string; fromCode: string | null; toCode: string | null; reason: string; effectiveAt: string | null; note: string | null };

export type AdvisorView = {
  id: string;
  name: string;
  status: string;
  rankCode: string | null;
  uplineName: string;
  sponsorId: string | null;
  entryType: string | null;
  hireDate: string | null;
  tenureRankCode: string | null;
  tenureUntil: string | null;
  tenureSettledCode: string | null;
  tenureNote: string | null;
  tenureExpired: boolean;
  initialCases: number;
  initialFees: number;
  recruitAllowed: boolean | null;
  leadAllowed: boolean | null;
  personalCases: number;
  personalFees: number;
  teamCases: number;
  trackA: TrackView;
  trackB: TrackView;
  canPromote: boolean;
  promoteTrack: string | null;
  blocked?: string;
  maintExec: number;
  maintExecPass: boolean;
  maintHours: number;
  maintTrainPass: boolean;
  maintPass: boolean;
  maintExempt: boolean;
  maintExemptReason?: string;
  canRecruit: boolean;
  canReceiveLeads: boolean;
  events: EventView[];
};

const REASON: Record<string, string> = {
  auto_a: "A 軌自動晉升", auto_b: "B 軌自動晉升", tenure: "真除轉正",
  manual: "人工調整", refund: "退費扣回",
};

export default function AdvisorsBoard({
  advisors, rankCodes, year,
}: {
  advisors: AdvisorView[];
  rankCodes: string[];
  year: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "tenure" | "promotable" | "maintain" | "suspended">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const shown = advisors.filter((a) => {
    if (tab === "tenure") return !!a.tenureRankCode;
    if (tab === "promotable") return a.canPromote;
    if (tab === "maintain") return !a.maintPass;
    if (tab === "suspended") return !a.canRecruit || !a.canReceiveLeads;
    return true;
  });

  function run(fn: () => Promise<{ ok: boolean; error?: string; note?: string }>, okText: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.note ?? okText } : { ok: false, text: r.error ?? "失敗" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {([["all", "全部"], ["tenure", "真除中"], ["promotable", "可晉升"], ["maintain", "維持資格未達"], ["suspended", "資格受限"]] as const)
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
        <button type="button" disabled={pending} className={BTN_SOLID}
          onClick={() => {
            if (confirm(`依目前制度重算 ${year} 年度全體教練的晉升／真除／維持資格？達標者會自動晉升並留下異動紀錄。`))
              run(() => recomputeAllAction(year), "已重算");
          }}>
          {pending ? "重算中…" : "重算全體"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
              <th className="px-3 py-2">教練</th>
              <th className="px-3 py-2">職級</th>
              <th className="px-3 py-2">直屬主管</th>
              <th className="px-3 py-2">真除</th>
              <th className="px-3 py-2 text-right">終身案數</th>
              <th className="px-3 py-2 text-right">終身顧問費</th>
              <th className="px-3 py-2 text-right">團隊業績</th>
              <th className="px-3 py-2">A 軌</th>
              <th className="px-3 py-2">B 軌</th>
              <th className="px-3 py-2">維持資格</th>
              <th className="px-3 py-2">資格</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <Fragment key={a.id}>
                <tr className="border-t border-white/8">
                  <td className="px-3 py-2 font-semibold">{a.name}</td>
                  <td className="px-3 py-2">
                    <span className="text-[#e0bd8b] font-bold">{a.rankCode ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2 text-[#a9bccf]">{a.uplineName}</td>
                  <td className="px-3 py-2 text-[#a9bccf]">
                    {a.tenureRankCode
                      ? <span className={a.tenureExpired ? "text-[#e08b7a]" : ""}>
                          {a.tenureRankCode}{a.tenureExpired ? "・期滿待轉正" : `・至 ${a.tenureUntil ?? "—"}`}
                        </span>
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.personalCases}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(a.personalFees)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.teamCases}</td>
                  <td className="px-3 py-2"><TrackCell t={a.trackA} /></td>
                  <td className="px-3 py-2"><TrackCell t={a.trackB} /></td>
                  <td className="px-3 py-2 text-xs">
                    {a.maintExempt ? (
                      <span className="text-[#a9bccf]">豁免</span>
                    ) : (
                      <span className={a.maintPass ? "text-[#7fb894]" : "text-[#c99a5b]"}>
                        執案 {a.maintExecPass ? "✓" : `${a.maintExec}`}・訓練 {a.maintHours}h {a.maintTrainPass ? "✓" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a.canRecruit && a.canReceiveLeads ? (
                      <span className="text-[#7fb894]">正常</span>
                    ) : (
                      <span className="text-[#e08b7a]">
                        {!a.canRecruit && "停招募"}{!a.canRecruit && !a.canReceiveLeads && "・"}{!a.canReceiveLeads && "停派案"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className="text-xs text-[#a9bccf] underline"
                      onClick={() => setOpen(open === a.id ? null : a.id)}>
                      {open === a.id ? "收合" : "個人頁"}
                    </button>
                  </td>
                </tr>
                {open === a.id && (
                  <tr className="bg-[#0a2138]">
                    <td colSpan={12} className="px-4 py-4">
                      <AdvisorDetail a={a} rankCodes={rankCodes} peers={advisors} pending={pending} run={run} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-[#6f869c]">沒有符合的教練。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 金額門檻補千分位，件／人數維持裸數字（「累計個案數 1,2」很怪）。 */
function gapNum(g: GapView, which: "have" | "need" = "have"): string {
  const v = which === "have" ? g.have : g.need;
  return g.unit === "money" ? fmtMoney(v) : String(v);
}

function TrackCell({ t }: { t: TrackView }) {
  if (!t) return <span className="text-xs text-[#6f869c]">n/a</span>;
  if (t.met) return <span className="text-xs text-[#7fb894]">✓ 達標 → {t.toCode}</span>;
  const worst = t.gaps.filter((g) => !g.met)[0];
  return (
    <span className="text-xs text-[#a9bccf]">
      {worst ? `${worst.label} ${gapNum(worst)}/${gapNum(worst, "need")}` : "未設門檻"}
    </span>
  );
}

function AdvisorDetail({
  a, rankCodes, peers, pending, run,
}: {
  a: AdvisorView;
  rankCodes: string[];
  peers: AdvisorView[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string; note?: string }>, okText: string) => void;
}) {
  const [f, setF] = useState({
    entryType: a.entryType ?? "",
    hireDate: a.hireDate ?? "",
    sponsorId: a.sponsorId ?? "",
    tenureRankCode: a.tenureRankCode ?? "",
    tenureUntil: a.tenureUntil ?? "",
    initialCases: String(a.initialCases ?? 0),
    initialFees: String(a.initialFees ?? 0),
    recruitAllowed: a.recruitAllowed === null ? "" : String(a.recruitAllowed),
    leadAllowed: a.leadAllowed === null ? "" : String(a.leadAllowed),
  });
  const [rank, setRank] = useState(a.rankCode ?? "");
  const [rankNote, setRankNote] = useState("");

  const cls = (v: string) => (v ? INPUT : EMPTY);

  return (
    <div className="space-y-4">
      {/* 雙軌進度 */}
      <div className="grid gap-3 md:grid-cols-2">
        {[["A 軌（個人）", a.trackA], ["B 軌（個人＋團隊）", a.trackB]].map(([title, t]) => (
          <div key={title as string} className="rounded-lg border border-white/10 bg-[#0d2b45] p-3">
            <div className="text-sm font-bold mb-2">{title as string}</div>
            {!t ? (
              <p className="text-xs text-[#6f869c]">
                {a.blocked ?? "此職級未開放這一軌（門檻未設定或不適用）"}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-[#a9bccf]">目標職級 {(t as NonNullable<TrackView>).toCode}</div>
                {(t as NonNullable<TrackView>).gaps.map((g) => {
                  const pct = g.need > 0 ? Math.min(100, Math.round((g.have / g.need) * 100)) : 100;
                  return (
                    <div key={g.label}>
                      <div className="flex justify-between text-xs">
                        <span className="text-[#cfdcea]">{g.label}</span>
                        <span className={g.met ? "text-[#7fb894]" : "text-[#a9bccf]"}>
                          {gapNum(g)} / {gapNum(g, "need")}
                        </span>
                      </div>
                      <div className="h-1.5 rounded bg-[#0a2138] overflow-hidden mt-0.5">
                        <div className="h-full" style={{ width: `${pct}%`, background: g.met ? "#6f8f74" : "#2b7cb5" }} />
                      </div>
                    </div>
                  );
                })}
                {(t as NonNullable<TrackView>).gaps.length === 0 && (
                  <p className="text-xs text-[#6f869c]">門檻未設定 —— 這一軌目前不啟用。</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {a.tenureRankCode && (
        <div className="rounded-lg border border-[#e0bd8b]/30 bg-[#e0bd8b]/5 p-3 text-xs text-[#e0bd8b]">
          真除中（核定 {a.tenureRankCode}，期限 {a.tenureUntil ?? "—"}）
          {a.tenureSettledCode && (
            <>：以目前進度期滿將轉正為 <b>{a.tenureSettledCode}</b>。{a.tenureNote}</>
          )}
        </div>
      )}

      {/* 可編欄位 */}
      <div className="rounded-lg border border-white/10 bg-[#0d2b45] p-3">
        <div className="text-sm font-bold mb-2">制度欄位</div>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-xs text-[#a9bccf]">進入方式
            <select value={f.entryType} onChange={(e) => setF({ ...f, entryType: e.target.value })}
              className={`${cls(f.entryType)} w-full mt-0.5`}>
              <option value="">未設定</option>
              <option value="training">培訓認證</option>
              <option value="recruit">同業招募</option>
              <option value="rejoin">回任</option>
            </select>
          </label>
          <label className="text-xs text-[#a9bccf]">到職日
            <input type="date" value={f.hireDate} onChange={(e) => setF({ ...f, hireDate: e.target.value })}
              className={`${cls(f.hireDate)} w-full mt-0.5`} />
          </label>
          <label className="text-xs text-[#a9bccf]">推薦人
            <select value={f.sponsorId} onChange={(e) => setF({ ...f, sponsorId: e.target.value })}
              className={`${cls(f.sponsorId)} w-full mt-0.5`}>
              <option value="">未設定</option>
              {peers.filter((p) => p.id !== a.id).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[#a9bccf]">真除核定職級
            <select value={f.tenureRankCode} onChange={(e) => setF({ ...f, tenureRankCode: e.target.value })}
              className={`${cls(f.tenureRankCode)} w-full mt-0.5`}>
              <option value="">非真除</option>
              {rankCodes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-[#a9bccf]">真除期限
            <input type="date" value={f.tenureUntil} onChange={(e) => setF({ ...f, tenureUntil: e.target.value })}
              className={`${cls(f.tenureUntil)} w-full mt-0.5`} />
          </label>
          <div />
          <label className="text-xs text-[#a9bccf]">期初案數（同業帶入）
            <input type="number" value={f.initialCases} onChange={(e) => setF({ ...f, initialCases: e.target.value })}
              className={`${INPUT} w-full mt-0.5`} />
          </label>
          <label className="text-xs text-[#a9bccf]">期初顧問費
            <MoneyInput value={f.initialFees === "" ? null : Number(f.initialFees)} allowEmpty
              onChange={(v) => setF({ ...f, initialFees: v === null ? "" : String(v) })}
              className={`${INPUT} w-full mt-0.5`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[#a9bccf]">招募資格
              <select value={f.recruitAllowed} onChange={(e) => setF({ ...f, recruitAllowed: e.target.value })}
                className={`${cls(f.recruitAllowed)} w-full mt-0.5`}>
                <option value="">自動判定</option>
                <option value="true">強制開放</option>
                <option value="false">強制停用</option>
              </select>
            </label>
            <label className="text-xs text-[#a9bccf]">受派資格
              <select value={f.leadAllowed} onChange={(e) => setF({ ...f, leadAllowed: e.target.value })}
                className={`${cls(f.leadAllowed)} w-full mt-0.5`}>
                <option value="">自動判定</option>
                <option value="true">強制開放</option>
                <option value="false">強制停用</option>
              </select>
            </label>
          </div>
        </div>
        <button type="button" disabled={pending} className={`${BTN_SOLID} mt-3`}
          onClick={() => run(() => saveAdvisorAction(a.id, {
            entryType: f.entryType || null,
            hireDate: f.hireDate || null,
            sponsorId: f.sponsorId || null,
            tenureRankCode: f.tenureRankCode || null,
            tenureUntil: f.tenureUntil || null,
            initialCases: Number(f.initialCases) || 0,
            initialFees: Number(f.initialFees) || 0,
            recruitAllowed: f.recruitAllowed === "" ? null : f.recruitAllowed === "true",
            leadAllowed: f.leadAllowed === "" ? null : f.leadAllowed === "true",
          }), "已儲存")}>
          儲存制度欄位
        </button>
      </div>

      {/* 職級調整 */}
      <div className="rounded-lg border border-white/10 bg-[#0d2b45] p-3">
        <div className="text-sm font-bold mb-2">職級調整</div>
        <p className="text-xs text-[#7f9ab2] mb-2">
          手動調整一律要填原因，並寫進下方異動紀錄——職級直接影響分潤，改過什麼必須查得到。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={rank} onChange={(e) => setRank(e.target.value)} className={`${cls(rank)} w-28`}>
            <option value="">未設定</option>
            {rankCodes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={rankNote} onChange={(e) => setRankNote(e.target.value)} placeholder="異動原因（必填）"
            className={`${cls(rankNote)} flex-1 min-w-[200px]`} />
          <button type="button" disabled={pending || rank === (a.rankCode ?? "") || !rankNote.trim()} className={BTN}
            onClick={() => run(() => setRankAction(a.id, rank || null, rankNote), "職級已調整")}>
            套用
          </button>
        </div>
      </div>

      {/* 異動時間軸 */}
      <div className="rounded-lg border border-white/10 bg-[#0d2b45] p-3">
        <div className="text-sm font-bold mb-2">異動紀錄</div>
        {a.events.length === 0 ? (
          <p className="text-xs text-[#6f869c]">尚無異動。</p>
        ) : (
          <ul className="space-y-1 text-xs text-[#a9bccf]">
            {a.events.map((e) => (
              <li key={e.id}>
                <span className="text-[#6f869c] mr-2">{e.effectiveAt ?? "—"}</span>
                {e.fromCode ?? "—"} → <b className="text-[#e0bd8b]">{e.toCode ?? "—"}</b>
                <span className="ml-2">（{REASON[e.reason] ?? e.reason}）</span>
                {e.note && <span className="ml-1 text-[#7f9ab2]">{e.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
