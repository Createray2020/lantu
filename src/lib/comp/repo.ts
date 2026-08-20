// 業務制度：資料層（版本／職級／門檻／參數的讀寫）。
// 引擎不碰 DB，這裡負責把 DB 的列組成引擎吃的 CompParams。

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { compModules, compRanks, compThresholds, compVersions } from "@/Shared/db/schema";
import type { CompParams, CompSettings, ModuleRow, RankRow, ThresholdKind, ThresholdRow } from "./types";

export type VersionRow = typeof compVersions.$inferSelect;

export async function listVersions(): Promise<VersionRow[]> {
  return db.select().from(compVersions).orderBy(asc(compVersions.createdAt));
}

export async function getVersion(id: string): Promise<VersionRow | null> {
  const r = await db.select().from(compVersions).where(eq(compVersions.id, id)).limit(1);
  return r[0] ?? null;
}

/**
 * 取得目前生效中的版本；一套都還沒有時自動開一個空白版本。
 * 空白版本＝所有數字皆未設定，後台可按「載入 V4 辦法數值」一次帶入。
 */
export async function ensureActiveVersion(): Promise<VersionRow> {
  const active = await db
    .select().from(compVersions).where(eq(compVersions.status, "active")).limit(1);
  if (active[0]) return active[0];

  const any = await db.select().from(compVersions).limit(1);
  if (any[0]) {
    const r = await db.update(compVersions)
      .set({ status: "active" }).where(eq(compVersions.id, any[0].id)).returning();
    return r[0];
  }
  const created = await db.insert(compVersions).values({
    version: "未命名版本",
    status: "active",
    settings: {},
    changeNote: "系統初始版本：所有數字皆未設定，可按「載入 V4 辦法數值」帶入。",
  }).returning();
  return created[0];
}

export async function loadParams(versionId: string): Promise<CompParams> {
  const [v, ranks, ths, mods] = await Promise.all([
    getVersion(versionId),
    db.select().from(compRanks).where(eq(compRanks.versionId, versionId)).orderBy(asc(compRanks.seq)),
    db.select().from(compThresholds).where(eq(compThresholds.versionId, versionId))
      .orderBy(asc(compThresholds.kind), asc(compThresholds.seq)),
    db.select().from(compModules).where(eq(compModules.versionId, versionId)).orderBy(asc(compModules.seq)),
  ]);
  return {
    versionId,
    version: v?.version,
    settings: (v?.settings ?? {}) as CompSettings,
    ranks: ranks.map((r) => ({
      code: r.code, seq: r.seq, moduleCode: r.moduleCode, groupName: r.groupName,
      tierLabel: r.tierLabel, promoPct: r.promoPct, execPct: r.execPct,
    })),
    modules: mods.map((m) => ({
      code: m.code, seq: m.seq, name: m.name,
      splitMode: (m.splitMode === "flat" ? "flat" : "chain") as "chain" | "flat",
      splitPromoPct: m.splitPromoPct, splitExecPct: m.splitExecPct,
      flatExecPct: m.flatExecPct, flatPromoPct: m.flatPromoPct,
      price: m.price, countPromotion: m.countPromotion, countMaintenance: m.countMaintenance,
      enabled: m.enabled, note: m.note,
    })),
    thresholds: ths.map((t) => ({
      kind: t.kind as ThresholdKind, seq: t.seq, fromCode: t.fromCode, toCode: t.toCode,
      cases: t.cases, fees: t.fees, teamCases: t.teamCases,
      mentorCount: t.mentorCount, mentorRankCode: t.mentorRankCode,
      extraNote: t.extraNote, enabled: t.enabled,
    })),
  };
}

/** 只有 draft 與 active 可編輯；archived 是歷史，改了會讓舊案分潤對不上帳。 */
export async function assertEditable(versionId: string): Promise<VersionRow> {
  const v = await getVersion(versionId);
  if (!v) throw new Error("version-not-found");
  if (v.status === "archived") throw new Error("version-archived");
  return v;
}

export async function saveSettings(versionId: string, settings: CompSettings) {
  await assertEditable(versionId);
  // 整包覆寫：undefined 的 key 在 JSON 序列化時會消失，「留空＝未設定」因此自然成立。
  await db.update(compVersions).set({ settings }).where(eq(compVersions.id, versionId));
}

export async function saveVersionMeta(
  versionId: string,
  meta: { version?: string; effectiveFrom?: string | null; changeNote?: string | null },
) {
  await assertEditable(versionId);
  await db.update(compVersions).set(meta).where(eq(compVersions.id, versionId));
}

