"use client";

import { useEffect, useState } from "react";
import { FIELD } from "@/components/ui/Field";
import { coachOptionsAction } from "./actions";
import type { ClientFeeInput } from "./actions";

// 「付費顧問案」區塊（2026/10/09 Ray）：建客戶對話框最上面一列勾選；勾了才展開金額／收款日／後五碼／開發教練。
// 存檔時寫一筆顧問費到後台收款明細（待查帳）；沒勾＝只建客戶、不進帳務、不算實績。
export type FeeDraft = { on: boolean; amount: string; date: string; last5: string; promo: string };
export const EMPTY_FEE: FeeDraft = { on: false, amount: "", date: "", last5: "", promo: "me" };
export function feeToInput(f: FeeDraft, meId: string): ClientFeeInput | null {
  if (!f.on) return null;
  const amount = Number(String(f.amount).replace(/,/g, ""));
  return { amount: Number.isFinite(amount) ? amount : 0, on: f.date, last5: f.last5.trim() || undefined, promoCoachId: f.promo === "me" ? meId : f.promo === "none" ? null : f.promo };
}
export function feeError(f: FeeDraft): string | null {
  if (!f.on) return null;
  const amount = Number(String(f.amount).replace(/,/g, ""));
  if (!(amount > 0)) return "請填顧問費金額";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return "請填收款日";
  return null;
}

export default function FeeFields({ value, onChange, meId, compact = false }: { value: FeeDraft; onChange: (f: FeeDraft) => void; meId: string; compact?: boolean }) {
  const [coaches, setCoaches] = useState<{ id: string; name: string; rankCode: string | null }[]>([]);
  useEffect(() => { if (value.on && !coaches.length) coachOptionsAction().then(setCoaches).catch(() => {}); }, [value.on, coaches.length]);
  const set = (patch: Partial<FeeDraft>) => onChange({ ...value, ...patch });
  return (
    <div className={`rounded-lg border ${value.on ? "border-brand2" : "border-line"} bg-panel2 p-3`}>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={value.on} onChange={(e) => set({ on: e.target.checked, date: value.date || new Date().toISOString().slice(0, 10) })} />
        <span className="font-bold">這位是付費顧問案（公司已收款）</span>
        <span className="text-xs text-tx3">勾了才會記進公司帳與你的實績；沒收費的規劃不用勾</span>
      </label>
      {value.on && (
        <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-3 mt-3`}>
          <div><label className="text-xs text-tx2">顧問費金額 *</label><input className={FIELD} inputMode="numeric" value={value.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="60,000" /></div>
          <div><label className="text-xs text-tx2">公司收款日 *</label><input type="date" className={FIELD} value={value.date} onChange={(e) => set({ date: e.target.value })} /></div>
          <div><label className="text-xs text-tx2">匯款後五碼</label><input className={FIELD} value={value.last5} onChange={(e) => set({ last5: e.target.value })} placeholder="選填" /></div>
          <div><label className="text-xs text-tx2">開發教練</label>
            <select className={FIELD} value={value.promo} onChange={(e) => set({ promo: e.target.value })}>
              <option value="me">本人（自招自執）</option>
              <option value="none">無／公司派案</option>
              {coaches.filter((c) => c.id !== meId).map((c) => <option key={c.id} value={c.id}>{c.name}{c.rankCode ? `（${c.rankCode}）` : ""}</option>)}
            </select></div>
          <p className="col-span-full text-xs text-tx3">送出後會進公司「收款明細」等查帳確認；確認後才算分潤與晉升實績，你在「我的分潤」看得到狀態。</p>
        </div>
      )}
    </div>
  );
}
