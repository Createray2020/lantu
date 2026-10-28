"use client";

import { useState, useTransition } from "react";
import type { SupportContact } from "@/lib/supportContact";
import { STAGE_LABEL, STAGE_SEQ, STAGE_CLIENT_HINT, STAGE_OWNER_HINT, STAGE_TIME_HINT, DECISION_LABEL, type Stage } from "@/lib/caseEngine";
import { askCoachAction } from "./caseActions";

// 客戶端會員中心（2026/10/28 案件進度 ⑥，照提案書圖 1–6）：
//   四張卡（目前階段／專屬教練／下次會談／完成進度）＋ 五階段時間軸（展開看本階段應完成項目、預計時間說明、備註）＋ 右側聯絡客服。
// ⚠️ 客戶只看「承諾／實際完成日」，預計日留教練端。語彙叫「服務進度」；財務階段（整裝／啟程…）另一條，不混。

export type MemberStage = {
  stage: Stage; progress: "done" | "active" | "pending";
  due: { kind: "actual" | "promised" | null; date: string | null };
  expectedDate: string | null; promisedDate: string | null; actualDate: string | null;
  checklist: { label: string; done: boolean }[];
  note: string; decision: string;
};
export type MemberCenterData = {
  name: string; caseNo: string; startedAt: string | null; stage: Stage; status: string; waiting: { since: string | null; note: string } | null;
  done: number; total: number; coachName: string; nextMeeting: string | null;
  stages: MemberStage[];
  todos: { id: string; title: string; dueDate: string | null; done: boolean }[];
  support: SupportContact;
};

const fmt = (d: string | null) => (d ? d.replace(/-/g, "/") : "—");
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
function fmtMeeting(iso: string | null): string {
  if (!iso) return "尚未排定";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const hm = iso.length > 10 ? ` ${iso.slice(11, 16)}` : "";
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")} (${WEEK[d.getDay()]})${hm}`;
}

