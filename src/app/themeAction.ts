"use server";

// 把主題偏好存回帳號，換裝置也還在。
// 與字級那支（uiScaleAction）同理：這是「介面偏好」不是業務資料，所以刻意**不**過
// 使用期限的唯讀閘 —— 期限到期的人畫面變唯讀，但還是要能挑自己看得舒服的介面。

import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";
import { ensureCoach } from "@/lib/coach";
import { normalizeTheme } from "@/lib/theme";

export async function setThemeAction(theme: string): Promise<{ ok: boolean }> {
  const me = await ensureCoach();
  if (!me) return { ok: false };
  await db.update(coaches).set({ theme: normalizeTheme(theme) }).where(eq(coaches.id, me.id));
  return { ok: true };
}
