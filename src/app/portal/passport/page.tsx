import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientOwnPlan } from "@/lib/clientPlan";
import PassportWizard from "./PassportWizard";

export const dynamic = "force-dynamic";

// 人生護照精靈（客戶端）。任何登入者皆可用（含教練自己的規劃）；未登入才導去客戶登入。
export default async function PassportPage() {
  const user = await ensureClientUser();
  if (!user) redirect("/client/sign-in");
  const own = await getClientOwnPlan(user.id);
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <PassportWizard initial={own?.passport ?? null} />
    </div>
  );
}
