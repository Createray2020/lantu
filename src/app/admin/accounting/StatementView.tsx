import { fmtMoney0 as F } from "@/lib/money";
import { TAX_MODE_LABEL, bankLine, type PayoutLine } from "@/lib/acctEngine";

// 一個人一個月的對帳單（後台與教練端共用，純呈現；標已匯在後台另外掛）。
// 版面：抬頭（誰、哪個月、匯入哪裡）→ 三個數（應付／扣繳／實匯）→ 來源逐筆。
export default function StatementView({ ym, l, title }: { ym: string; l: PayoutLine; title?: string }) {
  const bank = bankLine(l.rec);
  const t = l.tax;
  return (
    <div className="rounded-xl border border-line bg-panel p-5 shadow-e1 print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-tx3">{title ?? "分潤對帳單"}</div>
          <h2 className="text-lg font-bold mt-0.5">{l.payee}・{ym}</h2>
          <div className="text-xs text-tx2 mt-1 leading-relaxed">
            {l.rec ? (
              <>
                <div>稅務方式：{TAX_MODE_LABEL[l.rec.taxMode]}{l.rec.taxMode === "invoice" ? "（請開立發票給嵐途）" : ""}</div>
                <div>匯入：{bank ? `${bank}` : <span className="text-danger">尚未填銀行帳號</span>}{l.rec.accountName ? `　戶名 ${l.rec.accountName}` : ""}</div>
              </>
            ) : <div className="text-danger">還沒對到受款人簿——請到「受款人」建立並填帳號與稅務方式。</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-tx3">{l.mark ? `已匯 ${l.mark.paidOn || ""}` : "未匯"}</div>
          <div className={`text-2xl font-bold ${l.mark && l.remaining <= 0.5 ? "text-ok" : "text-brand2"}`}>{F(t.net)}</div>
          <div className="text-xs text-tx3">實匯</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="rounded-lg bg-panel2 p-3"><div className="text-xs text-tx3">應付合計</div><div className="text-lg font-bold">{F(l.due)}</div></div>
        <div className="rounded-lg bg-panel2 p-3"><div className="text-xs text-tx3">扣繳{t.applied ? "" : "（未達起扣點）"}</div><div className="text-lg font-bold">{t.applied ? `−${F(t.withhold + t.nhi)}` : "0"}</div>{t.applied && <div className="text-xs text-tx3">所得稅 {F(t.withhold)}・補充保費 {F(t.nhi)}</div>}</div>
        <div className="rounded-lg bg-panel2 p-3"><div className="text-xs text-tx3">實匯</div><div className="text-lg font-bold text-brand2">{F(t.net)}</div>{l.mark && <div className="text-xs text-tx3">已匯 {F(l.mark.amount)}</div>}</div>
      </div>
      <table className="w-full text-sm mt-4">
        <thead><tr className="text-xs text-tx3"><th className="text-left py-1">日期</th><th className="text-left">項目</th><th className="text-left">匯款人</th><th className="text-left">怎麼算</th><th className="text-right">金額</th></tr></thead>
        <tbody>
          {l.srcs.map((s, i) => (
            <tr key={i} className="border-t border-line"><td className="py-1.5 whitespace-nowrap">{s.on}</td><td>{s.itemName}</td><td>{s.payer}</td><td className="text-tx3 text-xs">{s.label}</td><td className="text-right tabular-nums">{F(s.v)}</td></tr>
          ))}
          <tr className="border-t border-line2 font-bold"><td colSpan={4} className="py-1.5 text-right">合計</td><td className="text-right tabular-nums">{F(l.due)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