/**
 * 整批覆寫某一組職級表（先刪後寫）。職級是引擎的查表基準，半套更新會出現孤兒 code。
 * moduleCode 為空字串＝預設表；帶模塊代號＝該模塊的自訂表。
 * 只刪同一個 moduleCode 的列，別的模塊互不影響。
 */
export async function saveRanks(versionId: string, rows: RankRow[], moduleCode = "") {
  await assertEditable(versionId);
  await db.delete(compRanks)
    .where(and(eq(compRanks.versionId, versionId), eq(compRanks.moduleCode, moduleCode)));
  if (!rows.length) return;
  await db.insert(compRanks).values(
    rows.map((r, i) => ({
      versionId, seq: r.seq ?? i + 1, code: r.code, moduleCode,
      groupName: r.groupName ?? null, tierLabel: r.tierLabel ?? null,
      promoPct: r.promoPct ?? null, execPct: r.execPct ?? null,
    })),
  );
}

/** 整批覆寫服務模塊。模塊代號被案件與職級表參照，改代號等於換一個模塊。 */
export async function saveModules(versionId: string, rows: ModuleRow[]) {
  await assertEditable(versionId);
  await db.delete(compModules).where(eq(compModules.versionId, versionId));
  if (!rows.length) return;
  await db.insert(compModules).values(
    rows.map((m, i) => ({
      versionId, seq: m.seq ?? i + 1, code: m.code, name: m.name,
      splitMode: m.splitMode ?? "chain",
      splitPromoPct: m.splitPromoPct ?? null, splitExecPct: m.splitExecPct ?? null,
      flatExecPct: m.flatExecPct ?? null, flatPromoPct: m.flatPromoPct ?? null,
      price: m.price ?? null,
      countPromotion: m.countPromotion !== false,
      countMaintenance: m.countMaintenance !== false,
      enabled: m.enabled !== false,
      note: m.note ?? null,
    })),
  );
}

/** 整批覆寫某一種門檻（A 軌／B 軌／真除各自獨立，互不影響）。 */
export async function saveThresholds(versionId: string, kind: ThresholdKind, rows: ThresholdRow[]) {
  await assertEditable(versionId);
  await db.delete(compThresholds)
    .where(and(eq(compThresholds.versionId, versionId), eq(compThresholds.kind, kind)));
  if (!rows.length) return;
  await db.insert(compThresholds).values(
    rows.map((t, i) => ({
      versionId, kind, seq: t.seq ?? i + 1,
      fromCode: t.fromCode ?? null, toCode: t.toCode,
      cases: t.cases ?? null, fees: t.fees ?? null, teamCases: t.teamCases ?? null,
      mentorCount: t.mentorCount ?? null, mentorRankCode: t.mentorRankCode ?? null,
      extraNote: t.extraNote ?? null, enabled: t.enabled ?? true,
    })),
  );
}

/** 建立新版本；copyFromId 有值時整份複製（職級與門檻一起），供「複製為新版」用。 */
export async function createVersion(input: {
  version: string; effectiveFrom?: string | null; changeNote?: string | null; copyFromId?: string | null;
}): Promise<VersionRow> {
  let settings: CompSettings = {};
  let ranks: RankRow[] = [];
  let ths: ThresholdRow[] = [];
  let mods: ModuleRow[] = [];
  if (input.copyFromId) {
    const src = await loadParams(input.copyFromId);
    settings = src.settings; ranks = src.ranks; ths = src.thresholds; mods = src.modules ?? [];
  }
  const created = await db.insert(compVersions).values({
    version: input.version,
    effectiveFrom: input.effectiveFrom || null,
    changeNote: input.changeNote || null,
    status: "draft",
    settings,
  }).returning();
  const v = created[0];
  if (mods.length) await saveModules(v.id, mods);
  // 職級表可能有多組（預設表＋各模塊自訂表），逐組複製。
  for (const mc of [...new Set(ranks.map((r) => r.moduleCode ?? ""))]) {
    await saveRanks(v.id, ranks.filter((r) => (r.moduleCode ?? "") === mc), mc);
  }
  for (const kind of ["promotion_a", "promotion_b", "tenure"] as ThresholdKind[]) {
    const rows = ths.filter((t) => t.kind === kind);
    if (rows.length) await saveThresholds(v.id, kind, rows);
  }
  return v;
}

/** 發布為生效版：舊的 active 轉 archived（其分潤已凍結，不再可編輯）。 */
export async function publishVersion(versionId: string) {
  const v = await getVersion(versionId);
  if (!v) throw new Error("version-not-found");
  await db.update(compVersions).set({ status: "archived" }).where(eq(compVersions.status, "active"));
  await db.update(compVersions)
    .set({ status: "active", publishedAt: new Date() })
    .where(eq(compVersions.id, versionId));
}
