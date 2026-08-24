import { NextResponse } from "next/server";
import { ensureCoach } from "@/lib/coach";
import { countPendingForCoach } from "@/lib/coachLink";
import { countPendingInvitesForCoach } from "@/lib/clientCollab";

export const dynamic = "force-dynamic";

// 教練端頁首徽章用：待接受的客戶連結申請數 ＋ 待回覆的共同執案邀請數。
// 兩種都在 /dashboard/requests 這一頁處理，紅點也就只有一顆。
export async function GET() {
  try {
    const coach = await ensureCoach();
    if (!coach || coach.status !== "active") return NextResponse.json({ count: 0 });
    const [links, collab] = await Promise.all([
      countPendingForCoach(coach.id),
      countPendingInvitesForCoach(coach.id),
    ]);
    return NextResponse.json({ count: links + collab });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
