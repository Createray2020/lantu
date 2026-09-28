import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getAcctState, currentYm } from "@/lib/acctStore";
import AcctBoard from "./AcctBoard";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");
  const state = await getAcctState();
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="帳務" />
      <AdminNav />
      <section className="w-full px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">帳務總覽</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            營業項目 → 單價拆分 → 本月數量 → 固定支出 → 淨利。改了就存，數字即時重算。
            拆分對象暫時是自由文字（之後可對到教練與職級分潤表）；營業稅單獨列一層、營所稅先不算。
          </p>
        </div>
        <AcctBoard initial={state} today={currentYm()} />
      </section>
    </main>
  );
}
