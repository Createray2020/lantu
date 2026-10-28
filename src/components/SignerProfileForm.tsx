"use client";

import { FIELD } from "@/components/ui/Field";

/** 簽約資料的表單值（跟 docsStore.SignerProfileInput 同形，client 端不 import server 模組）。 */
export type ProfileDraft = {
  idNo: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  invoiceKind: "personal" | "company";
  invoiceCarrier: string;
  invoiceTaxId: string;
  invoiceTitle: string;
};

export const emptyProfile = (seed: Partial<ProfileDraft> = {}): ProfileDraft => ({
  idNo: "", birthDate: "", phone: "", email: "", address: "", invoiceKind: "personal", invoiceCarrier: "", invoiceTaxId: "", invoiceTitle: "", ...seed,
});

/** 前端的「填齊了嗎」：與 server 的 profileMissing 同一把尺（身分證、生日、電話、Email、地址；公司發票要統編與抬頭）。 */
export function profileComplete(p: ProfileDraft): boolean {
  if (!p.idNo.trim() || !p.birthDate || !p.phone.trim() || !p.email.trim() || !p.address.trim()) return false;
  if (p.invoiceKind === "company" && (!p.invoiceTaxId.trim() || !p.invoiceTitle.trim())) return false;
  return true;
}

/**
 * 簽約資料（2026/10/28 Ray：「申請人填一次，三份文件共用，簽約人只需要簽名」）。
 * 申請表、儀表板培訓案件卡、日後客戶端都用這一份；它只管欄位，存哪裡由外面決定。
 */
export default function SignerProfileForm({ value, onChange, disabled = false }: { value: ProfileDraft; onChange: (v: ProfileDraft) => void; disabled?: boolean }) {
  const set = (p: Partial<ProfileDraft>) => onChange({ ...value, ...p });
  const L = "grid gap-1 text-xs text-tx3";
  return (
    <div className="grid gap-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className={L}>身分證字號／護照號碼
          <input className={field} value={value.idNo} onChange={(e) => set({ idNo: e.target.value.toUpperCase() })} placeholder="A123456789" autoComplete="off" disabled={disabled} /></label>
        <label className={L}>出生日期
          <input type="date" className={field} value={value.birthDate} onChange={(e) => set({ birthDate: e.target.value })} disabled={disabled} /></label>
        <label className={L}>電話
          <input className={field} value={value.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="0912-345-678" inputMode="tel" disabled={disabled} /></label>
        <label className={L}>Email
          <input className={field} value={value.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@example.com" inputMode="email" disabled={disabled} /></label>
      </div>
      <label className={L}>通訊地址
        <input className={field} value={value.address} onChange={(e) => set({ address: e.target.value })} placeholder="含郵遞區號" disabled={disabled} /></label>
      <div className="grid gap-2">
        <div className="text-xs text-tx3">發票開立方式</div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="invoiceKind" checked={value.invoiceKind === "personal"} onChange={() => set({ invoiceKind: "personal" })} disabled={disabled} />個人</label>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="invoiceKind" checked={value.invoiceKind === "company"} onChange={() => set({ invoiceKind: "company" })} disabled={disabled} />公司</label>
        </div>
        {value.invoiceKind === "personal" ? (
          <label className={L}>雲端發票載具（手機條碼，可留空）
            <input className={field} value={value.invoiceCarrier} onChange={(e) => set({ invoiceCarrier: e.target.value })} placeholder="/ABC+123" disabled={disabled} /></label>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className={L}>統一編號
              <input className={field} value={value.invoiceTaxId} onChange={(e) => set({ invoiceTaxId: e.target.value.replace(/\D/g, "").slice(0, 8) })} inputMode="numeric" placeholder="12345678" disabled={disabled} /></label>
            <label className={L}>發票抬頭
              <input className={field} value={value.invoiceTitle} onChange={(e) => set({ invoiceTitle: e.target.value })} placeholder="公司全名" disabled={disabled} /></label>
          </div>
        )}
      </div>
    </div>
  );
}

const field = FIELD;
