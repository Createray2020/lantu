"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { licenseState, LICENSE_LOCKED_MESSAGE } from "@/lib/license";
import { saveProfile, setPublished, type ProfileInput } from "@/lib/coachProfile";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MSG: Record<string, string> = {
  "not-coach": "請先以教練身分登入",
  "not-active": "帳號尚未開通，無法建立公開檔案",
  forbidden: "沒有後台權限",
  "photo-too-large": "照片太大（壓縮後仍超過 300KB）",
  "bad-photo": "照片格式不正確",
  "bio-too-long": "自我介紹太長（上限 1000 字）",
};

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}

function touch(coachId: string) {
  revalidatePath("/dashboard/profile");
  revalidatePath("/coaches");
  revalidatePath(`/coaches/${coachId}`);
  revalidatePath("/portal/setup");
  revalidatePath("/admin");
}

/**
 * 照片一律走 dataURL 存 DB（沿用品牌 Logo 那套，專案沒有物件儲存）。
 * 300KB 是刻意壓低的上限：25 位教練約 7MB，Neon 免費額度 0.5GB 撐得住，
 * 而且這些 base64 會跟著每次列表查詢一起送出去，太大會拖垮公開頁。
 */
function validPhoto(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(s)) throw new Error("bad-photo");
  if (s.length > 300_000) throw new Error("photo-too-large");
  return s;
}

function clean(list: string[] | undefined, max = 20): string[] {
  return [...new Set((list ?? []).map((x) => (x ?? "").trim()).filter(Boolean))].slice(0, max);
}

/** 教練儲存自己的公開檔案。只能改自己的——這裡沒有 coachId 參數就是這個意思。 */
export async function saveMyProfileAction(input: ProfileInput): Promise<ActionResult> {
  try {
    const me = await ensureCoach();
    if (!me) throw new Error("not-coach");
    if (me.status !== "active") throw new Error("not-active");
    if (licenseState(me).expired) throw new Error(LICENSE_LOCKED_MESSAGE);
    if ((input.bio ?? "").length > 1000) throw new Error("bio-too-long");

    await saveProfile(me.id, {
      headline: (input.headline ?? "").slice(0, 60),
      bio: input.bio ?? null,
      specialties: clean(input.specialties),
      photoUrl: validPhoto(input.photoUrl),
      yearsExp: typeof input.yearsExp === "number" && input.yearsExp >= 0
        ? Math.min(80, Math.round(input.yearsExp))
        : null,
      prevRole: (input.prevRole ?? "").slice(0, 60) || null,
      credentials: clean(input.credentials, 12),
      serviceModes: clean(input.serviceModes, 4),
      areas: clean(input.areas, 10),
      // 教練自己的隱藏開關。這裡收得下、published 收不下——後者是管理員的權力，
      // 走 setPublishedAction，教練存檔不該把自己重新上架。
      selfHidden: !!input.selfHidden,
    });
    touch(me.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 管理員下架／上架某位教練的公開檔案。 */
export async function setPublishedAction(
  coachId: string,
  published: boolean,
): Promise<ActionResult> {
  try {
    const me = await ensureCoach();
    if (!(await isAdmin(me))) throw new Error("forbidden");
    await setPublished(coachId, published);
    touch(coachId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
