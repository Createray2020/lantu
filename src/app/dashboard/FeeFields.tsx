"use client";

import { useEffect, useRef, useState } from "react";
import { FIELD } from "@/components/ui/Field";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/acctEngine";
import { coachOptionsAction, serviceItemOptionsAction, type ServiceItemOption } from "./actions";
import type { ClientFeeInput } from "./actions";

// 「建立付費顧問服務案件」區塊（2026/10/28 改版；2026/10/09 原為「付費顧問案」）。
// 建客戶對話框最上面一列勾選；勾了才展開方案／服務期間／費用／付款資訊／開發教練。
// 存檔時：建一個服務案件（收款、合約、發票的共同關聯）＋寫一筆顧問費到後台收款明細（待查帳）。
// ⚠️ 教練填的付款資訊＝「提報」，不是公司已確認收款；合約要等公司在收款明細確認全額才能啟動。
export type FeeDraft = {
  on: boolean;
  itemId: string;
  year: string;
  from: string;
  to: string;
  amount: string;
  /** 這一次付了多少（預設跟總額一樣；分期／訂金時填少一點；0＝先建案不記付款） */
  paid: string;
  date: string;
  method: PaymentMethod;
  last5: string;
  gross: string;
  promo: string;
};
const thisYear = () => String(new Date().getFullYear());
const todayStr = () => new Date().toISOString().slice(0, 10);
const plusYear = (iso: string) => {
  const d = new Date(iso || todayStr());
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};
export const EMPTY_FEE: FeeDraft = { on: false, itemId: "", year: thisYear(), from: todayStr(), to: plusYear(todayStr()), amount: "", paid: "", date: "", method: "bank", last5: "", gross: "", promo: "me" };

