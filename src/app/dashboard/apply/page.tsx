import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { ensureCoach } from "@/lib/coach";
import ApplyForm from "./ApplyForm";

export const dynamic = "force-dynamic";

// 教練申請入口（/sign-up 教練註冊後的落點）。已經有教練身分就直接回 /dashboard。
export default async function ApplyPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const coach = await ensureCoach();
  if (coach) redirect("/dashboard");

  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] text-[#eef2f7] px-6 py-12">
      <ApplyForm email={user.primaryEmailAddress?.emailAddress ?? null} />
    </main>
  );
}
