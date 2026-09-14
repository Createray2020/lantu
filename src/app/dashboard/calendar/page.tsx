import { redirect } from "next/navigation";
import { ensureCoach } from "@/lib/coach";
import { rankOf } from "@/lib/org";
import { todayISO } from "@/lib/license";
import { currentMonth, getEvent, listMonth, listPastEvents } from "@/lib/orgEvents";
import DashboardHeader from "../DashboardHeader";
import { headerProps } from "../headerProps";
import CalendarBoard from "./CalendarBoard";

export const dynamic = "force-dynamic";

// 公司行事曆（教練端，唯讀）。建立與編輯在 /admin/calendar。
//
// ⚠️⚠️ 可見層級的過濾在 lib/orgEvents 的 SQL 裡，不在這裡也不在畫面上。
//    這一頁拿到的陣列會被序列化進 RSC payload —— 撈全部再在畫面上藏，
//    等於把「僅核心成員」那幾場的標題印在網頁原始碼裡。
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; e?: string }>;
}) {
  const coach = await ensureCoach();
  if (!coach) redirect("/dashboard");
  if (coach.status !== "active") redirect("/dashboard");

  const hp = await headerProps(coach);
  const rank = rankOf(coach);
  const sp = await searchParams;

  let ym = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? (sp.m as string) : null;
  // 從首頁點某一場進來（?e=）：先把那一場查出來，順便把月份切到它所在的月，
  // 否則點的是下個月的事件、畫面卻停在這個月，抽屜一關就找不到它。
  let openId: string | null = null;
  if (sp.e) {
    const hit = await getEvent(rank, sp.e);
    if (hit) {
      openId = hit.id;
      if (!ym) ym = hit.date.slice(0, 7);
    }
  }
  const month = ym ?? currentMonth();

  const [events, past] = await Promise.all([
    listMonth(rank, month),
    listPastEvents(rank, 40),
  ]);

  return (
    <div className="min-h-screen bg-canvas text-tx">
      <DashboardHeader {...hp} />
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">公司行事曆</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            會議、活動與公司行程，加上<b className="text-brand2">教育訓練場次</b>。
            訓練場次由後台「訓練時數」建立，這裡只顯示。
          </p>
        </div>
        <CalendarBoard
          ym={month}
          events={events}
          past={past}
          today={todayISO()}
          initialOpenId={openId}
        />
      </div>
    </div>
  );
}
