"use client";

import { FIELD_SM } from "@/components/ui/Field";
import type { AcctState, AcctItem } from "@/lib/acctEngine";
import { saveAcctItemsAction, saveAcctParamsAction } from "./actions";
import { useAcct, ItemsEditor, card, h2, hint, NUM } from "./AcctParts";

// 帳務 › 參數設定：營業項目與單價拆分、營業稅率。目標設定與本月帳務都沿用這裡的參數。
export default function ParamsBoard({ initial }: { initial: AcctState }) {
  const { S, setS, run, status } = useAcct(initial);
  const saveItems = (items: AcctItem[]) => { setS((s) => ({ ...s, items })); run(() => saveAcctItemsAction(items), "已存營業項目"); };
  const saveVat = (vatRate: number) => { setS((s) => ({ ...s, params: { vatRate } })); run(() => saveAcctParamsAction({ vatRate }), "已存營業稅率"); };
  return (
    <div className="space-y-4">
      <div className="text-xs text-tx3 text-right h-4">{status}</div>
      <div className={card}>
        <h2 className={h2}>營業項目與單價拆分</h2>
        <p className={`${hint} mb-3`}>每個項目的單價要分給誰：比例（%）或固定金額都可以。扣完就是這一筆的毛利。拆分對象先自由文字，之後可對到教練與職級分潤表。</p>
        <ItemsEditor items={S.items} onSave={saveItems} />
      </div>
      <div className={card}>
        <h2 className={h2}>稅</h2>
        <p className={`${hint} mb-3`}>營業稅單獨列一層、從毛利後扣；營所稅先不算。</p>
        <div className="flex items-center gap-2 text-sm">營業稅率 <input className={`${FIELD_SM} w-16 text-right`} inputMode="decimal" defaultValue={S.params.vatRate} onBlur={(e) => { const v = NUM(e.target.value); if (v !== S.params.vatRate) saveVat(v); }} /> %</div>
      </div>
    </div>
  );
}
