import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { housePriceRows, houseSettings, getHousePayload } from "@/lib/houseParams";
import HousePricesBoard from "./HousePricesBoard";
import HouseSettingsBoard from "./HouseSettingsBoard";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function HouseParamsPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");
  const [rows, settings, payload] = await Promise.all([housePriceRows(), houseSettings(), getHousePayload()]);
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="房價參數" />
      <AdminNav />
      <section className="w-full px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">購屋規劃・房價與付款參數</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            規劃器的「這一間房」卡用這裡的數字把<b className="text-brand2">地區×屋況×規格</b>換算成市場起手估值。
            查價順序：<b>行政區列 → 縣市列 → 程式內建</b>；行政區沒填就沿用縣市。
            單位一律<b>萬／權狀坪（含公設）</b>，車位另計（萬／位）。這裡的數字是起手值，教練在卡上一定要跟客戶對過。
          </p>
        </div>
        <HousePricesBoard rows={rows} basis={payload.basis} />
        <HouseSettingsBoard settings={{ ...settings, ageRatio: settings.ageRatio.map((x) => [Number.isFinite(x[0]) ? x[0] : null, x[1]]) }} />
      </section>
    </main>
  );
}
