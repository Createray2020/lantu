"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeGap, ntfmt, wan, type CrossInputs } from "@/lib/passport";
import type { ClientBasics } from "@/lib/clientPlan";
import type { ActiveCoach, LinkStatus } from "@/lib/coachLink";
import { normalizeIntent, defaultIntent, type Intent } from "@/lib/intent";
import IntentPicker from "./IntentPicker";
import { saveSetupAction, requestCoachAction, revokeCoachAction } from "./actions";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] text-[#a7bacb]">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
const inputCls =
  "w-full bg-[#0a1a28] border border-white/12 rounded-lg px-3 py-2 text-[#eef2f7] text-sm focus:border-[#c99a5b] outline-none";

const emptyBasics: ClientBasics = { name: "", birth: "", gender: "", phone: "", email: "", marital: "", dependents: 0 };
const emptyCross: CrossInputs = { income: 0, expense: 0, assets: 0, liabilities: 0 };

export default function SetupWizard({
  monthlyNeedWan, defaultName, basics, cross, intent, coaches, link,
}: {
  monthlyNeedWan: number; defaultName: string;
  basics: ClientBasics | null; cross: CrossInputs | null; intent: Intent | null;
  coaches: ActiveCoach[]; link: LinkStatus;
}) {
  const [b, setB] = useState<ClientBasics>(basics ?? { ...emptyBasics, name: defaultName });
  const [c, setC] = useState<CrossInputs>(cross ?? emptyCross);
  const [it, setIt] = useState<Intent>(intent ? normalizeIntent({ ...intent }) : defaultIntent());
  const [showGap, setShowGap] = useState<boolean>(!!cross);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [localLink, setLocalLink] = useState<LinkStatus>(link);
  const [selCoach, setSelCoach] = useState<string>("");
  const [reqStatus, setReqStatus] = useState<"idle" | "sending" | "error">("idle");
  const [reqErr, setReqErr] = useState<string | null>(null);

  const gap = useMemo(() => computeGap(monthlyNeedWan, c), [monthlyNeedWan, c]);
  const ratePct = Math.round(gap.achieveRate * 100);

  const setBasic = (k: keyof ClientBasics, v: string | number) => setB((p) => ({ ...p, [k]: v }));
  const setCross = (k: keyof CrossInputs, v: number) => { setC((p) => ({ ...p, [k]: v })); };

  async function onSubmitCurrent() {
    setSaveStatus("saving"); setSaveErr(null);
    try {
      const res = await saveSetupAction(b, c, it);
      if (res.ok) { setShowGap(true); setSaveStatus("idle"); }
      else { setSaveStatus("error"); setSaveErr(res.error || "儲存失敗"); }
    } catch (e) { setSaveStatus("error"); setSaveErr(e instanceof Error ? e.message : "儲存失敗"); }
  }

  async function onRequestCoach() {
    if (!selCoach) return;
    setReqStatus("sending"); setReqErr(null);
    try {
      const res = await requestCoachAction(selCoach);
      if (res.ok) {
        const co = coaches.find((x) => x.id === selCoach);
        setLocalLink({ state: "pending", coachName: co?.name ?? null });
        setReqStatus("idle");
      } else { setReqStatus("error"); setReqErr(res.error || "送出失敗"); }
    } catch (e) { setReqStatus("error"); setReqErr(e instanceof Error ? e.message : "送出失敗"); }
  }

  async function onRevoke() {
    if (!confirm("確定要解除與教練的連結嗎？")) return;
    setReqStatus("sending"); setReqErr(null);
    try {
      const res = await revokeCoachAction();
      if (res.ok) { setLocalLink({ state: "none" }); setSelCoach(""); setReqStatus("idle"); }
      else { setReqStatus("error"); setReqErr(res.error || "解除失敗"); }
    } catch (e) { setReqStatus("error"); setReqErr(e instanceof Error ? e.message : "解除失敗"); }
  }

  const numVal = (n: number) => (n === 0 ? "" : n);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
      <div className="text-center mb-6">
        <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-1">STEP 2 · 完善你的規劃</div>
        <h1 className="font-serif text-3xl">補上基本資料與財務現況</h1>
        <p className="text-[#a7bacb] text-sm mt-2">填完現況就能看到你的缺口與願景達成率，接著可以選一位教練陪你。</p>
      </div>

      {/* 基本資料 */}
      <section className="rounded-2xl bg-[#12334f] border border-white/8 p-5 sm:p-6 mb-4">
        <h2 className="font-serif text-lg mb-4">👤 基本資料</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="姓名"><input className={inputCls} value={b.name} onChange={(e) => setBasic("name", e.target.value)} /></Field>
          <Field label="生日"><input type="date" className={inputCls} value={b.birth} onChange={(e) => setBasic("birth", e.target.value)} /></Field>
          <Field label="性別">
            <select className={inputCls} value={b.gender} onChange={(e) => setBasic("gender", e.target.value)}>
              <option value="">請選擇</option><option value="男">男</option><option value="女">女</option>
            </select>
          </Field>
          <Field label="婚姻狀況">
            <select className={inputCls} value={b.marital} onChange={(e) => setBasic("marital", e.target.value)}>
              <option value="">請選擇</option><option value="未婚">未婚</option><option value="已婚">已婚</option><option value="其他">其他</option>
            </select>
          </Field>
          <Field label="聯絡電話"><input className={inputCls} value={b.phone} onChange={(e) => setBasic("phone", e.target.value)} /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={b.email} onChange={(e) => setBasic("email", e.target.value)} /></Field>
          <Field label="扶養人數"><input type="number" inputMode="numeric" className={inputCls} value={numVal(b.dependents)} placeholder="0" onChange={(e) => setBasic("dependents", parseInt(e.target.value, 10) || 0)} /></Field>
        </div>
      </section>

      <IntentPicker value={it} onChange={setIt} />

      {/* 財務現況十字表 */}
      <section className="rounded-2xl bg-[#12334f] border border-white/8 p-5 sm:p-6 mb-4">
        <h2 className="font-serif text-lg mb-1">➕ 財務現況十字表</h2>
        <p className="text-[11px] text-[#6f869c] mb-4">收入支出填「每月」，資產負債填「目前總額」（單位：元）。</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="每月收入"><input type="number" inputMode="numeric" className={inputCls} value={numVal(c.income)} placeholder="0" onChange={(e) => setCross("income", parseFloat(e.target.value) || 0)} /></Field>
          <Field label="每月支出"><input type="number" inputMode="numeric" className={inputCls} value={numVal(c.expense)} placeholder="0" onChange={(e) => setCross("expense", parseFloat(e.target.value) || 0)} /></Field>
          <Field label="總資產"><input type="number" inputMode="numeric" className={inputCls} value={numVal(c.assets)} placeholder="0" onChange={(e) => setCross("assets", parseFloat(e.target.value) || 0)} /></Field>
          <Field label="總負債"><input type="number" inputMode="numeric" className={inputCls} value={numVal(c.liabilities)} placeholder="0" onChange={(e) => setCross("liabilities", parseFloat(e.target.value) || 0)} /></Field>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button onClick={onSubmitCurrent} disabled={saveStatus === "saving"}
            className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] disabled:opacity-60 px-6 py-2.5 rounded-lg">
            {saveStatus === "saving" ? "計算中…" : "送出，看我的缺口與達成率"}
          </button>
          {saveStatus === "error" && <span className="text-[#ff9b9b] text-sm">⚠ {saveErr}</span>}
        </div>
      </section>

      {/* 缺口 ＋ 願景達成率 */}
      {showGap && (
        <section className="rounded-2xl bg-gradient-to-br from-[#0d2b45] to-[#12334f] border border-[#c99a5b]/30 p-6 mb-4">
          <h2 className="font-serif text-lg mb-4">📊 你的缺口與願景達成率</h2>
          <div className="grid sm:grid-cols-2 gap-6 items-center">
            <div>
              <div className="text-[#a7bacb] text-sm mb-1">願景達成率</div>
              <div className="font-serif text-4xl text-[#e0bd8b] mb-2">{ratePct}%</div>
              <div className="h-3 rounded-full bg-white/8 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${ratePct}%`, background: ratePct >= 100 ? "#7bd88f" : "#c99a5b" }} />
              </div>
            </div>
            <div className="text-sm text-[#cdd9e5] space-y-1.5">
              <div className="flex justify-between"><span>每月應存（目標）</span><b>NT$ {ntfmt(gap.monthlyNeed)}</b></div>
              <div className="flex justify-between"><span>每月可存（收入−支出）</span><b>NT$ {ntfmt(gap.monthlyCapacity)}</b></div>
              <div className="flex justify-between text-[#ffb4a2]"><span>每月缺口</span><b>NT$ {ntfmt(gap.monthlyGap)}</b></div>
              <div className="flex justify-between border-t border-white/10 pt-1.5"><span>目前淨資產</span><b>{wan(gap.netWorth).toLocaleString("en-US")} 萬</b></div>
            </div>
          </div>
          <p className="text-[11px] text-[#6f869c] mt-4">
            {gap.monthlyGap > 0
              ? `目前每月還差 NT$ ${ntfmt(gap.monthlyGap)} 才能達成所有目標。掛上教練，一起把缺口補起來。`
              : "你目前的存錢能力已足以支應所有目標，做得很好！掛上教練可以幫你更精準地配置。"}
          </p>
        </section>
      )}

      {/* 選擇教練 */}
      <section className="rounded-2xl bg-[#12334f] border border-white/8 p-5 sm:p-6 mb-16">
        <h2 className="font-serif text-lg mb-1">🤝 選擇你的教練</h2>
        {localLink.state === "linked" ? (
          <div className="mt-3">
            <p className="text-[#7bd88f] text-sm">✓ 你已連結教練{localLink.coachName ? `：${localLink.coachName}` : ""}。你們現在可以一起規劃了。</p>
            <button onClick={onRevoke} disabled={reqStatus === "sending"}
              className="mt-3 text-[#ff9b9b] hover:text-[#ffb4a2] text-sm border border-[#ff9b9b]/30 rounded-lg px-4 py-2 disabled:opacity-50">
              解除與教練的連結
            </button>
            {reqStatus === "error" && <span className="ml-3 text-[#ff9b9b] text-sm">⚠ {reqErr}</span>}
          </div>
        ) : localLink.state === "pending" ? (
          <div className="mt-3 rounded-lg border border-[#c99a5b]/30 bg-[#0d2b45]/50 p-4">
            <div className="text-[#e0bd8b] text-sm">⏳ 已送出連結申請{localLink.coachName ? `給 ${localLink.coachName}` : ""}，等待教練接受。</div>
            <p className="text-[11px] text-[#6f869c] mt-1">教練接受後，你的規劃就正式開始，對方能與你一起檢視與優化。</p>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-[#6f869c] mb-4">選一位教練送出邀請，對方接受後就會和你一起規劃。</p>
            {coaches.length === 0 ? (
              <p className="text-[#a7bacb] text-sm">目前沒有可選的教練。</p>
            ) : (
              <div className="space-y-2">
                {coaches.map((co) => (
                  <label key={co.id} className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer ${selCoach === co.id ? "border-[#c99a5b] bg-[#0d2b45]" : "border-white/10 hover:border-white/25"}`}>
                    <input type="radio" name="coach" className="accent-[#c99a5b]" checked={selCoach === co.id} onChange={() => setSelCoach(co.id)} />
                    <span className="flex-1">
                      <span className="text-[#eef2f7]">{co.name || "教練"}</span>
                      {co.title ? <span className="text-[#a7bacb] text-xs ml-2">{co.title}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="mt-5 flex items-center gap-3">
              <button onClick={onRequestCoach} disabled={!selCoach || reqStatus === "sending"}
                className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] disabled:opacity-50 px-6 py-2.5 rounded-lg">
                {reqStatus === "sending" ? "送出中…" : "送出連結申請"}
              </button>
              {reqStatus === "error" && <span className="text-[#ff9b9b] text-sm">⚠ {reqErr}</span>}
            </div>
          </>
        )}
        <div className="mt-6 text-center">
          <Link href="/portal" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">先回客戶首頁</Link>
        </div>
      </section>
    </div>
  );
}
