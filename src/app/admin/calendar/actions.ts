"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { createEvent, updateEvent, deleteEvent, type EventInput } from "@/lib/orgEvents";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  bad_date: "日期格式不正確",
  no_title: "請填標題",
  read_only: "教育訓練場次要回「訓練時數」改",
};
function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? "存檔失敗，請稍後再試" };
}

function touch() {
  revalidatePath("/admin/calendar");
  revalidatePath("/dashboard/calendar");
  // 首頁的「近期行程」吃的是同一批資料，不一起 revalidate 會出現
  // 「行事曆改好了、首頁還是舊的」這種對不起來的狀況。
  revalidatePath("/dashboard");
}

// ⚠️ 2026/09/14 Ray 拍板：**只有核心成員能建立事件**（isAdmin ＝ role=admin 或 orgRank=owner）。
//    不是省事——公司行事曆是組織對全員的單向廣播，寫入者一多就會出現重複的月會、
//    有人改了時間沒人知道，還要回答「誰能編別人建的事件」。單一出口讓這些問題全部不存在。
//    要開放給主管，是另一個決定，不要在這裡偷偷放寬。
//
// ⚠️ 這幾支刻意不走 requireWritableCoach()：使用期限是個人的事，
//    不該連帶決定公司行事曆能不能排（與 /admin/modules 同一條理由）。
async function gate(): Promise<string> {
  const me = await ensureCoach();
  if (!me || !(await isAdmin(me))) throw new Error("forbidden");
  return me.id;
}

export async function createEventAction(input: EventInput): Promise<ActionResult> {
  try {
    const by = await gate();
    await createEvent(input, by);
    touch();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updateEventAction(id: string, input: EventInput): Promise<ActionResult> {
  try {
    await gate();
    await updateEvent(id, input);
    touch();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteEventAction(id: string): Promise<ActionResult> {
  try {
    await gate();
    await deleteEvent(id);
    touch();
    return { ok: true };
  } catch (e) { return fail(e); }
}
