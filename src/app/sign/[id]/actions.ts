"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { consentAndSign, declineSign, getInstance, saveSignature, deleteSignature, remindInstance, reopenInstance } from "@/lib/docsStore";
import { currentSignIdentity } from "@/lib/docsIdentity";
import { onDocCompleted } from "@/lib/docsHooks";
import type { DocCaseType } from "@/lib/docs";

export type SignActionResult = { ok: true; completed: boolean } | { ok: false; error: string };

async function clientMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const ua = h.get("user-agent");
  return { ip, ua };
}

const PATHS = ["/dashboard", "/dashboard/docs", "/portal", "/portal/docs", "/admin", "/admin/docs/instances"];

/** 本人確認簽署：勾同意＋簽名圖＋當時看到的雜湊。全員簽完 → 觸發業務後續（例如培訓開通）。 */
export async function signAction(instanceId: string, input: { consent: boolean; signatureImg: string; hashSeen: string; saveAsDefault: boolean }): Promise<SignActionResult> {
  const me = await currentSignIdentity();
  if (!me) return { ok: false, error: "請先登入" };
  const { ip, ua } = await clientMeta();
  const r = await consentAndSign({ instanceId, me, consent: !!input.consent, signatureImg: input.signatureImg, hashSeen: String(input.hashSeen ?? ""), saveAsDefault: !!input.saveAsDefault, ip, ua });
  if (!r.ok) return r;
  if (r.completed) {
    // 後續失敗不該讓「已簽完」變成「沒簽」：簽署已入庫，這裡吞錯、留給後台重跑（冪等）。
    try {
      await onDocCompleted(r.instance.caseType as DocCaseType, r.instance.caseId);
    } catch (e) {
      console.error("[docs] onDocCompleted failed", e);
    }
  }
  PATHS.forEach((p) => revalidatePath(p));
  revalidatePath(`/sign/${instanceId}`);
  return { ok: true, completed: r.completed };
}

export async function declineAction(instanceId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const me = await currentSignIdentity();
  if (!me) return { ok: false, error: "請先登入" };
  const r = await declineSign(instanceId, me, reason ?? "");
  if (r.ok) {
    PATHS.forEach((p) => revalidatePath(p));
    revalidatePath(`/sign/${instanceId}`);
  }
  return r;
}

/** 預存／移除我的簽名檔（跟任何一份文件無關）。 */
export async function saveMySignatureAction(img: string | null): Promise<{ ok: boolean; error?: string }> {
  const me = await currentSignIdentity();
  if (!me) return { ok: false, error: "請先登入" };
  const owner = me.coachId ? { kind: "coach" as const, id: me.coachId } : me.clientUserId ? { kind: "client_user" as const, id: me.clientUserId } : null;
  if (!owner) return { ok: false, error: "找不到身分" };
  try {
    if (img) await saveSignature(owner, img);
    else await deleteSignature(owner);
    PATHS.forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch {
    return { ok: false, error: "簽名圖不正確（只接受 PNG）" };
  }
}

/** 簽署頁輪詢用：拿最新狀態（別人簽了沒）。 */
export async function instanceStatusAction(instanceId: string): Promise<{ status: string; signed: number; total: number } | null> {
  const inst = await getInstance(instanceId);
  if (!inst) return null;
  return { status: inst.status, signed: inst.signers.filter((s) => s.status === "signed").length, total: inst.signers.length };
}

/** 催簽（站內提醒輪到的那一位）。 */
export async function remindAction(instanceId: string): Promise<{ ok: boolean; error?: string; reminded?: string[] }> {
  const me = await currentSignIdentity();
  if (!me) return { ok: false, error: "請先登入" };
  const r = await remindInstance(instanceId, me);
  if (r.ok) PATHS.forEach((p) => revalidatePath(p));
  return r;
}

/** 重新開放（延長期限）。 */
export async function reopenAction(instanceId: string, days: number): Promise<{ ok: boolean; error?: string; expiresAt?: string }> {
  const me = await currentSignIdentity();
  if (!me) return { ok: false, error: "請先登入" };
  const r = await reopenInstance(instanceId, days, me);
  if (r.ok) {
    PATHS.forEach((p) => revalidatePath(p));
    revalidatePath(`/sign/${instanceId}`);
  }
  return r;
}
