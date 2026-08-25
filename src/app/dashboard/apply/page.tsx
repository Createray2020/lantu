import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { ensureCoach } from "@/lib/coach";
import ApplyForm from "./ApplyForm";

export const dynamic = "force-dynamic";

// 教練申請入口。兩條路進得來：
//   · 未註冊 → /join 的「直接送出申請」→ /sign-up → 註冊完自動落到這裡
//   · 已登入（含只有客戶帳號的人）→ /join 的同一顆按鈕直接指到這裡
// 已經有教練身分就直接回 /dashboard。
export default async function ApplyPage() {
  const user = await currentUser();
  // 官網只有 /login 一顆登入（/sign-in 沒有任何入口連得到），登入完要回得來這一頁。
  if (!user) redirect("/login?redirect_url=/dashboard/apply");
  const coach = await ensureCoach();
  if (coach) redirect("/dashboard");

  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] text-[#eef2f7] px-6 py-12">
      <ApplyForm
        email={user.primaryEmailAddress?.emailAddress ?? null}
        defaultName={[user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || ""}
      />
    </main>
  );
}
