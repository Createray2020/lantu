import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientOwnPlan } from "@/lib/clientPlan";
import PassportWizard from "@/components/PassportWizard";

export const dynamic = "force-dynamic";

// 人生護照精靈（客戶端）。任何登入者皆可用（含教練自己的規劃）；未登入才導去客戶登入。
//
// ?restore=1 ＝ 從官網公開試算按存檔、走完註冊／登入之後回來的那一趟。
// 只有這個情況才讓瀏覽器裡的草稿覆蓋既有內容；平常進來一律以資料庫那份為準，
// 否則 sessionStorage 的殘留會在下次編輯時把客戶既有的護照悄悄換掉。
export default async function PassportPage({
  searchParams,
}: {
  searchParams: Promise<{ restore?: string }>;
}) {
  const user = await ensureClientUser();
  if (!user) redirect("/client/sign-in?redirect_url=%2Fportal%2Fpassport%3Frestore%3D1");
  const sp = await searchParams;
  const own = await getClientOwnPlan(user.id);
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <PassportWizard initial={own?.passport ?? null} mode="private" restore={sp.restore === "1"} />
    </div>
  );
}
