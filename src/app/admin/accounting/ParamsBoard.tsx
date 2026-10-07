"use client";

import { FIELD_SM } from "@/components/ui/Field";
import type { AcctState, AcctItem } from "@/lib/acctEngine";
import { saveAcctItemsAction, saveAcctParamsAction } from "./actions";
import { useAcct, ItemsEditor, card, h2, hint, NUM, btn, xbtn } from "./AcctParts";

// 帳務 › 參數設定：營業項目與單價拆分、營業稅率。目標設定與本月帳務都沿用這裡的參數。
export default function ParamsBoard({ initial }: { initial: AcctState }) {
  const { S, setS, run, status } = useAcct(initial);
  const saveItems = (items: AcctItem[]) => { setS((s) => ({ ...s, items })); run(() => saveAcctItemsAction(items), "已存營業項目"); };
  const saveParams = (patch: Partial<AcctState["params"]>, msg: string) => { const params = { ...S.params, ...patch }; setS((s) => ({ ...s, params })); run(() => saveAcctParamsAction(params), msg); };
  const saveVat = (vatRate: number) => saveParams({ vatRate }, "已存營業稅率");
  const tiers = S.params.poolTiers;
  const setTier = (n: number, text: string) => {
    const arr = text.split(/[,，／/\s]+/).map((x) => NUM(x)).filter((x) => x > 0);
    const next = tiers.map((t, i) => i === n ? arr : t);
    saveParams({ poolTiers: next }, `已存 ${n + 1} 人切法`);
  };
  return (
    <div className="space-y-4">
      <div className="text-xs text-tx3 text-right h-4">{status}</div>
      <div className={card}>
        <h2 className={h2}>營業項目與單價拆分</h2>
        <p className={`${hint} mb-3`}>每個項目的單價要分給誰：比例、固定金額、分潤池（看那一筆有幾位分潤人）、公司自留、餘額再分。收款 − 匯出去的 ＝ 公司實收。餘額再分的受款人（講師一／二）在每一筆收款上指定。</p>
        <ItemsEditor items={S.items} onSave={saveItems} params={S.params} />
      </div>
      <div className={card}>
        <h2 className={h2}>分潤池切法</h2>
        <p className={`${hint} mb-3`}>一筆收款有幾位分潤人，各占收款的 %（職級由低到高）。對帳表：1 人 30；2 人 25／5。3 人以上照制度表填。</p>
        <div className="space-y-1.5">
          {tiers.map((t, n) => (
            <div key={`${n}-${t.join("-")}`} className="flex items-center gap-2 text-sm">
              <span className="w-12 text-tx2">{n + 1} 人</span>
              <input className={`${FIELD_SM} w-48`} defaultValue={t.join("／")} placeholder="例：25／5" onBlur={(e) => { const v = e.target.value.trim(); if (v !== t.join("／")) setTier(n, v); }} />
              <span className="text-xs text-tx3">合計 {t.reduce((a, b) => a + b, 0)}%</span>
              {n === tiers.length - 1 && tiers.length > 1 && <button className={xbtn} onClick={() => saveParams({ poolTiers: tiers.slice(0, -1) }, "已刪最後一階")}>✕</button>}
            </div>
          ))}
          <button className={btn} onClick={() => saveParams({ poolTiers: [...tiers, []] }, `已加 ${tiers.length + 1} 人那一階`)}>＋ {tiers.length + 1} 人</button>
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
