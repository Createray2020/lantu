import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { invoiceQueue } from "@/lib/serviceStore";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";
import InvoiceBoard, { type InvoiceRow } from "./InvoiceBoard";

export const dynamic = "force-dynamic";

// 發票待辦（2026/10/28）：公司獨立處理，與合約簽署互不等待。第一期人工回填；之後再串電子發票。
export default async function InvoicesPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");
  const q = await invoiceQueue();
  const rows: InvoiceRow[] = q.map((r) => ({
    caseType: r.caseType, caseId: r.caseId, label: r.label, itemName: r.itemName, amountDue: r.amountDue, confirmed: r.confirmed, met: r.met, coachName: r.coachName,
    invoice: r.invoice
      ? { buyerKind: r.invoice.buyerKind, title: r.invoice.title, taxId: r.invoice.taxId, email: r.invoice.email, carrier: r.invoice.carrier, invoiceNo: r.invoice.invoiceNo, issuedOn: r.invoice.issuedOn, amount: r.invoice.amount, status: r.invoice.status, failReason: r.invoice.failReason, note: r.invoice.note }
      : null,
  }));
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="發票待辦" />
      <AdminNav />
      <section className="max-w-5xl mx-auto px-5 py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold">發票待辦</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">收款達門檻的案件在這裡回填發票；客戶簽沒簽合約不影響開票，發票沒開也不擋簽約。</p>
        </div>
        <InvoiceBoard rows={rows} />
      </section>
    </main>
  );
}
