// 編輯版本快照：plan 每次存檔記一版、標編輯者。best-effort，不擋主流程。
//
// 雙軌：同一位客戶底下有兩條並行的 plan 軌（track='coach' 教練年度版 / track='client' 人生護照），
// 兩軌的版本合併成一條時間軸呈現，最新的在最上面，每一版都可以回復。
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { planRevisions, plans } from "@/Shared/db/schema";
import { planSnapshot } from "./snapshot";

export async function logRevision(
  planId: string,
  editorType: "coach" | "client",
  editorId: string | null,
  editorName: string | null,
  data: unknown,
): Promise<void> {
  try {
    await db.insert(planRevisions).values({ planId, editorType, editorId, editorName, data: data as object });
  } catch (e) {
    console.error("[logRevision]", e);
  }
}

export type RevisionRow = { id: string; editorType: string; editorName: string | null; createdAt: Date };

export async function listRevisions(planId: string, limit = 60): Promise<RevisionRow[]> {
  return db
    .select({ id: planRevisions.id, editorType: planRevisions.editorType, editorName: planRevisions.editorName, createdAt: planRevisions.createdAt })
    .from(planRevisions)
    .where(eq(planRevisions.planId, planId))
    .orderBy(desc(planRevisions.createdAt))
    .limit(limit);
}

// ---------- 雙軌合併時間軸 ----------

export type TimelineRow = {
  id: string;
  planId: string;
  track: string;           // coach / client
  planLabel: string | null;
  planYear: number;
  editorType: string;      // coach / client
  editorName: string | null;
  createdAt: Date;
};

// 一位客戶名下「所有 plan（兩軌）」的版本，依時間新→舊合併。
// 刻意不撈 data：這張表是全庫成長最快的一張，列表只需要 metadata；
// 要看內容才走 getRevision(id)。
export async function listClientTimeline(clientId: string, limit = 120): Promise<TimelineRow[]> {
  return db
    .select({
      id: planRevisions.id,
      planId: planRevisions.planId,
      track: plans.track,
      planLabel: plans.label,
      planYear: plans.year,
      editorType: planRevisions.editorType,
      editorName: planRevisions.editorName,
      createdAt: planRevisions.createdAt,
    })
    .from(planRevisions)
    .innerJoin(plans, eq(planRevisions.planId, plans.id))
    .where(eq(plans.clientId, clientId))
    .orderBy(desc(planRevisions.createdAt))
    .limit(limit);
}

export type RevisionDetail = {
  id: string;
  planId: string;
  clientId: string;
  track: string;
  editorType: string;
  editorName: string | null;
  createdAt: Date;
  data: unknown;
};

// 取單一版本的完整內容（含 data）。附帶回 plan 的 clientId／track 供呼叫端做權限判斷。
export async function getRevision(revisionId: string): Promise<RevisionDetail | null> {
  const rows = await db
    .select({
      id: planRevisions.id,
      planId: planRevisions.planId,
      clientId: plans.clientId,
      track: plans.track,
      editorType: planRevisions.editorType,
      editorName: planRevisions.editorName,
      createdAt: planRevisions.createdAt,
      data: planRevisions.data,
    })
    .from(planRevisions)
    .innerJoin(plans, eq(planRevisions.planId, plans.id))
    .where(eq(planRevisions.id, revisionId))
    .limit(1);
  return rows[0] ?? null;
}

export type RestoreOutcome = { ok: true; planId: string } | { ok: false; error: string };

// 把某一版還原成當前版本。
//
// 兩個刻意的設計：
// 1. 還原本身也記一筆新 revision——否則被還原掉的那幾版會變成「看得到但回不去」的孤兒，
//    使用者按一次回復就永久失去中間的編輯。時間軸必須是只增不減的。
// 2. planId 必須與 revision 實際所屬的 plan 相符，且呼叫端要先驗過這個 plan 屬於誰。
//    少了這道檢查，帶一個別人的 revisionId 進來就能把任意內容寫進自己的 plan。
export async function restoreRevision(
  planId: string,
  revisionId: string,
  editor: { type: "coach" | "client"; id: string | null; name: string | null },
): Promise<RestoreOutcome> {
  const rev = await getRevision(revisionId);
  if (!rev) return { ok: false, error: "找不到這個版本" };
  if (rev.planId !== planId) return { ok: false, error: "版本不屬於這份規劃" };

  const snap = planSnapshot(rev.data);
  await db
    .update(plans)
    .set({ data: rev.data as object, healthGrade: snap.healthGrade, netWorth: snap.netWorth, updatedAt: new Date() })
    .where(eq(plans.id, planId));
  await logRevision(planId, editor.type, editor.id, editor.name, rev.data);
  return { ok: true, planId };
}

// 這份 plan 是不是這位客戶自己那一軌（客戶只能回復自己的護照版，不能動教練的年度版）。
export async function isClientTrack(planId: string, clientId: string): Promise<boolean> {
  const rows = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.clientId, clientId), eq(plans.track, "client")))
    .limit(1);
  return !!rows[0];
}
