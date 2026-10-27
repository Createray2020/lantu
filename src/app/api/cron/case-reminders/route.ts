// 案件進度：每日提醒與逾期升級（2026/10/28）。授權同其他 cron：Bearer $CRON_SECRET。
import { timingSafeEqual } from "node:crypto";
import { runCaseReminders } from "@/lib/caseReminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const stats = await runCaseReminders();
  return Response.json({ ok: true, ...stats });
}
