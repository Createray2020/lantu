import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { listVisitors, visitorNow, visitorStats } from "@/lib/visitors";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";
import VisitorsBoard, { type VisitorRow } from "./VisitorsBoard";

export const dynamic = "force-dynamic";

// 訪客記錄（2026/09/09 Ray）：外部客戶從「註冊」到「申請成為教練」中間走了幾步，
// 一列一位、一眼看完。此前這四件事分散在五張表，後台沒有任何一頁把它們接起來。
export default async function VisitorsPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const visitors = await listVisitors();
  const stats = visitorStats(visitors);
  // ⚠️ Date 過不了 server → client 的邊界（會被序列化成字串但型別對不上），
  //    一律在這裡轉成 ISO 字串，顯示格式交給 client 端統一處理。
  const rows: VisitorRow[] = visitors.map((v) => ({
    id: v.id,
    name: v.name,
    email: v.email,
    status: v.status,
    createdAt: v.createdAt.toISOString(),
    lastLoginAt: v.lastLoginAt ? v.lastLoginAt.toISOString() : null,
    loginCount: v.loginCount,
    clientCode: v.clientCode,
    passportSaved: v.passport.saved,
    passportAt: v.passport.updatedAt ? v.passport.updatedAt.toISOString() : null,
    healthGrade: v.passport.healthGrade,
    coachState: v.coach.state,
    coachName: v.coach.name,
    applyState: v.apply.state,
    applyAt: v.apply.submittedAt ? v.apply.submittedAt.toISOString() : null,
  }));

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="訪客記錄" />
      <AdminNav />

      <section className="w-full px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">訪客記錄</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            官網註冊的<b className="text-brand2">外部客戶</b>，以及每一位走到哪一步：
            註冊 → 登入 → 存檔人生護照 → 指定教練 → 申請成為教練。
            <br />
            登入次數以<b className="text-brand2">一次登入（一個瀏覽器工作階段）</b>為單位，
            不是頁面瀏覽數；每一次登入都完整保留，點「明細」可看全部歷史。
          </p>
        </div>

        <VisitorsBoard rows={rows} stats={stats} now={visitorNow()} />
      </section>
    </main>
  );
}
