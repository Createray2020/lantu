"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeGap, ntfmt, wan, type CrossInputs } from "@/lib/passport";
import MoneyInput from "@/components/MoneyInput";
import type { ClientBasics } from "@/lib/clientPlan";
import type { ActiveCoach, LinkStatus } from "@/lib/coachLink";
import { normalizeIntent, defaultIntent, type Intent } from "@/lib/intent";
import IntentPicker from "./IntentPicker";
import { saveSetupAction, revokeCoachAction } from "./actions";

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
const inputErrCls =
  "w-full bg-[#0a1a28] border border-[#ff9b9b]/70 rounded-lg px-3 py-2 text-[#eef2f7] text-sm focus:border-[#ff9b9b] outline-none";

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
  const [reqStatus, setReqStatus] = useState<"idle" | "sending" | "error">("idle");
  const [reqErr, setReqErr] = useState<string | null>(null);
  // 姓名與生日是後面所有計算的地基（年齡決定退休年期、教練名冊靠姓名認人），全空存下去
  // 只會生出一份誰也用不上的空規劃，還回客戶一個看起來像評價的 0%。
  const [fieldErr, setFieldErr] = useState<{ name?: string; birth?: string }>({});

  const gap = useMemo(() => computeGap(monthlyNeedWan, c), [monthlyNeedWan, c]);
  const ratePct = Math.round(gap.achieveRate * 100);
  // 十字表四格全 0＝還沒填，不是「缺口為零」。這時候算出來的達成率沒有意義。
  const crossEmpty = !c.income && !c.expense && !c.assets && !c.liabilities;

  const setBasic = (k: keyof ClientBasics, v: string | number) => {
    setB((p) => ({ ...p, [k]: v }));
    if (k === "name" || k === "birth") setFieldErr((p) => ({ ...p, [k]: undefined }));
  };
  const setCross = (k: keyof CrossInputs, v: number) => { setC((p) => ({ ...p, [k]: v })); };

  async function onSubmitCurrent() {
    const errs: { name?: string; birth?: string } = {};
    if (!b.name.trim()) errs.name = "請填姓名";
    if (!b.birth) errs.birth = "請填生日——年齡是所有試算的起點";
    setFieldErr(errs);
    if (errs.name || errs.birth) {
      setSaveStatus("error");
      setSaveErr("請先補上上方標示的必填欄位");
      return;
    }
    setSaveStatus("saving"); setSaveErr(null);
    try {
      const res = await saveSetupAction(b, c, it);
      if (res.ok) { setShowGap(true); setSaveStatus("idle"); }
      else { setSaveStatus("error"); setSaveErr(res.error || "儲存失敗"); }
    } catch (e) { setSaveStatus("error"); setSaveErr(e instanceof Error ? e.message : "儲存失敗"); }
  }

  async function onRevoke() {
    if (!confirm("確定要解除與教練的連結嗎？")) return;
    setReqStatus("sending"); setReqErr(null);
    try {
      const res = await revokeCoachAction();
      if (res.ok) { setLocalLink({ state: "none" }); setReqStatus("idle"); }
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
          <Field label="姓名">
            <input
              className={fieldErr.name ? inputErrCls : inputCls}
              aria-invalid={!!fieldErr.name}
              value={b.name}
              onChange={(e) => setBasic("name", e.target.value)}
            />
            {fieldErr.name && <span className="block text-[11px] text-[#ff9b9b] mt-1">⚠ {fieldErr.name}</span>}
          </Field>
          <Field label="生日">
            <input
              type="date"
              className={fieldErr.birth ? inputErrCls : inputCls}
              aria-invalid={!!fieldErr.birth}
              value={b.birth}
              onChange={(e) => setBasic("birth", e.target.value)}
            />
            {fieldErr.birth && <span className="block text-[11px] text-[#ff9b9b] mt-1">⚠ {fieldErr.birth}</span>}
          </Field>
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
          <Field label="每月收入"><MoneyInput className={inputCls} value={c.income} placeholder="0" onChange={(v) => setCross("income", v ?? 0)} /></Field>
          <Field label="每月支出"><MoneyInput className={inputCls} value={c.expense} placeholder="0" onChange={(v) => setCross("expense", v ?? 0)} /></Field>
          <Field label="總資產"><MoneyInput className={inputCls} value={c.assets} placeholder="0" onChange={(v) => setCross("assets", v ?? 0)} /></Field>
          <Field label="總負債"><MoneyInput className={inputCls} value={c.liabilities} placeholder="0" onChange={(v) => setCross("liabilities", v ?? 0)} /></Field>
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
      {showGap && crossEmpty && (
        <section className="rounded-2xl bg-gradient-to-br from-[#0d2b45] to-[#12334f] border border-[#c99a5b]/30 p-6 mb-4">
          <h2 className="font-serif text-lg mb-2">📊 你的缺口與願景達成率</h2>
          {/* 四格全 0 就不要端一個 0% 出來：那不是「你差很多」，是「還沒有資料」。 */}
          <p className="text-sm text-[#cdd9e5]">先填上你的收入與支出，我們才算得出缺口。</p>
        </section>
      )}

      {showGap && !crossEmpty && (
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
              <div className="flex justify-between border-t border-white/10 pt-1.5"><span>目前淨資產</span><b>{wan(gap.netWorth)} 萬</b></div>
            </div>
          </div>
          {/* ⚠️ 缺口是規劃的起點，不是成績單。
              「還差 X 才能達成」「做得很好」都把它講成了考試分數——而嵐途的命題是
              「比原本更優化」，不是「補平」。教練端 planHeroV2 已經是這個口徑，這裡跟上。 */}
          <p className="text-[11px] text-[#6f869c] mt-4">
            {gap.monthlyGap > 0
              ? `以目前的收支，每月差 NT$ ${ntfmt(gap.monthlyGap)}。多數人在這個階段都有缺口，這是規劃的起點，不是壞消息——教練會陪你排出先做哪一件、每一步能改善多少。`
              : `以目前的收支，每月結餘已覆蓋這些目標所需的金額。接下來要看的是配置與順序：哪些錢放在哪裡、哪一步先做，教練會陪你一起排。`}
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
            {/* 選教練改到官網教練頁進行：那裡有每位教練自己寫的介紹、專長與服務方式，
                比一排只有姓名的選項有判斷依據得多。連結關係仍是雙向確認，沒有變。 */}
            <p className="text-[11px] text-[#6f869c] mb-4">
              先看看每位教練的專長與自我介紹，挑一位合得來的送出邀請，對方接受後就會和你一起規劃。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/coaches"
                className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg">
                瀏覽教練並選擇 →
              </Link>
              <span className="text-[11px] text-[#6f869c]">
                目前有 {coaches.length} 位教練
              </span>
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
