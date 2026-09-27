import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { carPriceRows, carSettings, getCarPayload } from "@/lib/carParams";
import CarPricesBoard from "./CarPricesBoard";
import CarSettingsBoard from "./CarSettingsBoard";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function CarParamsPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");
  const [rows, settings, payload] = await Promise.all([carPriceRows(), carSettings(), getCarPayload()]);
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="車價參數" />
      <AdminNav />
      <section className="w-full px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">購車規劃・車價、品牌與持有成本參數</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            規劃器的「這一台車」卡用這裡的數字把<b className="text-brand2">品牌×車型×動力×車況</b>換算成市場起手估值，
            並依規格推養車成本。查價順序：<b>品牌列 → 等級層列 × 品牌價格係數 → 程式內建</b>。
            單位一律<b>萬／台（新車）</b>；中古＝新車價 × 保值曲線（車齡）× 品牌保值係數。這裡的數字是起手值，教練在卡上一定要跟客戶對過。
          </p>
        </div>
        <CarPricesBoard rows={rows} basis={payload.basis} brands={settings.brands} />
        <CarSettingsBoard settings={payload.settings} />
      </section>
    </main>
  );
}
