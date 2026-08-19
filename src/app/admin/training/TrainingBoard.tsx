"use client";

// 訓練時數與研討會。維持資格的訓練門檻要有資料來源，否則那個「8 小時」只是紙上規定。

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addExternalAction, createSessionAction, markAttendanceAction, reviewExternalAction,
} from "./actions";

const INPUT = "bg-[#0d2b45] border border-white/15 rounded px-2 py-1 text-sm text-[#eef2f7] outline-none";
const EMPTY = "bg-[#0d2b45] border border-dashed border-[#3d5b78] rounded px-2 py-1 text-sm text-[#8fa6ba] outline-none";
const BTN = "rounded-lg px-3 py-1.5 text-sm border border-white/15 text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-40";
const BTN_SOLID = "rounded-lg px-3 py-1.5 text-sm bg-[#1d5c8a] border border-[#2b7cb5] text-white hover:bg-[#226ba0] disabled:opacity-40";

export type SessionView = {
  id: string; heldOn: string; topic: string; mode: string; hours: number | null;
  speakerId: string | null; speakerName: string; attendees: { id: string; name: string; kind: string; hours: number }[];
};
export type ExternalView = {
  id: string; coachName: string; title: string | null; hours: number; status: string; year: number;
};
export type HoursRow = {
  id: string; name: string; internal: number; speaker: number; external: number;
  externalRaw: number; total: number; need: number | null; pass: boolean;
};
export type Peer = { id: string; name: string };

