"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FIELD_SM } from "@/components/ui/Field";
import { STAGE_LABEL, STAGE_SEQ, type Stage } from "@/lib/caseEngine";
import type { SupportContact } from "@/lib/supportContact";
import type { FeedbackSettings } from "@/lib/serviceFeedback";
import { saveStageParamAction, saveSupportAction, saveFeedbackSettingsAction, addHolidayAction, removeHolidayAction } from "./actions";

const BTN = "text-xs rounded-md border border-line2 px-2.5 py-1.5 text-tx2 hover:bg-panel3 disabled:opacity-40";
const BTN_PRI = "text-xs rounded-md bg-brand text-onbrand px-3 py-1.5 disabled:opacity-40";
type StageRow = { stage: Stage; days: number; checklist: { k: string; label: string }[]; configured: boolean };

export default function ServiceSettings({ stages, support, feedback, holidays }: { stages: StageRow[]; support: SupportContact; feedback: FeedbackSettings; holidays: { day: string; label: string }[] }) {
  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-line bg-panel p-4">
        <h2 className="text-base font-bold">各階段預設期限與檢查清單</h2>
        <p className="text-xs text-tx2 mt-1 mb-3">起算點＝上一階段實際完成日（第 4 階＝建案日）。清單是教練端勾選、客戶端看得到的「本階段應完成項目」；改清單只影響之後開始的階段。</p>
        <div className="grid gap-3">{stages.map((s) => <StageEditor key={s.stage} s={s} />)}</div>
      </section>
      <HolidayEditor holidays={holidays} />
      <SupportEditor support={support} />
      <FeedbackEditor feedback={feedback} />
    </div>
  );
}

function StageEditor({ s }: { s: StageRow }) {
  const router = useRouter();
  const [days, setDays] = useState(String(s.days));
  const [list, setList] = useState(s.checklist);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => { const r = await saveStageParamAction(s.stage, Number(days), list); setMsg(r.ok ? "已儲存" : r.error); if (r.ok) router.refresh(); });
  return (
    <div className="rounded-lg border border-line bg-panel2 p-3 grid gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <b>{STAGE_SEQ[s.stage]}・{STAGE_LABEL[s.stage]}</b>
        <label className="flex items-center gap-1 text-xs">預設 <input className={`${FIELD_SM} w-16 text-right`} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /> 天</label>
        {!s.configured && <span className="text-10 text-tx3">（程式預設，尚未自訂）</span>}
        <span className="ml-auto flex items-center gap-2 text-xs">{msg && <span className="text-tx3">{msg}</span>}<button className={BTN_PRI} disabled={pending} onClick={save}>儲存</button></span>
      </div>
      <ul className="grid gap-1">
        {list.map((c, i) => (
          <li key={i} className="flex gap-1 items-center">
            <input className={`${FIELD_SM} w-28`} value={c.k} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} placeholder="鍵" />
            <input className={`${FIELD_SM} flex-1`} value={c.label} onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="項目" />
            <button className={BTN} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>刪</button>
          </li>
        ))}
      </ul>
      <button className={`${BTN} justify-self-start`} onClick={() => setList((l) => [...l, { k: "", label: "" }])}>＋ 項目</button>
      <p className="text-10 text-tx3">鍵（contract／paid／setup／goals／kyc／draft／meet／explain／decision／review）是系統自動勾選用的對照；自訂項目用別的鍵即可。</p>
    </div>
  );
}

