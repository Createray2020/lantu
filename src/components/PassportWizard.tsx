"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  computePassport, emptyPassport, BASE_YEAR, ntfmt, wan,
  type PassportInputs, type LoanResult,
} from "@/lib/passport";
import { readDraft, saveDraft, clearDraft, ASSUMED_WORK_START_AGE } from "@/lib/passportDraft";
import { savePassportAction } from "@/app/portal/passport/actions";

// hydration-safe 的「我在瀏覽器了嗎」。用 useSyncExternalStore 而不是 useEffect+setState：
// 專案的 eslint 有 react-hooks/set-state-in-effect，而且 effect 版本會先閃一次 SSR 的內容。
const noopSubscribe = () => () => {};
const useIsClient = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

/* ---------- 小元件 ---------- */
function Slider({
  label, value, min, max, step = 1, onChange, minLabel, maxLabel, fmt,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; minLabel?: string; maxLabel?: string; fmt?: (v: number) => string;
}) {
  // 單位後綴由既有 fmt 推導（"3 萬"→萬、"7%"→%、"2030 年"→年），呼叫端不必改。
  const unit = fmt ? fmt(value).replace(/^[\s-]*[\d,]*\.?\d*/, "").trim() : "";
  // 打字中的原始字串：讓 "3." / "" 這類中間態不被即時 clamp 吃掉。
  const [draft, setDraft] = useState<string | null>(null);
  const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;

  const clamp = (v: number) => {
    const snapped = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, parseFloat(snapped.toFixed(decimals + 2))));
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-[12px] text-[#a7bacb]">{label}</span>
        <span className="flex items-baseline gap-1 shrink-0">
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={draft ?? String(value)}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              const v = parseFloat(raw);
              if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => {
              const v = parseFloat(draft ?? "");
              onChange(Number.isFinite(v) ? clamp(v) : value);
              setDraft(null);
            }}
            className="w-[96px] rounded-md border border-white/15 bg-[#0f2740] px-2 py-1 text-right text-[15px] font-bold text-[#e0bd8b] focus:border-[#c99a5b] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {unit && <span className="w-4 text-[11px] text-[#a7bacb]">{unit}</span>}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => { setDraft(null); onChange(parseFloat(e.target.value)); }}
        className="w-full accent-[#2f8f8f] h-1.5"
      />
      <div className="flex justify-between text-[10px] text-[#6f869c] mt-0.5">
        <span>{minLabel ?? min}</span>
        <span>{maxLabel ?? max}</span>
      </div>
    </div>
  );
}