export default function TrainingBoard({
  sessions, externals, hours, peers, year, perSession, speakerMult, cap,
}: {
  sessions: SessionView[];
  externals: ExternalView[];
  hours: HoursRow[];
  peers: Peer[];
  year: number;
  perSession: number | null;
  speakerMult: number | null;
  cap: number | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [openRoll, setOpenRoll] = useState<string | null>(null);
  const [form, setForm] = useState({ heldOn: "", topic: "", mode: "onsite", hours: "", speakerId: "" });
  const [ext, setExt] = useState({ coachId: peers[0]?.id ?? "", title: "", hours: "" });

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
      {msg && (
        <div className={`text-sm ${msg.ok ? "text-[#7fb894]" : "text-[#e08b7a]"}`}>
          {msg.ok ? `${msg.text} ✓` : `失敗：${msg.text}`}
        </div>
      )}

      {/* 新增場次 */}
      <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
        <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-1">研討會場次</h3>
        <p className="text-xs text-[#7f9ab2] mb-3">
          每場預設認列 {perSession ?? "（未設定）"} 小時，講師 ×{speakerMult ?? 1} 倍；
          外部課程年度上限 {cap ?? "不設限"} 小時。這些數字都在「業務制度 › 維持資格」設定。
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[#a9bccf]">日期
            <input type="date" value={form.heldOn} onChange={(e) => setForm({ ...form, heldOn: e.target.value })}
              className={`${form.heldOn ? INPUT : EMPTY} w-40 block mt-0.5`} />
          </label>
          <label className="text-xs text-[#a9bccf] flex-1 min-w-[180px]">主題
            <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder="例：高資產客戶稅務實務"
              className={`${form.topic ? INPUT : EMPTY} w-full block mt-0.5`} />
          </label>
          <label className="text-xs text-[#a9bccf]">形式
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
              className={`${INPUT} w-28 block mt-0.5`}>
              <option value="onsite">實體</option><option value="online">線上</option><option value="hybrid">混合</option>
            </select>
          </label>
          <label className="text-xs text-[#a9bccf]">認列時數
            <input type="number" step="any" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })}
              placeholder={perSession != null ? String(perSession) : "未設定"}
              className={`${form.hours ? INPUT : EMPTY} w-24 block mt-0.5`} />
          </label>
          <label className="text-xs text-[#a9bccf]">講師
            <select value={form.speakerId} onChange={(e) => setForm({ ...form, speakerId: e.target.value })}
              className={`${form.speakerId ? INPUT : EMPTY} w-32 block mt-0.5`}>
              <option value="">（無）</option>
              {peers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={pending} className={BTN_SOLID}
            onClick={() => run(() => createSessionAction({
              heldOn: form.heldOn, topic: form.topic, mode: form.mode,
              hours: form.hours === "" ? null : Number(form.hours),
              speakerId: form.speakerId || null,
            }), "場次已新增")}>
            新增場次
          </button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
                <th className="px-3 py-2">日期</th><th className="px-3 py-2">主題</th>
                <th className="px-3 py-2">形式</th><th className="px-3 py-2">講師</th>
                <th className="px-3 py-2 text-right">出席</th><th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <Fragment key={s.id}>
                  <tr className="border-t border-white/8">
                    <td className="px-3 py-2 text-[#a9bccf]">{s.heldOn}</td>
                    <td className="px-3 py-2 font-semibold">{s.topic}</td>
                    <td className="px-3 py-2 text-[#a9bccf]">
                      {s.mode === "online" ? "線上" : s.mode === "hybrid" ? "混合" : "實體"}
                    </td>
                    <td className="px-3 py-2 text-[#a9bccf]">{s.speakerName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.attendees.length}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-xs text-[#a9bccf] underline"
                        onClick={() => setOpenRoll(openRoll === s.id ? null : s.id)}>
                        {openRoll === s.id ? "收合" : "點名"}
                      </button>
                    </td>
                  </tr>
                  {openRoll === s.id && (
                    <tr className="bg-[#0a2138]">
                      <td colSpan={6} className="px-4 py-3">
                        <RollCall session={s} peers={peers} pending={pending}
                          onSave={(ids) => run(() => markAttendanceAction(s.id, ids), "出席已更新")} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-[#6f869c]">尚無場次。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 外部課程 */}
      <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
        <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">外部課程認列</h3>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <label className="text-xs text-[#a9bccf]">顧問
            <select value={ext.coachId} onChange={(e) => setExt({ ...ext, coachId: e.target.value })}
              className={`${INPUT} w-32 block mt-0.5`}>
              {peers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-[#a9bccf] flex-1 min-w-[180px]">課程
            <input value={ext.title} onChange={(e) => setExt({ ...ext, title: e.target.value })}
              className={`${ext.title ? INPUT : EMPTY} w-full block mt-0.5`} />
          </label>
          <label className="text-xs text-[#a9bccf]">時數
            <input type="number" step="any" value={ext.hours} onChange={(e) => setExt({ ...ext, hours: e.target.value })}
              className={`${ext.hours ? INPUT : EMPTY} w-24 block mt-0.5`} />
          </label>
          <button type="button" disabled={pending || !ext.title || !ext.hours} className={BTN}
            onClick={() => run(() => addExternalAction({
              coachId: ext.coachId, year, hours: Number(ext.hours), title: ext.title,
            }), "已建立待審申請")}>
            建立申請
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
                <th className="px-3 py-2">申請人</th><th className="px-3 py-2">課程</th>
                <th className="px-3 py-2 text-right">時數</th><th className="px-3 py-2">狀態</th>
                <th className="px-3 py-2 text-right">動作</th>
              </tr>
            </thead>
            <tbody>
              {externals.map((x) => (
                <tr key={x.id} className="border-t border-white/8">
                  <td className="px-3 py-2">{x.coachName}</td>
                  <td className="px-3 py-2 text-[#a9bccf]">{x.title ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{x.hours}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={
                      x.status === "approved" ? "text-[#7fb894]"
                        : x.status === "rejected" ? "text-[#e08b7a]" : "text-[#e0bd8b]"
                    }>
                      {x.status === "approved" ? "已核准" : x.status === "rejected" ? "已退回" : "待審"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {x.status !== "approved" && (
                      <button type="button" disabled={pending} className={`${BTN} mr-1`}
                        onClick={() => run(() => reviewExternalAction(x.id, true), "已核准")}>核准</button>
                    )}
                    {x.status !== "rejected" && (
                      <button type="button" disabled={pending} className={BTN}
                        onClick={() => run(() => reviewExternalAction(x.id, false), "已退回")}>退回</button>
                    )}
                  </td>
                </tr>
              ))}
              {externals.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-[#6f869c]">尚無外部課程申請。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 年度總表 */}
      <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
        <h3 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">{year} 年度訓練時數總表</h3>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
                <th className="px-3 py-2">顧問</th>
                <th className="px-3 py-2 text-right">內部研討會</th>
                <th className="px-3 py-2 text-right">講師加倍</th>
                <th className="px-3 py-2 text-right">外部（上限內）</th>
                <th className="px-3 py-2 text-right">合計</th>
                <th className="px-3 py-2 text-right">門檻</th>
                <th className="px-3 py-2">狀態</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h.id} className="border-t border-white/8">
                  <td className="px-3 py-2">{h.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{h.internal}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{h.speaker}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {h.external}
                    {h.externalRaw > h.external && (
                      <span className="text-[11px] text-[#6f869c]"> / 申請 {h.externalRaw}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{h.total}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#a9bccf]">{h.need ?? "未設定"}</td>
                  <td className="px-3 py-2 text-xs">
                    {h.need === null ? <span className="text-[#6f869c]">不檢查</span>
                      : h.pass ? <span className="text-[#7fb894]">✓ 達標</span>
                        : <span className="text-[#c99a5b]">差 {h.need - h.total}h</span>}
                  </td>
                </tr>
              ))}
              {hours.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#6f869c]">尚無顧問。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RollCall({
  session, peers, pending, onSave,
}: {
  session: SessionView; peers: Peer[]; pending: boolean; onSave: (ids: string[]) => void;
}) {
  const [sel, setSel] = useState<string[]>(session.attendees.filter((a) => a.kind !== "speaker").map((a) => a.id));
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {peers.map((p) => (
          <label key={p.id} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1 text-xs">
            <input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(p.id)}
              className="h-3.5 w-3.5 accent-[#2b7cb5]" />
            <span className={p.id === session.speakerId ? "text-[#e0bd8b]" : "text-[#cfdcea]"}>
              {p.name}{p.id === session.speakerId && "（講師）"}
            </span>
          </label>
        ))}
      </div>
      <button type="button" disabled={pending} className={BTN_SOLID} onClick={() => onSave(sel)}>
        儲存出席
      </button>
      <span className="ml-2 text-xs text-[#6f869c]">
        講師時數自動加倍，重複點名會更新而不是加倍。
      </span>
    </div>
  );
}
