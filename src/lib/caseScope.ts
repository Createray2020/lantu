// 案件進度的「誰看得到哪些案」（提案書第五節權限矩陣，落到程式的一把尺）。
//   客戶        → 自己（/portal 走 client_user）
//   財務教練    → 自己的案（改）
//   S3          → 所屬（組織樹 upline 子樹）的案（看）；案件上指定的 s3_coach_id 也算
//   客戶關係    → 全部（看進度／回饋；接分流）
//   行政財法    → 全部，但只關心階段 4 與合約付款
//   系統管理（admin／owner）→ 全部
import type { CoachRow } from "./org";
import { downlineIds } from "./org";

export type ServiceRole = "client_relations" | "admin_finance";
export const SERVICE_ROLE_LABEL: Record<ServiceRole, string> = { client_relations: "客戶關係", admin_finance: "行政財法" };
export const SERVICE_ROLES: ServiceRole[] = ["client_relations", "admin_finance"];

export function serviceRolesOf(c: { serviceRoles?: unknown }): ServiceRole[] {
  const v = c.serviceRoles;
  return Array.isArray(v) ? SERVICE_ROLES.filter((r) => v.includes(r)) : [];
}
export function hasServiceRole(c: { serviceRoles?: unknown }, r: ServiceRole): boolean { return serviceRolesOf(c).includes(r); }
export function isS3(c: { rankCode?: string | null }): boolean { return (c.rankCode ?? "") === "S3" || (c.rankCode ?? "") === "CHIEF"; }

export type CaseScope =
  | { kind: "all"; reason: "admin" | "client_relations" | "admin_finance" }
  | { kind: "coaches"; coachIds: string[]; reason: "s3" | "own" };

/** 這位教練能看到哪些案件。all＝全部；coaches＝這些教練名下的案。 */
export function caseScopeFor(me: CoachRow, all: CoachRow[]): CaseScope {
  if (me.role === "admin" || me.orgRank === "owner") return { kind: "all", reason: "admin" };
  if (hasServiceRole(me, "client_relations")) return { kind: "all", reason: "client_relations" };
  if (hasServiceRole(me, "admin_finance")) return { kind: "all", reason: "admin_finance" };
  const down = downlineIds(me.id, all).filter((id) => id !== me.id);
  if (down.length && (isS3(me) || me.orgRank === "manager")) return { kind: "coaches", coachIds: [me.id, ...down], reason: "s3" };
  return { kind: "coaches", coachIds: [me.id], reason: "own" };
}

/** 能不能「改」這一案的進度：只有主責教練（與系統管理）。S3／客戶關係／行政財法只看。 */
export function canEditCase(me: CoachRow, c: { coachId: string }): boolean {
  return me.id === c.coachId || me.role === "admin" || me.orgRank === "owner";
}
/** 客戶關係可以處理標記（客訴／低分／轉交） */
export function canHandleFlags(me: CoachRow): boolean {
  return me.role === "admin" || me.orgRank === "owner" || hasServiceRole(me, "client_relations");
}

/** 案件的 S3：指定的優先，否則沿主責教練的推薦人往上找到第一位 S3／主管；都沒有就直接的推薦人。 */
export function s3For(c: { coachId: string; s3CoachId: string | null }, all: CoachRow[]): CoachRow | null {
  if (c.s3CoachId) return all.find((x) => x.id === c.s3CoachId) ?? null;
  const byId = new Map(all.map((x) => [x.id, x]));
  let cur = byId.get(c.coachId);
  let first: CoachRow | null = null;
  for (let i = 0; i < 12 && cur?.uplineId; i++) {
    const up = byId.get(cur.uplineId);
    if (!up) break;
    first ??= up;
    if (isS3(up) || up.orgRank === "manager" || up.orgRank === "owner") return up;
    cur = up;
  }
  return first;
}
/** 客戶關係角色的人（接分流） */
export function clientRelationsIds(all: CoachRow[]): string[] {
  return all.filter((c) => hasServiceRole(c, "client_relations")).map((c) => c.id);
}
