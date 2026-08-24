// 組織樹與可見範圍（岔路 #2 的權限骨架）。
// orgRank：member（教練，只看自己）/ manager（主管，看下線子樹）/ owner（核心成員，看全組織）。
// uplineId：組織樹父節點（自參照）。可見範圍一律以「active 教練」為母體。
import { eq, asc } from "drizzle-orm";
import { db } from "@/Shared/db";
import { displayNameOf } from "./coachName";
import { coaches } from "@/Shared/db/schema";

export type OrgRank = "member" | "manager" | "owner";
export type CoachRow = typeof coaches.$inferSelect;

export function rankOf(c: { orgRank?: string | null }): OrgRank {
  const r = c.orgRank;
  return r === "owner" || r === "manager" ? r : "member";
}

// 全部 active 教練（組織小，一次撈進記憶體在 JS 內算樹）。
// ⚠️ 姓名一律換成顯示名再交出去：組織樹、團隊選單、分潤鏈都吃這一支，
//    留著 Clerk 原名會讓教練改了名字之後這幾處還是舊的。
export async function listActiveCoaches(): Promise<CoachRow[]> {
  const rows = await db.select().from(coaches).where(eq(coaches.status, "active")).orderBy(asc(coaches.createdAt));
  return rows.map((r) => ({ ...r, name: displayNameOf(r) }));
}

// 由完整名單建「上線 → 直屬下線」對照。
function childrenMap(all: CoachRow[]): Map<string | null, CoachRow[]> {
  const m = new Map<string | null, CoachRow[]>();
  for (const c of all) {
    const key = c.uplineId ?? null;
    const arr = m.get(key) ?? [];
    arr.push(c);
    m.set(key, arr);
  }
  return m;
}

// 某教練的下線子樹（含自己）。
export function downlineIds(rootId: string, all: CoachRow[]): string[] {
  const kids = childrenMap(all);
  const out: string[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of kids.get(id) ?? []) stack.push(child.id);
  }
  return out;
}

// 依角色回傳「可見的教練 id」集合。
// - owner：全部 active。
// - manager：自己 + 下線子樹。
// - member：只有自己。
export function visibleCoachIds(me: CoachRow, all: CoachRow[]): string[] {
  const rank = rankOf(me);
  if (rank === "owner") return all.map((c) => c.id);
  if (rank === "manager") return downlineIds(me.id, all);
  return [me.id];
}

// 團隊分組：以「owner 的直屬下線」為各團隊隊長（manager），各自帶下線子樹。
// 回傳 [{ manager, memberIds }]，供核心成員視角做各團隊對比。
export type Team = { manager: CoachRow; memberIds: string[] };
export function teamsUnder(ownerId: string, all: CoachRow[]): Team[] {
  const kids = childrenMap(all);
  const leaders = kids.get(ownerId) ?? [];
  return leaders.map((mgr) => ({
    manager: mgr,
    // 團隊成員 = 隊長子樹去掉隊長自己（呈現「下線」）。
    memberIds: downlineIds(mgr.id, all).filter((id) => id !== mgr.id),
  }));
}

// 便利：一次把「我、可見 id、全名單」都算好。
export async function orgContext(me: CoachRow) {
  const all = await listActiveCoaches();
  return { me, all, visibleIds: visibleCoachIds(me, all), rank: rankOf(me) };
}
