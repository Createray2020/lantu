"use server";

// 使用期限與客戶上限的後台動作。
//
// 職級這裡是「使用權益的級別」（決定期限與客戶上限），與 /admin/advisors 的
// 「制度職級異動」是同一個欄位 —— 2026/08/22 Ray 拍板兩者同一條線。
// 差別只在紀錄：那邊會寫 comp_rank_events（晉升有異動原因要留存），
// 這邊是開通／續約時順手把級別設對，不算晉升事件。

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches } from "@/Shared/db/schema";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { addPeriod, internEndISO, INTERN_DAYS, type LicenseUnit } from "@/lib/license";
import { recordAcctEvent } from "@/lib/acctStore";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("沒有後台權限");
  return me!;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function setLicenseAction(
  id: string,
  input: { rankCode: string | null; licenseFrom: string; unit: LicenseUnit; qty: number },
): Promise<ActionResult> {
  try {
    await guard();
    if (!ISO.test(input.licenseFrom)) return { ok: false, error: "起算日格式不正確" };

    // 實習教練固定半年：不信任前端送來的數字，這裡再夾一次。
    const intern = input.rankCode === "INTERN";
    const unit: LicenseUnit = intern ? "month" : input.unit === "year" ? "year" : "month";
    // 實習：起算日（licenseFrom，Email 所載）＋180 天，不是日曆半年（V7.2 §38之1）；qty 記天數方便看
    const qty = intern ? INTERN_DAYS : Math.min(120, Math.max(1, Math.round(input.qty || 1)));
    const until = intern ? internEndISO(input.licenseFrom) : addPeriod(input.licenseFrom, unit, qty);
    // 第一次開通才算「培訓帳號」入帳（180 天一生一次）；之後延長只是改期限，不再收。
    const [before] = await db.select({ licenseUntil: coaches.licenseUntil }).from(coaches).where(eq(coaches.id, id));
    const firstOpen = !before?.licenseUntil;

    await db
      .update(coaches)
      .set({
        rankCode: input.rankCode || null,
        licenseFrom: input.licenseFrom,
        licenseUntil: until,
        licenseUnit: unit,
        licenseQty: qty,
      })
      .where(eq(coaches.id, id));

    if (firstOpen) await recordAcctEvent("license", id, new Date(input.licenseFrom + "T00:00:00"));
    touch();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "更新失敗" };
  }
}

export async function setClientCapAction(id: string, cap: number | null): Promise<ActionResult> {
  try {
    await guard();
    const v = cap == null || !Number.isFinite(cap) ? null : Math.max(0, Math.round(cap));
    await db.update(coaches).set({ clientCapOverride: v }).where(eq(coaches.id, id));
    touch();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "更新失敗" };
  }
}

function touch() {
  revalidatePath("/admin");
  revalidatePath("/admin/advisors");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/clients");
}
