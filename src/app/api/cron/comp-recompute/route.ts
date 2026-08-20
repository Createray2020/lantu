// 業務制度：每日自動重算（晉升／真除轉正／維持資格）。
//
// 由 Vercel Cron 呼叫（見 vercel.json）。跑的邏輯與後台「重算全體」是同一支。
//
// 為什麼是每天而不是每月：晉升於次月 1 日生效、真除期滿日因人而異、
// 維持資格要能即時反映補件——每天跑一次成本極低，卻讓所有時點都不會漏。
// Vercel Hobby 方案的 cron 上限也剛好是每天一次。
//
// 授權：Vercel Cron 會帶 `Authorization: Bearer $CRON_SECRET`。
// 沒設 CRON_SECRET 時一律拒絕 —— 這支會改職級與寫資料，不能裸奔。

import { and, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";
import { recomputeAll, summarize } from "@/lib/comp/recompute";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 異動紀錄要有操作者。排程沒有登入者，就掛在組織 owner 名下並在 note 標明是系統執行。
  const owner = (await db.select({ id: coaches.id }).from(coaches)
    .where(and(eq(coaches.orgRank, "owner"), eq(coaches.status, "active")))
    .limit(1))[0];
  if (!owner) {
    return Response.json({ ok: false, error: "no-owner" }, { status: 200 });
  }

  const year = new Date().getUTCFullYear();
  try {
    const r = await recomputeAll(owner.id, year);
    return Response.json(
      { ok: true, year, summary: summarize(r), ...r },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
