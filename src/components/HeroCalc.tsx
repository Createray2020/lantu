"use client";

import { useMemo, useState } from "react";
import { ntfmt } from "@/lib/passport";
import {
  heroResult, heroToPassport, normalizeHero, saveDraft,
  HERO_DEFAULT, ASSUMED_WORK_START_AGE, type HeroInputs,
} from "@/lib/passportDraft";

// 首頁第一屏的內嵌試算。
//
// 為什麼是「三格」而不是一顆「開始試算」按鈕：少一次點擊，訪客在讀完標題的當下就已經在用產品了。
// 為什麼只有三格：人生護照完整版有 26 支拉桿，塞進第一屏會把首頁毀掉。
//
// 第四格是月薪：勞退與勞保都由它推算，佔退休可領金額常四成以上。
// 為什麼問的是「每月能存多少」而不是「想要多少退休金」：
// 護照引擎是逆推模型（月存 → 能達成什麼），反過來要另寫一套反推函式，
// 那會讓官網與正式頁的語意分岔。而且「你現在這樣存，退休每月只能領 X」這個數字幾乎一定偏低，
// 缺口是訪客自己看出來的，比我們說教有用。
function Field({
  label, value, min, max, step = 1, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; unit: string;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="rounded-xl bg-[#0d2b45]/80 border border-white/10 px-4 py-3 text-left">
      <div className="text-[11px] text-[#a7bacb] mb-1.5">{label}</div>
      <div className="flex items-baseline gap-1">
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
            if (Number.isFinite(v)) onChange(v);
          }}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            const v = parseFloat(draft ?? "");
            onChange(Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : value);
            setDraft(null);
          }}
          className="w-full bg-transparent text-2xl font-bold text-[#e0bd8b] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={label}
        />
        <span className="text-[12px] text-[#a7bacb] shrink-0">{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => { setDraft(null); onChange(parseFloat(e.target.value)); }}
        className="w-full accent-[#c99a5b] h-1 mt-2"
        aria-label={`${label} 滑桿`}
      />
    </div>
  );
}

export default function HeroCalc() {
  const [hero, setHero] = useState<HeroInputs>(HERO_DEFAULT);
  const h = useMemo(() => normalizeHero(hero), [hero]);
  const r = useMemo(() => heroResult(h), [h]);
  const [showAssume, setShowAssume] = useState(false);

  const set = (k: keyof HeroInputs) => (v: number) => setHero((prev) => ({ ...prev, [k]: v }));

  function goFull() {
    // 把首頁這三格組成的完整護照存成草稿，完整頁讀同一份 →
    // 兩個頁面顯示的數字保證一致。不一致會直接毀掉信任。
    saveDraft(heroToPassport(h));
    window.location.href = "/passport";
  }

  return (
    <div className="rounded-2xl border border-[#c99a5b]/40 bg-[#0b2036]/80 p-5 sm:p-6 backdrop-blur">
      <div className="grid grid-cols-2 gap-3">
        <Field label="我現在幾歲" value={h.curAge} min={20} max={80} unit="歲" onChange={set("curAge")} />
        <Field label="想幾歲退休" value={h.retireAge} min={50} max={85} unit="歲" onChange={set("retireAge")} />
        <Field label="目前月薪" value={h.salary} min={0} max={30} step={0.1} unit="萬" onChange={set("salary")} />
        <Field label="每月能存" value={h.monthlySave} min={0} max={10} step={0.1} unit="萬" onChange={set("monthlySave")} />
      </div>

      <div className="mt-5 rounded-xl bg-[#12334f] border border-white/10 p-5 text-center">
        <div className="text-[#a7bacb] text-sm">照這樣存，你 {h.retireAge} 歲退休後每月可領</div>
        <div className="font-serif text-4xl sm:text-5xl text-[#e0bd8b] my-2">
          {ntfmt(r.totalMonthly)} <span className="text-xl">元</span>
        </div>
        <div className="text-[12px] text-[#6f869c]">相當於現在的 {ntfmt(r.presentMonthly)} 元／月</div>

        <div className="grid grid-cols-3 gap-2 mt-4 text-[11.5px]">
          {[
            ["自行準備", r.selfMonthly, "#9fd3d0"],
            ["勞退提撥", r.laborPensionMonthly, "#2fb0a8"],
            ["勞保年金", r.laborInsMonthly, "#1f6f6b"],
          ].map(([label, v, c]) => (
            <div key={label as string} className="rounded-lg bg-[#0d2b45] border border-white/8 py-2">
              <div className="flex items-center justify-center gap-1 text-[#a7bacb]">
                <i className="w-2 h-2 rounded-sm inline-block" style={{ background: c as string }} />
                {label as string}
              </div>
              <div className="text-[#cdd9e5] font-semibold mt-0.5">{ntfmt(v as number)}</div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={goFull}
        className="w-full mt-4 font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-7 py-3.5 rounded-lg text-[15px]"
      >
        繼續算購房、購車、教育金 →
      </button>
      <div className="mt-2.5 text-center">
        <span className="text-[11px] text-[#6f869c]">免費・不用註冊・資料留在你的瀏覽器</span>
        <button
          type="button"
          onClick={() => setShowAssume((v) => !v)}
          className="ml-2 text-[11px] text-[#a7bacb] hover:text-white underline underline-offset-4"
        >
          {showAssume ? "收合假設" : "本試算的假設"}
        </button>
      </div>
      {showAssume && (
        <div className="mt-3 rounded-lg bg-[#081a2b]/70 border border-white/10 p-3.5 text-[11px] leading-relaxed text-[#a7bacb] text-left">
          年報酬 3%（情境假設，非預期或保證報酬）／通膨 1.5%／預估壽命 85 歲／
          勞退以月薪 × 6% 提繳、勞保年金以平均月投保薪資（上限 45,800）× 年資 × 1.55% 概算，
          年資假設 {ASSUMED_WORK_START_AGE} 歲起算至退休。
          本試算為一般性財務推算，僅供參考，不構成投資建議或收益保證。
        </div>
      )}
    </div>
  );
}
