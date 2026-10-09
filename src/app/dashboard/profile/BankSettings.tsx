"use client";

import { useState, useTransition } from "react";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { TAX_MODE_LABEL, type PayeeRec, type TaxMode } from "@/lib/acctEngine";
import { saveMyPayeeAction } from "./actions";

// 我的檔案 › 收款設定（2026/10/08）：分潤要匯到哪、怎麼扣。寫的是受款人簿裡自己那一列，後台也看得到、改得到。
type Form = Pick<PayeeRec, "bankCode" | "bankName" | "branch" | "accountName" | "accountNo" | "taxMode" | "note">;
const EMPTY: Form = { bankCode: "", bankName: "", branch: "", accountName: "", accountNo: "", taxMode: "", note: "" };

function L({ k, label, w, ph, mode, f, set }: { k: keyof Form; label: string; w: string; ph?: string; mode?: "numeric"; f: Form; set: (k: keyof Form, v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm"><span className="text-xs text-tx3">{label}</span>
      <input className={`${FIELD_SM} ${w}`} value={f[k]} placeholder={ph} inputMode={mode} onChange={(e) => set(k, e.target.value)} /></label>
  );
}

export default function BankSettings({ initial }: { initial: PayeeRec | null }) {
  const [f, setF] = useState<Form>(initial ? { bankCode: initial.bankCode, bankName: initial.bankName, branch: initial.branch, accountName: initial.accountName, accountNo: initial.accountNo, taxMode: initial.taxMode, note: initial.note } : EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Form, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = () => start(async () => { const r = await saveMyPayeeAction(f); setMsg(r.ok ? "已存收款設定" : r.error); });
  return (
    <div className="mt-6 rounded-xl border border-line bg-panel p-5 shadow-e1">
      <h2 className="text-sm font-bold border-l-[3px] border-brand2 pl-2 mb-1">收款設定</h2>
      <p className="text-xs text-tx3 leading-relaxed mb-3">分潤要匯到哪一個帳戶、用哪一種方式。這裡只有你和嵐途後台看得到，不會公開。每個月的分潤明細在「我的分潤」。</p>
      <div className="flex flex-wrap items-end gap-3">
        <L k="bankCode" label="銀行代碼" w="w-20" ph="808" mode="numeric" f={f} set={set} />
        <L k="bankName" label="銀行" w="w-32" ph="玉山銀行" f={f} set={set} />
        <L k="branch" label="分行" w="w-32" f={f} set={set} />
        <L k="accountName" label="戶名" w="w-36" f={f} set={set} />
        <L k="accountNo" label="帳號" w="w-48" mode="numeric" f={f} set={set} />
        <label className="flex flex-col gap-1 text-sm"><span className="text-xs text-tx3">稅務方式</span>
          <select className={SELECT_SM} value={f.taxMode} onChange={(e) => set("taxMode", e.target.value as TaxMode)}>
            {(Object.keys(TAX_MODE_LABEL) as TaxMode[]).map((m) => <option key={m} value={m}>{TAX_MODE_LABEL[m]}</option>)}
          </select></label>
        <L k="note" label="備註" w="w-48" f={f} set={set} />
      </div>
      <p className="text-xs text-tx3 mt-2 leading-relaxed">
        <b>開發票</b>：匯全額，請開立發票給嵐途。<b>扣執行業務所得</b>：同一個月分潤合計達起扣點時，由嵐途代扣所得稅與二代健保補充保費後匯款，年底開立扣繳憑單。
      </p>
      <div className="flex items-center gap-3 mt-3">
        <button className="rounded-lg border border-brand2 text-brand2 px-3 py-1.5 text-sm hover:bg-panel3 disabled:opacity-40" disabled={pending} onClick={save}>{pending ? "存檔中…" : "存收款設定"}</button>
        <span className="text-xs text-tx3">{msg}</span>
      </div>
    </div>
  );
}
