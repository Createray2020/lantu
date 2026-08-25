"use server";

import { redirect } from "next/navigation";
import { applyAsCoach, type CoachApplication } from "@/lib/coach";

// 明確申請成為教練。只有這支會建立 coaches 列（status=pending，待後台核准）。
//
// ⚠️ "use server" 檔案的每個 export 都必須是 async function（常數放 lib/）。
// ⚠️ 這支刻意不接使用期限的唯讀閘：呼叫的當下還不是教練，沒有期限可檢查
//    （guard.drift.test.ts 的 EXEMPT 就是為這件事開的）。
export async function applyAsCoachAction(input: CoachApplication) {
  const row = await applyAsCoach(input ?? {});
  if (!row) redirect("/login?redirect_url=/dashboard/apply");
  redirect("/dashboard");
}