export default function MemberCenter({ d }: { d: MemberCenterData }) {
  const [open, setOpen] = useState<Stage | null>(d.stage);
  const [ask, setAsk] = useState(false);
  const pct = Math.round((d.done / d.total) * 100);
  const statusLine = d.status === "paused" ? "你的服務目前暫停中，重新啟動後會通知你。" : d.status === "closed" ? "約定的服務已完成，謝謝你的信任。" : `從 ${fmt(d.startedAt)} 開始，你的規劃正在進行中。有任何問題都可以隨時找客服或你的教練。`;
  return (
    <section className="max-w-6xl mx-auto mb-12">
      <div className="mb-6">
        <div className="text-brand text-xs tracking-[0.3em] mb-2">MY PLAN</div>
        <h1 className="font-serif text-3xl mb-2">嗨，{d.name}，這是你的服務進度</h1>
        <p className="text-tx2 text-sm">{statusLine}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Card icon="◎" label="目前階段" value={d.status === "closed" ? "服務完成" : STAGE_LABEL[d.stage]} />
        <Card icon="✦" label="專屬教練" value={d.coachName || "—"} />
        <Card icon="▣" label="下次會談" value={fmtMeeting(d.nextMeeting)} />
        <Card icon="◐" label="完成進度" value={`${d.done} / ${d.total} 階段`} />
      </div>
      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <div>
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-brand text-xs tracking-[0.3em] mb-1">CASE PROGRESS</div>
              <h2 className="font-serif text-2xl">服務進度</h2>
            </div>
            <div className="text-sm text-tx2">已完成 <b className="text-brand2">{d.done}</b> / {d.total} 個階段</div>
          </div>
          <div className="h-1.5 rounded-full bg-tx/10 overflow-hidden mb-3"><div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} /></div>
          <div className="grid sm:grid-cols-3 gap-2 mb-4 text-11">
            <div className="rounded-lg border border-line bg-panel2 px-3 py-2 flex gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-tx3 shrink-0" /><div><b>預計完成日</b><div className="text-tx3">依預設流程的基準日期</div></div></div>
            <div className="rounded-lg border border-line bg-panel2 px-3 py-2 flex gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand2 shrink-0" /><div><b>承諾完成日</b><div className="text-tx3">與客戶確認後的日期</div></div></div>
            <div className="rounded-lg border border-line bg-panel2 px-3 py-2 flex gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-ok shrink-0" /><div><b>實際完成日</b><div className="text-tx3">系統留下的完成紀錄</div></div></div>
          </div>
          {d.waiting && (
            <div className="rounded-lg border border-brand/40 bg-brand/10 px-4 py-3 mb-4 text-sm">
              <b className="text-brand2">等你一下：</b>{d.waiting.note || "教練在等你回覆或補件"}{d.waiting.since ? <span className="text-tx3 text-xs">（自 {fmt(d.waiting.since)}）</span> : null}
            </div>
          )}
          <ol className="relative">
            {d.stages.map((s, i) => {
              const isOpen = open === s.stage;
              const last = i === d.stages.length - 1;
              return (
                <li key={s.stage} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className={`grid place-items-center w-10 h-10 rounded-full text-sm font-bold shrink-0 ${s.progress === "done" ? "bg-ok text-onsolid" : s.progress === "active" ? "bg-brand text-onbrand" : "border border-line text-tx3"}`}>{s.progress === "done" ? "✓" : String(STAGE_SEQ[s.stage]).padStart(2, "0")}</span>
                    {!last && <span className="w-px flex-1 bg-line my-1" />}
                  </div>
                  <div className={`flex-1 mb-3 rounded-xl border bg-panel2 ${s.progress === "active" ? "border-brand/50" : "border-line"}`}>
                    <button type="button" className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1" onClick={() => setOpen(isOpen ? null : s.stage)} aria-expanded={isOpen}>
                      <span className="font-serif text-lg">{STAGE_LABEL[s.stage]}</span>
                      <span className={`text-11 rounded-full px-2 py-0.5 border ${s.progress === "done" ? "border-ok text-ok" : s.progress === "active" ? "border-brand2 text-brand2" : "border-line text-tx3"}`}>{s.progress === "done" ? "已完成" : s.progress === "active" ? "進行中" : "待開始"}</span>
                      <span className="ml-auto text-tx3 text-lg leading-none">{isOpen ? "−" : "+"}</span>
                      <span className="w-full text-xs text-tx3 flex flex-wrap gap-x-3">
                        {s.promisedDate && <span>▦ 承諾 {fmt(s.promisedDate)}</span>}
                        {s.actualDate && <span className="text-ok">✓ 實際 {fmt(s.actualDate)}</span>}
                        {!s.promisedDate && !s.actualDate && s.progress !== "pending" && <span>▦ 日期確認中</span>}
                        <span>⚇ {STAGE_OWNER_HINT[s.stage]}</span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 grid gap-3 text-sm border-t border-line pt-3">
                        <p className="text-tx2">{STAGE_CLIENT_HINT[s.stage]}</p>
                        {s.checklist.length > 0 && (
                          <div>
                            <div className="text-xs mb-1.5"><b>☷ 本階段應完成項目</b> <span className="text-tx3">{s.checklist.filter((c) => c.done).length} / {s.checklist.length} 項</span></div>
                            <ul className="grid sm:grid-cols-2 gap-1">
                              {s.checklist.map((c, j) => <li key={j} className="flex items-center gap-2 text-sm"><span className={`w-4 h-4 rounded-full grid place-items-center text-10 ${c.done ? "bg-ok text-onsolid" : "border border-line2 text-transparent"}`}>✓</span><span className={c.done ? "text-tx3" : ""}>{c.label}</span></li>)}
                            </ul>
                          </div>
                        )}
                        {s.stage === "report" && s.decision && <div className="text-xs text-tx2">你的決定：<b>{DECISION_LABEL[s.decision] ?? s.decision}</b></div>}
                        <div className="grid sm:grid-cols-3 gap-2">
                          <DateBox tone="plain" label="預計完成日" date={s.expectedDate} sub="依預設流程產生的基準日期" />
                          <DateBox tone="brand" label="承諾完成日" date={s.promisedDate} sub="教練與客戶確認後的日期" />
                          <DateBox tone="ok" label="實際完成日" date={s.actualDate} sub="實際完成時由系統留下的紀錄" empty="尚未紀錄" />
                        </div>
                        <div className="rounded-lg bg-panel px-3 py-2 text-xs"><span className="text-tx3">⏱ </span><b>預計時間：</b><span className="text-tx2">{STAGE_TIME_HINT[s.stage]}</span></div>
                        {s.note && <div className="rounded-lg bg-panel px-3 py-2 text-xs text-tx2"><span className="text-tx3">ⓘ </span>{s.note}</div>}
                        {s.progress === "active" && d.todos.filter((t) => !t.done).length > 0 && (
                          <div>
                            <div className="text-11 text-tx3 mb-1">需要你配合的事</div>
                            <ul className="grid gap-1">{d.todos.filter((t) => !t.done).map((t) => <li key={t.id} className="text-sm flex gap-2"><span className="text-brand2">•</span><span>{t.title}</span>{t.dueDate && <span className="text-11 text-tx3">期限 {fmt(t.dueDate)}</span>}</li>)}</ul>
                          </div>
                        )}
                        {s.stage === "tracking" && <p className="text-11 text-tx3">僅執行約定服務方案內的行動計畫。</p>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <aside className="rounded-2xl border border-line bg-panel2 p-5 h-fit">
          <div className="text-brand text-xs tracking-[0.3em] mb-1">CONTACT SUPPORT</div>
          <h3 className="font-serif text-2xl mb-2">聯絡客服</h3>
          <p className="text-xs text-tx2 mb-2">{d.support.intro}</p>
          <p className="text-11 text-tx3 mb-4">◷ 最快回覆：LINE 官方帳號</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Tile href={d.support.lineUrl || undefined} icon="L" title="LINE 客服" main={d.support.line || "—"} sub={d.support.lineHours} />
            <Tile href={d.support.phone ? `tel:${d.support.phone}` : undefined} icon="☎" title="客服專線" main={d.support.phone || "—"} sub={d.support.phoneHours} />
            <Tile href={d.support.email ? `mailto:${d.support.email}` : undefined} icon="✉" title="客服信箱" main={d.support.email || "—"} sub={d.support.emailNote} />
            <Tile onClick={() => setAsk(true)} icon="✦" title="我的教練" main={d.coachName || "—"} sub="規劃相關問題直接問教練" />
          </div>
          <ul className="text-11 text-tx3 grid gap-1">{d.support.safety.map((s, i) => <li key={i}>{i === 0 ? "⛨" : "ⓘ"} {s}</li>)}</ul>
          {ask && <AskForm onClose={() => setAsk(false)} coachName={d.coachName} />}
        </aside>
      </div>
    </section>
  );
}

function Card({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel2 p-4">
      <div className="w-8 h-8 rounded-lg bg-brand/15 text-brand2 grid place-items-center text-sm mb-3">{icon}</div>
      <div className="text-11 text-tx3">{label}</div>
      <div className="font-bold text-base mt-0.5 truncate">{value}</div>
    </div>
  );
}
function Tile({ href, onClick, icon, title, main, sub }: { href?: string; onClick?: () => void; icon: string; title: string; main: string; sub: string }) {
  const inner = (
    <>
      <div className="w-9 h-9 rounded-lg bg-panel grid place-items-center text-brand2 text-sm shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-11 text-tx3">{title}</div>
        <div className="text-sm font-bold truncate">{main}</div>
        <div className="text-10 text-tx3">{sub}</div>
      </div>
      <span className="text-tx3 text-xs shrink-0">↗</span>
    </>
  );
  const cls = ["rounded-lg p-3 flex gap-2 items-start text-left", "border border-line hover:border-brand/50", "bg-panel/60"].join(" ");
  if (href) return <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={cls}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}
function AskForm({ onClose, coachName }: { onClose: () => void; coachName: string }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 rounded-lg border border-brand/40 bg-brand/5 p-3 grid gap-2">
      <div className="text-sm font-bold">問教練{coachName ? `（${coachName}）` : ""}</div>
      <textarea className="bg-field border border-line2 rounded px-2 py-1 text-sm min-h-20" value={text} onChange={(e) => setText(e.target.value)} placeholder="把你的問題寫在這裡，教練會在站內看到並回覆你。" />
      {msg && <p className="text-xs text-brand2">{msg}</p>}
      <div className="flex justify-end gap-2">
        <button className="text-xs text-tx2 px-2 py-1" onClick={onClose}>關閉</button>
        <button className="text-xs rounded-md bg-brand text-onbrand px-3 py-1.5 disabled:opacity-40" disabled={pending || !text.trim()} onClick={() => start(async () => { const r = await askCoachAction(text); setMsg(r.ok ? "已送出，教練會在站內看到。" : r.error); if (r.ok) setText(""); })}>送出</button>
      </div>
    </div>
  );
}

function DateBox({ tone, label, date, sub, empty = "—" }: { tone: "plain" | "brand" | "ok"; label: string; date: string | null; sub: string; empty?: string }) {
  const border = tone === "brand" && date ? "border-brand2/60" : tone === "ok" && date ? "border-ok/50" : "border-line";
  return (
    <div className={`rounded-lg border ${border} bg-panel px-3 py-2`}>
      <div className="text-11 text-tx3">{tone === "plain" ? "▦" : tone === "brand" ? "▦" : "◷"} {label}</div>
      <div className="text-sm font-bold mt-0.5">{date ? date.replace(/-/g, "/") : empty}</div>
      <div className="text-10 text-tx3">{sub}</div>
    </div>
  );
}
