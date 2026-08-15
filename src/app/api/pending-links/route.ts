import { NextResponse } from "next/server";
import { ensureCoach } from "@/lib/coach";
import { countPendingForCoach } from "@/lib/coachLink";

export const dynamic = "force-dynamic";

// 教練端頁首徽章用：待接受的客戶連結申請數。
export async function GET() {
  try {
    const coach = await ensureCoach();
    if (!coach || coach.status !== "active") return NextResponse.json({ count: 0 });
    const count = await countPendingForCoach(coach.id);
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
