// 編輯版本快照：plan 每次存檔記一版、標編輯者。best-effort，不擋主流程。
import { desc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { planRevisions } from "@/Shared/db/schema";

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
