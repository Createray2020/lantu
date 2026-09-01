import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { getClientDashPayload } from "@/lib/clientDashStore";
import ClientViewBoard from "./ClientViewBoard";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

// 客戶財務儀表板的顯示開關（Ray 2026/09/01）。
// ⚠️ 這一層刻意只有全平台，沒有「教練逐客戶再調」——這塊決定「客戶看得到什麼」，
//    是公司對外一致性的事，不是個人偏好（與 /admin/analysis 的三層語意刻意不同）。
export default async function ClientViewPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [payload, brand] = await Promise.all([getClientDashPayload(), getBrand()]);

  return (
    <main className="flex-1 bg-[#081a2b] text-[#eef2f7] min-h-screen">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#0d2b45]">
        <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="嵐途" className="h-7 w-auto max-w-[160px] object-contain" />
          )}
          <span className="font-serif text-lg tracking-[0.14em]">嵐途 LAN TU</span>
        </Link>
        <span className="text-[#a9bccf] text-xs">客戶端顯示</span>
        <div className="flex-1" />
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-3xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">客戶財務儀表板 · 顯示哪些模組</h1>
          <p className="text-sm text-[#a9bccf] mt-1 leading-relaxed">
            客戶登入之後看到的那一頁要放什麼。取消勾選的模組，
            <b className="text-[#e0bd8b]">全公司的客戶都不會看到</b>——這一層是公司對外的一致性，
            教練不能為個別客戶再調。
            <br />
            沒設定過＝全部顯示；之後系統新增模組也預設顯示，要關再回來取消勾選。
          </p>
        </div>
        <ClientViewBoard hidden={payload.hidden} />
      </section>
    </main>
  );
}