export function feeToInput(f: FeeDraft, meId: string): ClientFeeInput | null {
  if (!f.on) return null;
  const amount = Number(String(f.amount).replace(/,/g, ""));
  const paid = f.paid.trim() === "" ? amount : Number(f.paid.replace(/,/g, ""));
  const gross = f.gross.trim() ? Number(f.gross.replace(/,/g, "")) : null;
  return {
    amount: Number.isFinite(amount) ? amount : 0,
    paid: Number.isFinite(paid) ? Math.max(0, paid) : 0,
    on: f.date,
    last5: f.last5.trim() || undefined,
    promoCoachId: f.promo === "me" ? meId : f.promo === "none" ? null : f.promo,
    itemId: f.itemId,
    serviceYear: Number(f.year) || new Date().getFullYear(),
    from: f.from || null,
    to: f.to || null,
    method: f.method,
    gross,
    fee: gross != null && Number.isFinite(paid) ? Math.max(0, gross - paid) : 0,
  };
}
export function feeError(f: FeeDraft): string | null {
  if (!f.on) return null;
  if (!f.itemId) return "請選服務方案";
  const amount = Number(String(f.amount).replace(/,/g, ""));
  if (!(amount > 0)) return "請填顧問費金額";
  const paid = f.paid.trim() === "" ? amount : Number(f.paid.replace(/,/g, ""));
  if (!Number.isFinite(paid) || paid < 0) return "本次付款金額不正確";
  if (paid > amount) return "本次付款不能超過顧問費總額";
  if (paid > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return "請填客戶付款日";
  return null;
}

export default function FeeFields({ value, onChange, meId, compact = false, lockOn = false }: { value: FeeDraft; onChange: (f: FeeDraft) => void; meId: string; compact?: boolean; lockOn?: boolean }) {
  const [coaches, setCoaches] = useState<{ id: string; name: string; rankCode: string | null }[]>([]);
  const [items, setItems] = useState<ServiceItemOption[] | null>(null);
  // 方案清單是非同步回來的；回來時要用「那一刻」的草稿往上送，不能用 effect 啟動時抓到的舊值（會把使用者打到一半的字洗掉）
  const latest = useRef(value);
  useEffect(() => { latest.current = value; }, [value]);
  useEffect(() => {
    if (!value.on) return;
    if (!coaches.length) coachOptionsAction().then(setCoaches).catch(() => {});
    if (items === null) serviceItemOptionsAction().then((list) => {
      setItems(list);
      // 預設選顧問費那個項目，金額帶定價
      const def = list.find((i) => i.default) ?? list[0];
      const cur = latest.current;
      if (def && !cur.itemId) onChange({ ...cur, itemId: def.id, amount: cur.amount || (def.price ? String(def.price) : "") });
    }).catch(() => setItems([]));
  }, [value.on]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<FeeDraft>) => onChange({ ...value, ...patch });
  const m = PAYMENT_METHODS.find((x) => x.value === value.method);
  return (
    <div className={`rounded-lg border ${value.on ? "border-brand2" : "border-line"} bg-panel2 p-3`}>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={value.on} disabled={lockOn} onChange={(e) => set({ on: e.target.checked, date: value.date || todayStr() })} />
        <span className="font-bold">建立付費顧問服務案件</span>
        <span className="text-xs text-tx3">勾了才會建案、記進公司收款明細與你的實績；沒收費的規劃不用勾</span>
      </label>
      {value.on && (
        <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-3 mt-3`}>
          <div className="col-span-2"><label className="text-xs text-tx2">服務方案 *</label>
            <select className={FIELD} value={value.itemId} onChange={(e) => { const it = items?.find((i) => i.id === e.target.value); set({ itemId: e.target.value, amount: it?.price ? String(it.price) : value.amount }); }}>
              {items === null && <option value="">載入中…</option>}
              {items?.length === 0 && <option value="">（帳務後台還沒有營業項目）</option>}
              {items?.map((i) => <option key={i.id} value={i.id}>{i.cat ? `${i.cat}・` : ""}{i.name}{i.price ? `（${i.price.toLocaleString()}）` : ""}</option>)}
            </select></div>
          <div><label className="text-xs text-tx2">服務年度</label><input className={FIELD} inputMode="numeric" value={value.year} onChange={(e) => set({ year: e.target.value })} /></div>
          <div><label className="text-xs text-tx2">顧問費總額 *</label><input className={FIELD} inputMode="numeric" value={value.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="60,000" /></div>
          <div><label className="text-xs text-tx2">本次付款金額</label><input className={FIELD} inputMode="numeric" value={value.paid} onChange={(e) => set({ paid: e.target.value })} placeholder={value.amount ? `同總額 ${value.amount}` : "同總額"} /></div>
          <div><label className="text-xs text-tx2">服務起日</label><input type="date" className={FIELD} value={value.from} onChange={(e) => set({ from: e.target.value, to: value.to || plusYear(e.target.value) })} /></div>
          <div><label className="text-xs text-tx2">服務迄日</label><input type="date" className={FIELD} value={value.to} onChange={(e) => set({ to: e.target.value })} /></div>
          <div><label className="text-xs text-tx2">付款方式</label>
            <select className={FIELD} value={value.method} onChange={(e) => set({ method: e.target.value as PaymentMethod })}>
              {PAYMENT_METHODS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select></div>
          <div><label className="text-xs text-tx2">客戶付款日</label><input type="date" className={FIELD} value={value.date} onChange={(e) => set({ date: e.target.value })} /></div>
          {value.method === "bank" ? (
            <div><label className="text-xs text-tx2">匯款後五碼</label><input className={FIELD} value={value.last5} onChange={(e) => set({ last5: e.target.value })} placeholder="選填" /></div>
          ) : (
            <div><label className="text-xs text-tx2">實付總額（含手續費）</label><input className={FIELD} inputMode="numeric" value={value.gross} onChange={(e) => set({ gross: e.target.value })} placeholder={m ? "選填" : ""} /></div>
          )}
          <div><label className="text-xs text-tx2">開發教練</label>
            <select className={FIELD} value={value.promo} onChange={(e) => set({ promo: e.target.value })}>
              <option value="me">本人（自招自執）</option>
              <option value="none">無／公司派案</option>
              {coaches.filter((c) => c.id !== meId).map((c) => <option key={c.id} value={c.id}>{c.name}{c.rankCode ? `（${c.rankCode}）` : ""}</option>)}
            </select></div>
          <p className="col-span-full text-xs text-tx3">送出後：建立服務案件（應收＝顧問費總額）、本次付款進公司「收款明細」等查帳；分期或訂金就把「本次付款金額」填少一點，之後在客戶頁補登。<b className="text-tx2">公司確認全額收款後</b>，客戶頁才會出現「啟動簽約流程」；確認後才算分潤與晉升實績。</p>
        </div>
      )}
    </div>
  );
}
