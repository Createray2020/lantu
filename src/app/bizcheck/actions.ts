"use server";

import { revalidatePath } from "next/cache";
import { ensureClientUser } from "@/lib/clientUser";
import { saveBizCheck } from "@/lib/clientPlan";

export type BizCheckResult = { ok: true } | { ok: false; error: string; needPassport?: boolean };

const MSG: Record<string, string> = {
  "not-signed-in": "請先登入",
  "no-passport": "你還沒有規劃可以存——先花三分鐘做一次人生護照，之後這份檢核就會存進同一份規劃裡。",
  "empty-answers": "請至少回答一題",
};

export async function saveBizCheckAction(ans: Record<number, string>): Promise<BizCheckResult> {
  try {
    const user = await ensureClientUser();
    if (!user) throw new Error("not-signed-in");
    await saveBizCheck(user.id, ans);
    revalidatePath("/portal");
    return { ok: true };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { ok: false, error: MSG[raw] ?? raw, needPassport: raw === "no-passport" };
  }
}
