import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getAcctState, currentYm } from "@/lib/acctStore";
import type { AcctState } from "@/lib/acctEngine";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";

// 帳務三頁共用的殼：admin 才進得去、載入狀態、頂欄＋導覽。頁面標題＝導覽項目名稱。
export async function acctShell(title: string, lead: string, body: (state: AcctState, today: string) => React.ReactNode) {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");
  const state = await getAcctState();
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label={`帳務 · ${title}`} />
      <AdminNav />
      <section className="w-full px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">{lead}</p>
        </div>
        {body(state, currentYm())}
      </section>
    </main>
  );
}