function Donut({ loan, down }: { loan: number; down: number }) {
  const total = loan + down || 1;
  const loanPct = Math.round((loan / total) * 100);
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-32 h-32 rounded-full grid place-items-center"
        style={{ background: `conic-gradient(#2f8f8f 0 ${loanPct}%, #9fd3d0 ${loanPct}% 100%)` }}
      >
        <div className="w-20 h-20 rounded-full bg-[#12334f] grid place-items-center text-2xl">🏠</div>
      </div>
      <div className="flex gap-4 text-[11px] text-[#a7bacb]">
        <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block bg-[#2f8f8f]" />貸款</span>
        <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block bg-[#9fd3d0]" />自備款</span>
      </div>
    </div>
  );
}

function LoanCard({ title, icon, r, rate }: { title: string; icon: string; r: LoanResult; rate: number }) {
  return (
    <div className="grid sm:grid-cols-[auto_1fr] gap-6 items-center">
      <Donut loan={r.loan} down={r.down} />
      <div>
        <div className="text-[#a7bacb] text-sm mb-1">
          {icon} 可購買的{title}（{r.targetYear} 年）
        </div>
        <div className="font-serif text-3xl text-[#e0bd8b] mb-3">{wan(r.price).toLocaleString("en-US")} 萬</div>
        <div className="text-[#cdd9e5] text-sm leading-relaxed">
          自備 {wan(r.down)} 萬（月存 {ntfmt(r.monthly * 10000)}）<br />
          貸款 {wan(r.loan)} 萬
        </div>
        <div className="text-[#cdd9e5] text-sm mt-2">
          {r.graceMonths > 0 && <>▶ 1-{r.graceMonths} 月還 {ntfmt(r.graceMonthly)}（寬限期）<br /></>}
          ▶ {r.graceMonths + 1}-{r.graceMonths + r.amortMonths} 月還 {ntfmt(r.amortMonthly)}
        </div>
        <div className="text-[11px] text-[#6f869c] mt-2">
          {Math.round((r.graceMonths + r.amortMonths) / 12)} 年貸款 / 本息均攤 / 單一利率({rate}%)
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[12px] mb-0.5">
        <span className="text-[#cdd9e5]">{label}</span>
        <span className="text-[#eef2f7] font-semibold">月領 {ntfmt(value)}</span>
      </div>
      <div className="h-2 rounded bg-white/8 overflow-hidden">
        <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ---------- 每個面向的區塊外殼 ---------- */
function Face({
  icon, label, monthly, children, result,
}: {
  icon: string; label: string; monthly: number; children: React.ReactNode; result: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-[#12334f] border border-white/8 overflow-hidden">
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/8">
        <div className="flex items-center gap-2 font-serif text-lg">
          <span>{icon}</span><span>{label}能力分析</span>
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-[0.2em] text-[#6f869c]">月存</div>
          <div className="font-bold text-[#2fb0a8]">{monthly} 萬</div>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-6 p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 content-start">{children}</div>
        <div className="rounded-xl bg-[#0d2b45] border border-white/8 p-5 grid place-items-center">{result}</div>
      </div>
    </section>
  );
}

/* ---------- 主元件 ---------- */
// mode="public"：官網 /passport，未登入可玩。按存檔＝把草稿存進 sessionStorage 再導去註冊。
// mode="private"：/portal/passport，登入後的正式頁。restore=true 時才吃草稿（註冊回來那一趟）。
export default function PassportWizard({
  initial, mode = "private", restore = false, signedIn = false,
}: {
  initial: PassportInputs | null;
  mode?: "public" | "private";
  restore?: boolean;
  signedIn?: boolean;
}) {
  const isClient = useIsClient();
  const [edited, setEdited] = useState<PassportInputs | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [fromDraft, setFromDraft] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error" | "confirm">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [existingAt, setExistingAt] = useState<string | null>(null);
  const [showAssume, setShowAssume] = useState(false);

  // render 期間校正 state（React 允許、且不會像 effect 那樣先閃一幀舊值）。
  // 只有公開頁、或註冊回來帶 restore 的那一趟才吃草稿——否則 sessionStorage 裡的殘留
  // 會在客戶下次正常進來編輯時，把他既有的護照悄悄換成官網隨手試算的那組數字。
  if (isClient && !draftChecked) {
    setDraftChecked(true);
    if (mode === "public" || restore) {
      const d = readDraft();
      if (d) { setEdited(d); setFromDraft(true); }
    }
  }

  const p = edited ?? initial ?? emptyPassport();
  const m = useMemo(() => computePassport(p), [p]);

  function set<K extends keyof PassportInputs>(face: K, key: keyof PassportInputs[K], v: number) {
    setEdited((prev) => {
      const base = prev ?? initial ?? emptyPassport();
      return { ...base, [face]: { ...base[face], [key]: v } };
    });
    if (status !== "saving") { setStatus("idle"); setErrMsg(null); }
  }
  const yr = (v: number) => `${v} 年`;

  // 公開頁：不寫任何後端資料。草稿留在瀏覽器，導去註冊（已登入就直接進正式頁），回來再存。
  function goSignUp() {
    saveDraft(p);
    const back = encodeURIComponent("/portal/passport?restore=1");
    window.location.href = signedIn ? "/portal/passport?restore=1" : `/client/sign-up?redirect_url=${back}`;
  }

  async function onSave(overwrite = false) {
    if (status === "saving") return;
    if (mode === "public") { goSignUp(); return; }
    setStatus("saving"); setErrMsg(null);
    try {
      // 25 秒逾時保護：就算後端沒回應也不會永遠乾等。
      const res = (await Promise.race([
        savePassportAction(p, overwrite ? { overwrite: true } : undefined),
        new Promise((_, rej) => setTimeout(() => rej(new Error("連線逾時，請檢查網路後再試")), 25000)),
      ])) as Awaited<ReturnType<typeof savePassportAction>>;
      if (res.ok) {
        setStatus("success");
        clearDraft();
        // 硬導頁到下一步（比 router.push+refresh 穩，避免導頁被當前頁重刷蓋掉）。
        window.location.href = "/portal/setup";
      } else if ("needsConfirm" in res && res.needsConfirm) {
        // 已經有一份規劃了。覆蓋是不可逆的，停下來問。
        setStatus("confirm");
        setExistingAt(res.existingUpdatedAt);
      } else if ("needsAuth" in res && res.needsAuth) {
        // session 掉了（例如放著太久）。草稿還在，登入後 restore 把資料接回來。
        saveDraft(p);
        window.location.href = `/client/sign-in?redirect_url=${encodeURIComponent("/portal/passport?restore=1")}`;
      } else {
        setStatus("error");
        setErrMsg(("error" in res && res.error) || "儲存失敗，請重試");
      }
    } catch (e) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : "儲存失敗，請重試");
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 pb-32">
      {/* 標頭＋每月應存彙總 */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0d2b45] to-[#12334f] border border-[#c99a5b]/30 p-6 mb-6 text-center">
        <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-1">MY LIFE PASSPORT · {BASE_YEAR} 年度</div>
        <h1 className="font-serif text-2xl mb-2">{mode === "public" ? "人生護照 · 免費試算" : "我的人生護照"}</h1>
        <div className="text-[#a7bacb] text-sm mb-1">每月應存合計</div>
        <div className="font-serif text-4xl text-[#e0bd8b]">{m.totalMonthlyWan.toFixed(1)} 萬</div>
        <p className="text-[11px] text-[#6f869c] mt-2">拉動下方條件，即時看你每月存這些錢能達成什麼。</p>
        <button
          type="button"
          onClick={() => setShowAssume((v) => !v)}
          className="mt-3 text-[11px] text-[#a7bacb] hover:text-white underline underline-offset-4"
        >
          {showAssume ? "收合" : "本試算採用的假設"}
        </button>
        {showAssume && (
          <div className="mt-3 text-left rounded-xl bg-[#081a2b]/70 border border-white/10 p-4 text-[11.5px] leading-relaxed text-[#a7bacb]">
            <ul className="space-y-1 list-disc pl-4">
              <li>各面向的年報酬、貸款利率、學費上漲率皆為<b className="text-[#cdd9e5]">情境假設</b>，由你自行設定，非預期或保證之報酬。</li>
              <li>退休：預估壽命 {p.retire.lifeExp} 歲、勞退提繳率 {p.retire.contribRate}%、勞保年金採平均月投保薪資 × 年資 × 1.55% 概算，現值以通膨 1.5% 折現。</li>
              <li>年資若由退休年齡推算，假設 {ASSUMED_WORK_START_AGE} 歲開始工作。</li>
              <li>本試算為一般性財務規劃之數學推算，<b className="text-[#cdd9e5]">僅供參考，不構成任何投資建議或收益保證</b>；實際結果受市場、稅制、個人狀況影響而不同。</li>
            </ul>
          </div>
        )}
      </div>

      {fromDraft && status !== "success" && (
        <div className="rounded-xl border border-[#c99a5b]/40 bg-[#c99a5b]/10 px-5 py-3 mb-4 text-sm text-[#e0bd8b]">
          已帶回你剛才在官網填的試算內容，確認後按下方存檔即可建立你的規劃。
        </div>
      )}

      <div className="space-y-4">
        {/* 購房 */}
        <Face icon="🏠" label="購房" monthly={p.house.monthly}
          result={<LoanCard title="房價" icon="🏠" r={m.house} rate={p.house.rate} />}>
          <Slider label="購買時間" value={p.house.buyYear} min={BASE_YEAR} max={BASE_YEAR + 30} onChange={(v) => set("house", "buyYear", v)} fmt={yr} minLabel={`${BASE_YEAR} 年`} maxLabel={`${BASE_YEAR + 30} 年`} />
          <Slider label="月存入" value={p.house.monthly} min={0} max={10} step={0.1} onChange={(v) => set("house", "monthly", v)} fmt={(v) => `${v} 萬`} minLabel="0 萬" maxLabel="10 萬" />
          <Slider label="月存入起始年" value={p.house.startYear} min={BASE_YEAR - 20} max={BASE_YEAR + 10} onChange={(v) => set("house", "startYear", v)} fmt={yr} minLabel={`${BASE_YEAR - 20}`} maxLabel={`${BASE_YEAR + 10}`} />
          <Slider label="年報酬" value={p.house.annualReturn} min={0} max={15} step={0.5} onChange={(v) => set("house", "annualReturn", v)} fmt={(v) => `${v}%`} minLabel="0%" maxLabel="15%" />
          <Slider label="貸款成數" value={p.house.loanRatio} min={1} max={9} onChange={(v) => set("house", "loanRatio", v)} fmt={(v) => `${v} 成`} minLabel="1 成" maxLabel="9 成" />
          <Slider label="貸款年期" value={p.house.loanYears} min={5} max={40} onChange={(v) => set("house", "loanYears", v)} fmt={(v) => `${v} 年`} minLabel="5 年" maxLabel="40 年" />
        </Face>

        {/* 購車 */}
        <Face icon="🚗" label="購車" monthly={p.car.monthly}
          result={<LoanCard title="車價" icon="🚗" r={m.car} rate={p.car.rate} />}>
          <Slider label="購買時間" value={p.car.buyYear} min={BASE_YEAR} max={BASE_YEAR + 20} onChange={(v) => set("car", "buyYear", v)} fmt={yr} minLabel={`${BASE_YEAR} 年`} maxLabel={`${BASE_YEAR + 20} 年`} />
          <Slider label="月存入" value={p.car.monthly} min={0} max={10} step={0.1} onChange={(v) => set("car", "monthly", v)} fmt={(v) => `${v} 萬`} minLabel="0 萬" maxLabel="10 萬" />
          <Slider label="月存入起始年" value={p.car.startYear} min={BASE_YEAR - 20} max={BASE_YEAR + 10} onChange={(v) => set("car", "startYear", v)} fmt={yr} minLabel={`${BASE_YEAR - 20}`} maxLabel={`${BASE_YEAR + 10}`} />
          <Slider label="年報酬" value={p.car.annualReturn} min={0} max={15} step={0.5} onChange={(v) => set("car", "annualReturn", v)} fmt={(v) => `${v}%`} minLabel="0%" maxLabel="15%" />
          <Slider label="貸款成數" value={p.car.loanRatio} min={1} max={9} onChange={(v) => set("car", "loanRatio", v)} fmt={(v) => `${v} 成`} minLabel="1 成" maxLabel="9 成" />
          <Slider label="貸款年期" value={p.car.loanYears} min={1} max={10} onChange={(v) => set("car", "loanYears", v)} fmt={(v) => `${v} 年`} minLabel="1 年" maxLabel="10 年" />
        </Face>

        {/* 退休 */}
        <Face icon="🌴" label="退休" monthly={p.retire.monthly}
          result={
            <div className="w-full">
              <div className="text-[#a7bacb] text-sm mb-1">🌴 {p.retire.retireAge} 歲退休可支應生活費</div>
              <div className="font-serif text-3xl text-[#e0bd8b] mb-1">總計 {ntfmt(m.retire.totalMonthly)} /月</div>
              <div className="text-[11px] text-[#6f869c] mb-4">（現值約 {ntfmt(m.retire.presentMonthly)}）</div>
              <Bar label="自行準備" value={m.retire.selfMonthly} total={m.retire.totalMonthly} color="#9fd3d0" />
              <Bar label="企業提撥（勞退）" value={m.retire.laborPensionMonthly} total={m.retire.totalMonthly} color="#2fb0a8" />
              <Bar label="社會保險（勞保）" value={m.retire.laborInsMonthly} total={m.retire.totalMonthly} color="#1f6f6b" />
            </div>
          }>
          <Slider label="目前年齡" value={p.retire.curAge} min={20} max={100} onChange={(v) => set("retire", "curAge", v)} fmt={(v) => `${v} 歲`} minLabel="20 歲" maxLabel="100 歲" />
          <Slider label="退休年齡" value={p.retire.retireAge} min={50} max={100} onChange={(v) => set("retire", "retireAge", v)} fmt={(v) => `${v} 歲`} minLabel="50 歲" maxLabel="100 歲" />
          <Slider label="月存入" value={p.retire.monthly} min={0} max={10} step={0.1} onChange={(v) => set("retire", "monthly", v)} fmt={(v) => `${v} 萬`} minLabel="0 萬" maxLabel="10 萬" />
          <Slider label="目前月薪" value={p.retire.salary} min={0} max={20} step={0.1} onChange={(v) => set("retire", "salary", v)} fmt={(v) => `${v} 萬`} minLabel="0 萬" maxLabel="20 萬" />
          <Slider label="退休時總工作年資" value={p.retire.workYears} min={15} max={60} onChange={(v) => set("retire", "workYears", v)} fmt={(v) => `${v} 年`} minLabel="15 年" maxLabel="60 年" />
          <Slider label="年報酬" value={p.retire.annualReturn} min={0} max={15} step={0.5} onChange={(v) => set("retire", "annualReturn", v)} fmt={(v) => `${v}%`} minLabel="0%" maxLabel="15%" />
        </Face>

        {/* 扶養 */}
        <Face icon="👨‍👩‍👧" label="扶養" monthly={p.support.monthly}
          result={
            <div className="text-center">
              <div className="text-5xl mb-2">👨‍👩‍👧</div>
              <div className="text-[#a7bacb] text-sm">可扶養約</div>
              <div className="font-serif text-4xl text-[#e0bd8b] my-1">{m.support.kids.toFixed(2)} 位小孩</div>
              <div className="text-[#cdd9e5] text-sm mt-2">
                折算至出生時共約存 <b className="text-[#e0bd8b]">{wan(m.support.savedAtBirth)} 萬</b><br />
                每位小孩共約花 <b className="text-[#e0bd8b]">{wan(m.support.perChildCost)} 萬</b>
              </div>
              <div className="text-[11px] text-[#6f869c] mt-2">扶養至 {m.support.raiseToAge} 歲 / 學費上漲率 {p.support.tuitionGrowth}%</div>
            </div>
          }>
          <Slider label="預計出生年份" value={p.support.birthYear} min={BASE_YEAR} max={BASE_YEAR + 30} onChange={(v) => set("support", "birthYear", v)} fmt={yr} minLabel={`${BASE_YEAR} 年`} maxLabel={`${BASE_YEAR + 30} 年`} />
          <Slider label="月存入" value={p.support.monthly} min={0} max={10} step={0.1} onChange={(v) => set("support", "monthly", v)} fmt={(v) => `${v} 萬`} minLabel="0 萬" maxLabel="10 萬" />
          <Slider label="月存入起始年" value={p.support.startYear} min={BASE_YEAR - 20} max={BASE_YEAR + 10} onChange={(v) => set("support", "startYear", v)} fmt={yr} minLabel={`${BASE_YEAR - 20}`} maxLabel={`${BASE_YEAR + 10}`} />
          <Slider label="年報酬" value={p.support.annualReturn} min={0} max={15} step={0.5} onChange={(v) => set("support", "annualReturn", v)} fmt={(v) => `${v}%`} minLabel="0%" maxLabel="15%" />
          <Slider label="扶養到幾歲" value={p.support.raiseToAge} min={18} max={30} onChange={(v) => set("support", "raiseToAge", v)} fmt={(v) => `${v} 歲`} minLabel="18 歲" maxLabel="30 歲" />
        </Face>

        {/* 旅遊 */}
        <Face icon="✈️" label="旅遊" monthly={p.travel.monthly}
          result={
            <div className="text-center">
              <div className="text-5xl mb-2">✈️</div>
              <div className="text-[#a7bacb] text-sm">{m.travel.travelYear} 年旅遊基金</div>
              <div className="font-serif text-4xl text-[#e0bd8b] my-1">{ntfmt(m.travel.fund)} 元</div>
              <div className="text-[11px] text-[#6f869c] mt-2">月存 {ntfmt(m.travel.monthly * 10000)} 元 / 年報酬 {p.travel.annualReturn}%</div>
            </div>
          }>
          <Slider label="旅遊時間" value={p.travel.travelYear} min={BASE_YEAR} max={BASE_YEAR + 15} onChange={(v) => set("travel", "travelYear", v)} fmt={yr} minLabel={`${BASE_YEAR} 年`} maxLabel={`${BASE_YEAR + 15} 年`} />
          <Slider label="月存入" value={p.travel.monthly} min={0.1} max={10} step={0.1} onChange={(v) => set("travel", "monthly", v)} fmt={(v) => `${v} 萬`} minLabel="0.1 萬" maxLabel="10 萬" />
          <Slider label="月存入起始年" value={p.travel.startYear} min={BASE_YEAR - 20} max={BASE_YEAR + 10} onChange={(v) => set("travel", "startYear", v)} fmt={yr} minLabel={`${BASE_YEAR - 20}`} maxLabel={`${BASE_YEAR + 10}`} />
          <Slider label="年報酬" value={p.travel.annualReturn} min={0} max={15} step={0.5} onChange={(v) => set("travel", "annualReturn", v)} fmt={(v) => `${v}%`} minLabel="0%" maxLabel="15%" />
        </Face>
      </div>

      <div className="mt-5 text-center">
        {mode === "public" ? (
          <Link href="/coaches" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">
            先看看有哪些教練 →
          </Link>
        ) : (
          <Link href="/portal" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">回客戶首頁</Link>
        )}
      </div>

      {/* 底部合計＋存檔 */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0b2036]/95 backdrop-blur border-t border-white/10">
        {/* 儲存中的進度指示條（不確定式） */}
        {status === "saving" && (
          <div className="absolute -top-0.5 left-0 right-0 h-1 overflow-hidden bg-white/5">
            <style>{`@keyframes pwslide{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
            <div className="h-full w-1/4 bg-[#c99a5b]" style={{ animation: "pwslide 1.1s ease-in-out infinite" }} />
          </div>
        )}
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {status === "confirm" ? (
              <div className="text-sm">
                <div className="text-[#e0bd8b] font-semibold">你已經有一份規劃了</div>
                <div className="text-[#a7bacb] text-[12px]">
                  最後更新：{existingAt ? new Date(existingAt).toLocaleString("zh-TW", { hour12: false }) : "—"}
                  ．覆蓋後舊內容仍留在版本紀錄裡，可以回復。
                </div>
              </div>
            ) : status === "error" ? (
              <div className="text-[#ff9b9b] text-sm">⚠ {errMsg}</div>
            ) : status === "saving" ? (
              <div className="text-[#e0bd8b] text-sm">儲存中，請稍候…</div>
            ) : status === "success" ? (
              <div className="text-[#7bd88f] text-sm">已儲存，正在開啟你的規劃…</div>
            ) : (
              <>
                <div className="text-[11px] tracking-[0.2em] text-[#6f869c]">合計 每月應存</div>
                <div className="font-serif text-2xl text-[#e0bd8b]">{m.totalMonthlyWan.toFixed(1)} 萬</div>
              </>
            )}
          </div>
          {status === "confirm" ? (
            <div className="shrink-0 flex items-center gap-2">
              <button onClick={() => { setStatus("idle"); setExistingAt(null); }}
                className="text-sm text-[#a7bacb] hover:text-white px-4 py-3 rounded-lg border border-white/15">
                取消
              </button>
              <button onClick={() => onSave(true)}
                className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-3 rounded-lg">
                覆蓋舊的規劃
              </button>
            </div>
          ) : (
            <button onClick={() => onSave()} disabled={status === "saving"}
              className="shrink-0 font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] disabled:opacity-60 px-7 py-3 rounded-lg inline-flex items-center gap-2">
              {status === "saving" && (
                <span className="w-4 h-4 border-2 border-[#08202a]/40 border-t-[#08202a] rounded-full animate-spin" />
              )}
              {mode === "public"
                ? (signedIn ? "存下我的規劃" : "免費註冊，存下我的規劃")
                : status === "saving" ? "儲存中…" : status === "success" ? "已儲存 ✓" : status === "error" ? "重試存檔" : "存檔，建立我的規劃"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
