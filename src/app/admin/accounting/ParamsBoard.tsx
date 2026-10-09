"use client";

import { FIELD_SM } from "@/components/ui/Field";
import type { AcctState, AcctItem } from "@/lib/acctEngine";
import { saveAcctItemsAction, saveAcctParamsAction } from "./actions";
import { RANK_ORDER } from "@/lib/license";
import { useAcct, ItemsEditor, card, h2, hint, NUM } from "./AcctParts";

// 帳務 › 參數設定：營業項目與單價拆分、營業稅率。目標設定與本月帳務都沿用這裡的參數。
export default function ParamsBoard({ initial }: { initial: AcctState }) {
  const { S, setS, run, status } = useAcct(initial);
  const saveItems = (items: AcctItem[]) => { setS((s) => ({ ...s, items })); run(() => saveAcctItemsAction(items), "已存營業項目"); };
  const saveParams = (patch: Partial<AcctState["params"]>, msg: string) => { const params = { ...S.params, ...patch }; setS((s) => ({ ...s, params })); run(() => saveAcctParamsAction(params), msg); };
  const saveVat = (vatRate: number) => saveParams({ vatRate }, "已存營業稅率");
  return (
    <div className="space-y-4">
      <div className="text-xs text-tx3 text-right h-4">{status}</div>
      <div className={card}>
        <h2 className={h2}>營業項目與單價拆分</h2>
        <p className={`${hint} mb-3`}>每個項目的單價要分給誰：比例、固定金額、分潤池（推薦人沿輔導鏈算差階）、公司自留、餘額再分。收款 − 匯出去的 ＝ 公司實收。餘額再分的受款人（講師一／二）在每一筆收款上指定。</p>
        <ItemsEditor items={S.items} onSave={saveItems} params={S.params} />
      </div>
      <div className={card}>
        <h2 className={h2}>課程與專案推薦率（V7.2 第 14 條）</h2>
        <p className={`${hint} mb-3`}>每筆收款挑「推薦人」，系統沿他的輔導鏈算：推薦人先拿自己的推薦率，上層逐層取正差額，整條最高 {S.params.referralCap}%。平階或倒掛那一層是 0。</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {RANK_ORDER.map((code) => (
            <span key={code}>{code} <input className={`${FIELD_SM} w-14 text-right`} inputMode="decimal" defaultValue={S.params.referralRates[code] ?? 0} onBlur={(e) => { const v = NUM(e.target.value); if (v !== (S.params.referralRates[code] ?? 0)) saveParams({ referralRates: { ...S.params.referralRates, [code]: v } }, `已存 ${code} 推薦率`); }} /> %</span>
          ))}
          <span className="text-tx2">整條上限 <input className={`${FIELD_SM} w-14 text-right`} inputMode="decimal" defaultValue={S.params.referralCap} onBlur={(e) => { const v = NUM(e.target.value); if (v !== S.params.referralCap) saveParams({ referralCap: v }, "已存推薦上限"); }} /> %</span>
        </div>
      </div>
      <div className={card}>
        <h2 className={h2}>年度合作費（V7.2 第 31 條）</h2>
        <p className={`${hint} mb-3`}>報聘核准入帳時依核定職級取價；實習期還沒滿就報聘的，首期收「提前報聘首期」那個數。期內晉升不補差額。</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {RANK_ORDER.filter((c) => c !== "INTERN" && c !== "PARTNER").map((code) => (
            <span key={code}>{code} <input className={`${FIELD_SM} w-20 text-right`} inputMode="numeric" defaultValue={S.params.annualFee[code] ?? 0} onBlur={(e) => { const v = NUM(e.target.value); if (v !== (S.params.annualFee[code] ?? 0)) saveParams({ annualFee: { ...S.params.annualFee, [code]: v } }, `已存 ${code} 年度合作費`); }} /></span>
          ))}
          <span className="text-tx2">提前報聘首期 <input className={`${FIELD_SM} w-20 text-right`} inputMode="numeric" defaultValue={S.params.earlyApplyFee} onBlur={(e) => { const v = NUM(e.target.value); if (v !== S.params.earlyApplyFee) saveParams({ earlyApplyFee: v }, "已存提前報聘首期"); }} /></span>
        </div>
      </div>
      <div className={card}>
        <h2 className={h2}>匯款扣繳</h2>
        <p className={`${hint} mb-3`}>受款人選「扣執行業務所得」時，同一人同月應付合計達起扣點才扣：所得稅扣繳＋二代健保補充保費，扣完＝實匯。選「開發票」的匯全額。</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span>扣繳率 <input className={`${FIELD_SM} w-16 text-right`} inputMode="decimal" defaultValue={S.params.tax.withholdRate} onBlur={(e) => { const v = NUM(e.target.value); if (v !== S.params.tax.withholdRate) saveParams({ tax: { ...S.params.tax, withholdRate: v } }, "已存扣繳率"); }} /> %</span>
          <span>補充保費率 <input className={`${FIELD_SM} w-16 text-right`} inputMode="decimal" defaultValue={S.params.tax.nhiRate} onBlur={(e) => { const v = NUM(e.target.value); if (v !== S.params.tax.nhiRate) saveParams({ tax: { ...S.params.tax, nhiRate: v } }, "已存補充保費率"); }} /> %</span>
          <span>起扣點 <input className={`${FIELD_SM} w-24 text-right`} inputMode="numeric" defaultValue={S.params.tax.threshold} onBlur={(e) => { const v = NUM(e.target.value); if (v !== S.params.tax.threshold) saveParams({ tax: { ...S.params.tax, threshold: v } }, "已存起扣點"); }} /> 元／月</span>
        </div>
      </div>
      <div className={card}>
        <h2 className={h2}>稅</h2>
        <p className={`${hint} mb-3`}>營業稅單獨列一層、從毛利後扣；營所稅先不算。</p>
        <div className="flex items-center gap-2 text-sm">營業稅率 <input className={`${FIELD_SM} w-16 text-right`} inputMode="decimal" defaultValue={S.params.vatRate} onBlur={(e) => { const v = NUM(e.target.value); if (v !== S.params.vatRate) saveVat(v); }} /> %</div>
      </div>
    </div>
  );
}
