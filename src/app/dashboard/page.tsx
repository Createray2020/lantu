import { redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import PlannerFrame from "./PlannerFrame";
import PendingNotice from "./PendingNotice";

export const dynamic = "force-dynamic";

// 登入後：確認教練帳號與狀態。
// - 未登入 → 導回登入。
// - 未開通／停權 → 顯示待開通頁（進不了 App）。
// - 已開通 → 進入完整嵐途 App。
export default async function Dashboard() {
  const coach = await ensureCoach();
  if (!coach) redirect("/sign-in");
  if (coach.status !== "active") {
    return <PendingNotice email={coach.email} status={coach.status} />;
  }
  return <PlannerFrame isAdmin={coach.role === "admin"} />;
}
