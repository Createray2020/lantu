import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { listCategories } from "@/lib/financeCategories";
import { listEduCosts, defaultEduCosts } from "@/lib/eduCosts";
import { birthCostRows, getBirthCostPayload } from "@/lib/birthCosts";
import { listBizTaxParams, defaultBizTaxRows, getBizTaxPayload } from "@/lib/bizTaxParams";
import { listInsProducts } from "@/lib/insProducts";
import { defaultInsProductRows } from "@/lib/insProducts.defaults";
import CategoriesBoard from "./CategoriesBoard";
import BirthCostsBoard from "./BirthCostsBoard";
import BizTaxBoard from "./BizTaxBoard";
import InsProductsBoard from "./InsProductsBoard";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [rows, eduRows, bizRows, bizPayload, insRows, birthRows, birthPayload] = await Promise.all([
    listCategories(), listEduCosts(), listBizTaxParams(), getBizTaxPayload(), listInsProducts(),
    birthCostRows(), getBirthCostPayload(),
  ]);
  // DB 有就用 DB 的，沒有那一列就顯示程式內建值（和前端 fallback 同一套語意）
  const bizByKey = new Map(bizRows.map((r) => [r.key, r]));
  const bizMerged = defaultBizTaxRows().map((d) => bizByKey.get(d.key) ?? d);

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="類別與參數設定" />
      <AdminNav />

      <section className="w-full px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">收支資債類別・教育與生育費用參數</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            這裡改的是<b className="text-brand2">全平台共用</b>的選項，所有教練即時生效（重新整理即可看到）。
            顆粒度愈細，之後的分析資料愈有得比——但同一個概念請只留一個名字，別出現同義詞。
          </p>
        </div>
        <CategoriesBoard rows={rows} eduRows={eduRows.length ? eduRows : defaultEduCosts()} />
        <BirthCostsBoard rows={birthRows} basis={birthPayload.basis} />
        <BizTaxBoard rows={bizMerged} basis={bizPayload.basis} />
        <InsProductsBoard rows={insRows.length ? insRows : defaultInsProductRows()} />
      </section>
    </main>
  );
}
