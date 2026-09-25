import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getSiteNav } from "@/lib/siteNavStore";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";
import SiteNavEditor from "./SiteNavEditor";

export const dynamic = "force-dynamic";

// 官網頂欄（2026/09/26 Ray）：「官網後台要有一個模塊可以讓我們做前端設計，
// 可以放上連結網址出去，還有自己編輯字。」原型對過、樣式選定 E（細框＋滑過填色）。
export default async function SiteNavPage() {
  const me = await ensureCoach();
  if (!me || !(await isAdmin(me))) redirect("/dashboard");
  const { items, configured } = await getSiteNav();

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="官網頂欄" />
      <AdminNav />
      <section className="max-w-5xl mx-auto px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">官網頂欄</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            一般民眾進官網第一眼看到的那一列。文字、連結、順序都在這裡改，按「儲存」後官網立即套用。
            左邊的 logo 讀「品牌設定」上傳的圖，不在這裡改。
          </p>
        </div>
        <SiteNavEditor initial={items} configured={configured} />
      </section>
    </main>
  );
}
