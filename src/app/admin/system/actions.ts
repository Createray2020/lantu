"use server";

import { revalidatePath } from "next/cache";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  createVersion, loadParams, publishVersion, saveRanks, saveSettings,
  saveThresholds, saveVersionMeta,
} from "@/lib/comp/repo";
import { mergePreset } from "@/lib/comp/preset";
import type { CompSettings, RankRow, ThresholdKind, ThresholdRow } from "@/lib/comp/types";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const MSG: Record<string, string> = {
  forbidden: "沒有後台權限",
  "version-not-found": "找不到該制度版本",
  "version-archived": "已封存的版本不可編輯（它是舊案分潤的依據）",
  "split-not-100": "推廣端＋執案端不得超過 100%",
  "dup-rank-code": "職級代號重複",
  "empty-rank-code": "職級代號不可空白",
};

function fail(e: unknown): { ok: false; error: string } {
  const raw = e instanceof Error ? e.message : String(e);
  return { ok: false, error: MSG[raw] ?? raw };
}

async function guard() {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
  return me!;
}

function touch() {
  revalidatePath("/admin/system");
  revalidatePath("/admin/system/simulator");
}

export async function saveSettingsAction(
  versionId: string,
  settings: CompSettings,
): Promise<ActionResult> {
  try {
    await guard();
    // 分潤架構的硬檢核：兩端相加超過 100 會讓公司營運變負數，直接擋在存檔前。
    const p = settings.splitPromoPct ?? 0;
    const e = settings.splitExecPct ?? 0;
    if (p + e > 100) throw new Error("split-not-100");
    await saveSettings(versionId, settings);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveRanksAction(versionId: string, rows: RankRow[]): Promise<ActionResult> {
  try {
    await guard();
    const codes = rows.map((r) => (r.code || "").trim());
    if (codes.some((c) => !c)) throw new Error("empty-rank-code");
    if (new Set(codes).size !== codes.length) throw new Error("dup-rank-code");
    await saveRanks(
      versionId,
      rows.map((r, i) => ({ ...r, code: codes[i], seq: i + 1 })),
    );
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveThresholdsAction(
  versionId: string,
  kind: ThresholdKind,
  rows: ThresholdRow[],
): Promise<ActionResult> {
  try {
    await guard();
    await saveThresholds(versionId, kind, rows.filter((r) => (r.toCode || "").trim()));
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 載入 V4 辦法數值：只填空白欄位，已填的不覆蓋；職級／門檻僅在完全沒資料時整批帶入。 */
export async function loadV4Action(versionId: string): Promise<ActionResult> {
  try {
    await guard();
    const merged = mergePreset(await loadParams(versionId));
    await saveSettings(versionId, merged.settings);
    if (merged.ranks.length) await saveRanks(versionId, merged.ranks);
    for (const kind of ["promotion_a", "promotion_b", "tenure"] as ThresholdKind[]) {
      const rows = merged.thresholds.filter((t) => t.kind === kind);
      if (rows.length) await saveThresholds(versionId, kind, rows);
    }
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** 全部清空：回到「所有數字皆未設定」的初始狀態。 */
export async function clearAllAction(versionId: string): Promise<ActionResult> {
  try {
    await guard();
    await saveSettings(versionId, {});
    await saveRanks(versionId, []);
    for (const kind of ["promotion_a", "promotion_b", "tenure"] as ThresholdKind[]) {
      await saveThresholds(versionId, kind, []);
    }
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveVersionMetaAction(
  versionId: string,
  meta: { version?: string; effectiveFrom?: string | null; changeNote?: string | null },
): Promise<ActionResult> {
  try {
    await guard();
    await saveVersionMeta(versionId, meta);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createVersionAction(input: {
  version: string; effectiveFrom?: string | null; changeNote?: string | null; copyFromId?: string | null;
}): Promise<ActionResult<string>> {
  try {
    await guard();
    const v = await createVersion(input);
    touch();
    return { ok: true, data: v.id };
  } catch (e) {
    return fail(e);
  }
}

export async function publishVersionAction(versionId: string): Promise<ActionResult> {
  try {
    await guard();
    await publishVersion(versionId);
    touch();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
