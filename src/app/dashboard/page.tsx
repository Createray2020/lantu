import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import PlannerFrame from "./PlannerFrame";

// 登入後即進入完整嵐途 App（v12 HTML 原型，嵌於受保護頁面）。
// 底層將於 P1+ 逐步改為 React + Neon；此頁確保「與現有 HTML 一模一樣」。
export default async function Dashboard() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <PlannerFrame />;
}