function HolidayEditor({ holidays }: { holidays: { day: string; label: string }[] }) {
  const router = useRouter();
  const [day, setDay] = useState("");
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="text-base font-bold">假日表</h2>
      <p className="text-xs text-tx2 mt-1 mb-3">逾期升級的「3 個工作日」「5 個工作日」跳過週六日與這裡的日期。</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {holidays.map((h) => <span key={h.day} className="text-xs rounded-full border border-line px-2 py-0.5 inline-flex items-center gap-1">{h.day}{h.label ? ` ${h.label}` : ""}<button className="text-tx3 hover:text-danger" disabled={pending} onClick={() => start(async () => { await removeHolidayAction(h.day); router.refresh(); })}>×</button></span>)}
        {!holidays.length && <span className="text-xs text-tx3">尚未設定。</span>}
      </div>
      <div className="flex gap-1">
        <input type="date" className={FIELD_SM} value={day} onChange={(e) => setDay(e.target.value)} />
        <input className={FIELD_SM} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="名稱（選填）" />
        <button className={BTN_PRI} disabled={pending || !day} onClick={() => start(async () => { const r = await addHolidayAction(day, label); if (r.ok) { setDay(""); setLabel(""); router.refresh(); } })}>加入</button>
      </div>
    </section>
  );
}

function SupportEditor({ support }: { support: SupportContact }) {
  const router = useRouter();
  const [v, setV] = useState<SupportContact>(support);
  const [safety, setSafety] = useState(support.safety.join("\n"));
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const F = (k: keyof SupportContact, label: string, ph = "") => (
    <label className="grid gap-1 text-xs"><span className="text-tx3">{label}</span><input className={FIELD_SM} value={String(v[k] ?? "")} placeholder={ph} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
  );
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="text-base font-bold">聯絡客服面板（會員中心右側）</h2>
      <p className="text-xs text-tx2 mt-1 mb-3">客戶知道問題該找誰；留空的項目顯示「—」。</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs sm:col-span-2"><span className="text-tx3">引言</span><input className={FIELD_SM} value={v.intro} onChange={(e) => setV({ ...v, intro: e.target.value })} /></label>
        {F("line", "LINE 官方帳號", "@lantu")}{F("lineUrl", "LINE 連結", "https://lin.ee/…")}{F("lineHours", "LINE 回覆時段")}
        {F("phone", "客服專線", "02-…")}{F("phoneHours", "專線時段")}{F("email", "客服信箱")}{F("emailNote", "信箱說明")}
        <label className="grid gap-1 text-xs sm:col-span-2"><span className="text-tx3">防詐／安全提示（一行一條）</span><textarea className={`${FIELD_SM} min-h-16`} value={safety} onChange={(e) => setSafety(e.target.value)} /></label>
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs">{msg && <span className="text-tx3">{msg}</span>}<button className={`${BTN_PRI} ml-auto`} disabled={pending} onClick={() => start(async () => { const r = await saveSupportAction({ ...v, safety: safety.split("\n") }); setMsg(r.ok ? "已儲存" : r.error); if (r.ok) router.refresh(); })}>儲存</button></div>
    </section>
  );
}

function FeedbackEditor({ feedback }: { feedback: FeedbackSettings }) {
  const router = useRouter();
  const [qs, setQs] = useState(feedback.questions.join("\n"));
  const [th, setTh] = useState(String(feedback.threshold));
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <h2 className="text-base font-bold">服務回饋問卷</h2>
      <p className="text-xs text-tx2 mt-1 mb-3">結案（服務完成）時自動發給客戶；每題 1–5 分。平均低於門檻 → 案件標「低分回饋」→ 通知客戶關係（沒有就通知管理員）。</p>
      <div className="grid gap-2">
        <label className="grid gap-1 text-xs"><span className="text-tx3">題目（一行一題）</span><textarea className={`${FIELD_SM} min-h-24`} value={qs} onChange={(e) => setQs(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs">低分門檻（平均低於）<input className={`${FIELD_SM} w-16 text-right`} value={th} onChange={(e) => setTh(e.target.value)} /></label>
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs">{msg && <span className="text-tx3">{msg}</span>}<button className={`${BTN_PRI} ml-auto`} disabled={pending} onClick={() => start(async () => { const r = await saveFeedbackSettingsAction({ questions: qs.split("\n"), threshold: Number(th) }); setMsg(r.ok ? "已儲存" : r.error); if (r.ok) router.refresh(); })}>儲存</button></div>
    </section>
  );
}
