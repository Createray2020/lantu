import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getClientDashPayload } from "@/lib/clientDashStore";
import ClientViewBoard from "./ClientViewBoard";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

// 客戶財務儀表板的顯示開關（Ray 2026/09/01）。
// ⚠️ 這一層刻意只有全平台，沒有「教練逐客戶再調」——這塊決定「客戶看得到什麼」，
//    是公司對外一致性的事，不是個人偏好（與 /admin/analysis 的三層語意刻意不同）。
export default async function ClientViewPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [payload] = await Promise.all([getClientDashPayload()
  ]);

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="客戶端顯示" />
      <AdminNav />

      <section className="max-w-3xl mx-auto px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">客戶財務儀表板 · 顯示哪些模組</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            客戶登入之後看到的那一頁要放什麼。除了原本的總覽六塊，
            教練端「<b className="text-brand2">分析</b>」與「<b className="text-brand2">建議</b>」
            兩個分頁的模組現在<b className="text-brand2">全部都在這裡</b>，想給哪塊就開哪塊。
            <br />
            取消勾選的模組，<b className="text-brand2">全公司的客戶都不會看到</b>——這一層是公司對外的一致性，
            教練不能為個別客戶再調。沒設定過＝全部顯示；之後系統新增模組也預設顯示。
          </p>
        </div>
        <ClientViewBoard hidden={payload.hidden} />
      </section>
    </main>
  );
}
