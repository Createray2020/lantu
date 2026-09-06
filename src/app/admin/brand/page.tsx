import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import BrandSettings from "../BrandSettings";
import AdminHeader from "../AdminHeader";
import { getBrand } from "@/lib/brand";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

// 品牌設定原本內嵌在 /admin 首頁（教練帳號管理）底下，跟名單擠在同一頁、也沒有自己的入口。
// 抽成獨立頁後首頁回歸單一職責，這頁也才進得了「系統設定」那一組。
export default async function BrandPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const brand = await getBrand();

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="教練管理後台" />
      <AdminNav />
      <section className="max-w-4xl mx-auto px-5 py-6">
        <h1 className="text-xl font-bold mb-1">品牌設定</h1>
        <p className="text-tx2 text-sm mb-5">Logo 會套用到系統頂欄、報告書封面、瀏覽器分頁圖示與 PWA 圖示。</p>
        <BrandSettings currentLogo={brand.logoUrl} />
      </section>
    </main>
  );
}
