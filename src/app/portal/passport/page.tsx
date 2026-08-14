import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ensureClientUser } from "@/lib/clientUser";
import { getClientOwnPlan } from "@/lib/clientPlan";
import PassportWizard from "./PassportWizard";

export const dynamic = "force-dynamic";

// 人生護照精靈（客戶端）。已有基礎方案則帶回原本填的內容供編修。
export default async function PassportPage() {
  const user = await ensureClientUser();
  if (!user) {
    const { userId } = await auth();
    redirect(userId ? "/dashboard" : "/client/sign-in");
  }
  const own = await getClientOwnPlan(user.id);
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7]">
      <PassportWizard initial={own?.passport ?? null} />
    </div>
  );
}
