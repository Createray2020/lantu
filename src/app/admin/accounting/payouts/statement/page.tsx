import Link from "next/link";
import { acctShell } from "../../AcctPage";
import StatementView from "../../StatementView";
import { statementOf, statementMonths, isYm } from "@/lib/acctEngine";

export const dynamic = "force-dynamic";

// 後台：某受款人某月的對帳單（從分潤匯款點人進來）。?key=p:<id>|n:<名字>&ym=YYYY-MM
export default async function AccountingStatementPage({ searchParams }: { searchParams: Promise<{ key?: string; ym?: string }> }) {
  const sp = await searchParams;
  const key = String(sp.key ?? ""), ym = isYm(sp.ym) ? String(sp.ym) : "";
  return acctShell("分潤對帳單", "這一個人這一個月的分潤怎麼來、扣多少、匯多少、匯去哪。可直接列印給對方。", (state, today) => {
    const m = ym || today;
    const l = key ? statementOf(state, m, key) : null;
    const months = key ? statementMonths(state, key) : [];
    return (
      <div className="space-y-3 max-w-4xl">
        <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
          <Link href="/admin/accounting/payouts" className="text-tx3 hover:text-brand2">‹ 回分潤匯款</Link>
          {months.length > 0 && <span className="text-tx3 ml-2">其他月份：</span>}
          {months.map((k) => <Link key={k} href={`/admin/accounting/payouts/statement?key=${encodeURIComponent(key)}&ym=${k}`} className={`rounded-lg border px-2 py-0.5 text-xs ${k === m ? "border-brand2 text-brand2" : "border-line text-tx2 hover:bg-panel3"}`}>{k}</Link>)}
        </div>
        {l ? <StatementView ym={m} l={l} /> : <div className="rounded-xl border border-line bg-panel p-5 text-sm text-tx2">{m} 沒有這位受款人的分潤。</div>}
      </div>
    );
  });
}
