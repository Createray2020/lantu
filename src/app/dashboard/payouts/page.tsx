import Link from "next/link";
import { redirect } from "next/navigation";
import DashboardHeader from "../DashboardHeader";
import { headerProps } from "../headerProps";
import { ensureCoach } from "@/lib/coach";
import { getAcctState, currentYm } from "@/lib/acctStore";
import { isYm, payeeKey, statementOf, statementMonths } from "@/lib/acctEngine";
import StatementView from "@/app/admin/accounting/StatementView";

export const dynamic = "force-dynamic";

// 教練端：我的分潤（2026/10/08）。只看自己那一個受款人的對帳單；沒填收款設定會提醒去填。
export default async function MyPayoutsPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (me.status !== "active") redirect("/dashboard");
  const sp = await searchParams;
  const [S, hp] = await Promise.all([getAcctState(), headerProps(me)]);
  const rec = (S.payeeBook ?? []).find((p) => p.coachId === me.id) ?? null;
  const key = payeeKey(rec, (me.displayName || me.name || "").trim());
  const months = statementMonths(S, key);
  const ym = isYm(sp.ym) ? String(sp.ym) : months[0] ?? currentYm();
  const l = statementOf(S, ym, key);
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <DashboardHeader {...hp} />
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        <div>
          <h1 className="text-xl font-bold">我的分潤</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">每個月分到的錢怎麼來、扣多少、實匯多少、匯了沒。收款帳號在 <Link href="/dashboard/profile" className="underline underline-offset-4 hover:text-tx">我的檔案 › 收款設定</Link>。</p>
        </div>
        {!rec && <div className="rounded-xl border border-danger/40 bg-panel px-4 py-3 text-sm text-tx2">還沒填收款設定——分潤算得出來但匯不出去。<Link href="/dashboard/profile" className="text-brand2 underline ml-1">去填</Link></div>}
        {months.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-tx3">月份</span>
            {months.map((k) => <Link key={k} href={`/dashboard/payouts?ym=${k}`} className={`rounded-lg border px-2 py-0.5 text-xs ${k === ym ? "border-brand2 text-brand2" : "border-line text-tx2 hover:bg-panel3"}`}>{k}</Link>)}
          </div>
        )}
        {l ? <StatementView ym={ym} l={l} title="我的分潤對帳單" /> : <div className="rounded-xl border border-line bg-panel p-5 text-sm text-tx2">{months.length ? `${ym} 沒有分潤。` : "目前還沒有分潤紀錄。"}</div>}
      </section>
    </main>
  );
}
