"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  computeMonthly,
  emptyPassport,
  PASSPORT_CONST,
  type PassportInputs,
} from "@/lib/passport";
import { savePassportAction } from "./actions";

const nt = (n: number) => Math.round(n || 0).toLocaleString("en-US");

function Field({
  label, value, onChange, suffix, hint,
}: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12px] text-[#a7bacb]">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          value={value === 0 ? "" : value}
          placeholder="0"
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-[#0a1a28] border border-white/12 rounded-lg px-3 py-2 text-[#eef2f7] text-sm focus:border-[#c99a5b] outline-none"
        />
        {suffix ? <span className="text-[12px] text-[#6f869c] whitespace-nowrap">{suffix}</span> : null}
      </span>
      {hint ? <span className="text-[11px] text-[#6f869c]">{hint}</span> : null}
    </label>
  );
}

function Card({
  icon, title, monthly, children,
}: {
  icon: string; title: string; monthly: number; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-[#12334f] border border-white/8 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 font-serif text-lg">
          <span>{icon}</span>
          <span>{title}</span>
        </div>
        <div className="text-right">
          <div className="text-[10px] tracking-[0.2em] text-[#6f869c]">每月應存</div>
          <div className="font-bold text-[#e0bd8b]">NT$ {nt(monthly)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

export default function PassportWizard({ initial }: { initial: PassportInputs | null }) {
  const [p, setP] = useState<PassportInputs>(initial ?? emptyPassport());
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const m = useMemo(() => computeMonthly(p), [p]);

  function set<K extends keyof PassportInputs>(face: K, key: keyof PassportInputs[K], v: number) {
    setP((prev) => ({ ...prev, [face]: { ...prev[face], [key]: v } }));
    setSaved(false);
  }

  function onSave() {
    start(async () => {
      const res = await savePassportAction(p);
      if (res.ok) {
        setSaved(true);
        router.push("/portal");
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8 pb-32">
      <div className="mb-6">
        <div className="text-[#c99a5b] text-xs tracking-[0.3em] mb-2">MY LIFE PASSPORT</div>
        <h1 className="font-serif text-3xl mb-2">我的人生護照</h1>
        <p className="text-[#a7bacb] text-sm leading-relaxed">
          把你最在意的人生目標填上，系統即時幫你算「每個月該存多少」。
          填完存檔，就成為你的第一份規劃基礎。（試算採：退休前報酬 {PASSPORT_CONST.preRetReturn}%、
          退休後 {PASSPORT_CONST.postRetReturn}%、通膨 {PASSPORT_CONST.inflation}%）
        </p>
      </div>

      <div className="space-y-4">
        <Card icon="🏠" title="購房" monthly={m.house}>
          <Field label="理想房價" value={p.house.price} suffix="元" onChange={(v) => set("house", "price", v)} />
          <Field label="貸款成數" value={p.house.loanRatio} suffix="%" onChange={(v) => set("house", "loanRatio", v)} hint={`頭期款 NT$ ${nt(m.meta.houseDown)}`} />
          <Field label="幾年後購買" value={p.house.years} suffix="年" onChange={(v) => set("house", "years", v)} />
        </Card>

        <Card icon="🚗" title="購車" monthly={m.car}>
          <Field label="理想車價" value={p.car.price} suffix="元" onChange={(v) => set("car", "price", v)} />
          <Field label="幾年後購買" value={p.car.years} suffix="年" onChange={(v) => set("car", "years", v)} />
        </Card>

        <Card icon="🌴" title="退休" monthly={m.retire}>
          <Field label="目前年齡" value={p.retire.age} suffix="歲" onChange={(v) => set("retire", "age", v)} />
          <Field label="預計退休年齡" value={p.retire.retireAge} suffix="歲" onChange={(v) => set("retire", "retireAge", v)} />
          <Field label="退休後每月生活費" value={p.retire.monthLiving} suffix="元" onChange={(v) => set("retire", "monthLiving", v)} hint={`退休金總需求 NT$ ${nt(m.meta.retireCorpus)}`} />
          <Field label="已備退休金（選填）" value={p.retire.prepared} suffix="元" onChange={(v) => set("retire", "prepared", v)} hint={`缺口 NT$ ${nt(m.meta.retireGap)}`} />
        </Card>

        <Card icon="👨‍👩‍👧" title="扶養" monthly={m.support}>
          <Field label="扶養人數" value={p.support.kids} suffix="人" onChange={(v) => set("support", "kids", v)} />
          <Field label="每人每年花費" value={p.support.annualPerKid} suffix="元" onChange={(v) => set("support", "annualPerKid", v)} />
          <Field label="需扶養年數" value={p.support.years} suffix="年" onChange={(v) => set("support", "years", v)} />
          <Field label="幾年後開始" value={p.support.startIn} suffix="年" onChange={(v) => set("support", "startIn", v)} hint={`預估總花費 NT$ ${nt(m.meta.supportTotal)}`} />
        </Card>

        <Card icon="✈️" title="旅遊" monthly={m.travel}>
          <Field label="每年旅遊預算" value={p.travel.annualBudget} suffix="元" onChange={(v) => set("travel", "annualBudget", v)} />
          <Field label="持續幾年" value={p.travel.years} suffix="年" onChange={(v) => set("travel", "years", v)} />
        </Card>
      </div>

      <div className="mt-4 text-center">
        <Link href="/portal" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">
          回客戶首頁
        </Link>
      </div>

      {/* 底部合計＋存檔 */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0b2036]/95 backdrop-blur border-t border-white/10">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] tracking-[0.2em] text-[#6f869c]">合計 每月應存</div>
            <div className="font-serif text-2xl text-[#e0bd8b]">NT$ {nt(m.total)}</div>
          </div>
          <button
            onClick={onSave}
            disabled={pending}
            className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] disabled:opacity-60 px-7 py-3 rounded-lg"
          >
            {pending ? "儲存中…" : saved ? "已儲存 ✓" : "存檔，建立我的規劃"}
          </button>
        </div>
      </div>
    </div>
  );
}
