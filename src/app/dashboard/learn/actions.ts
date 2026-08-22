"use server";

// 學習進度：標記／取消標記單元完成。
//
// 這裡刻意**不**過使用期限的唯讀閘：學習是恢復資格的路，期限到期的人正好是最需要
// 把課補完的人，把他關在門外等於斷了那條路。requireCoach() 只驗身分與帳號狀態。
// 這個例外登記在 lib/guard.drift.test.ts 的 EXEMPT 清單裡。

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/guard";
import { markLesson } from "@/lib/learn";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function markLessonAction(
  courseId: string,
  lessonId: string,
  done: boolean,
): Promise<ActionResult> {
  try {
    const me = await requireCoach();
    await markLesson(me.id, lessonId, done);
    revalidatePath("/dashboard/learn");
    revalidatePath(`/dashboard/learn/${courseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "更新失敗" };
  }
}
