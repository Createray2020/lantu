"use server";

// 把字級偏好存回帳號，換裝置也還在。
// 這是「介面偏好」不是業務資料，所以刻意**不**過使用期限的唯讀閘 ——
// 期限到期的人畫面變唯讀，但還是要看得清楚字。

import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";
import { ensureCoach } from "@/lib/coach";
import { normalizeScale } from "@/lib/uiScale";

export async function setUiScaleAction(scale: number): Promise<{ ok: boolean }> {
  const me = await ensureCoach();
  if (!me) return { ok: false };
  await db.update(coaches).set({ uiScale: normalizeScale(scale) }).where(eq(coaches.id, me.id));
  return { ok: true };
}
