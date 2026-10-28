// 案件進度的「誰看得到哪些案」（提案書第五節權限矩陣，落到程式的一把尺）。
//   客戶        → 自己（/portal 走 client_user）
//   財務教練    → 自己的案（改）
//   S3          → 所屬（組織樹 upline 子樹）的案（看）；案件上指定的 s3_coach_id 也算
//   客戶關係    → 全部（看進度／回饋；接分流）
//   行政財法    → 全部，但只關心階段 4 與合約付款
//   系統管理（admin／owner）→ 全部
import type { CoachRow } from "./org";
import { downlineIds } from "./org";

// 可調的幾個開關（後台「客戶服務 › 權限」，site_settings key case_permissions）。矩陣本體不開放整張編；只開這五個判斷。
export type CasePerms = {
  adminEdit: boolean;        // 管理員（核心成員）可直接改任何案件的進度
  s3Edit: boolean;           // S3 可改所屬教練的案件
  relationsEdit: boolean;    // 客戶關係可改案件狀態（暫停／結案／等待客戶），不只標記
  financeScope: "all" | "commission"; // 行政財法看全部案件，或只看階段「正式委託」的案件
  collabView: boolean;       // 共同執案（協作教練）看得到服務進度
};
export const DEFAULT_PERMS: CasePerms = { adminEdit: true, s3Edit: false, relationsEdit: false, financeScope: "all", collabView: true };
export function sanitizePerms(v: unknown): CasePerms {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const b = (k: keyof CasePerms) => (typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_PERMS[k] as boolean);
  return { adminEdit: b("adminEdit"), s3Edit: b("s3Edit"), relationsEdit: b("relationsEdit"), financeScope: o.financeScope === "commission" ? "commission" : "all", collabView: b("collabView") };
}

export type ServiceRole = "client_relations" | "admin_finance";
export const SERVICE_ROLE_LABEL: Record<ServiceRole, string> = { client_relations: "客戶關係", admin_finance: "行政財法" };
export const SERVICE_ROLES: ServiceRole[] = ["client_relations", "admin_finance"];

export function serviceRolesOf(c: { serviceRoles?: unknown }): ServiceRole[] {
  const v = c.serviceRoles;
  return Array.isArray(v) ? SERVICE_ROLES.filter((r) => v.includes(r)) : [];
}
export function hasServiceRole(c: { serviceRoles?: unknown }, r: ServiceRole): boolean { return serviceRolesOf(c).includes(r); }
export function isS3(c: { rankCode?: string | null }): boolean { return (c.rankCode ?? "") === "S3" || (c.rankCode ?? "") === "CHIEF"; }
export function isAdminLike(c: { role?: string; orgRank?: string }): boolean { return c.role === "admin" || c.orgRank === "owner"; }

export type CaseScope =
  | { kind: "all"; reason: "admin" | "client_relations" | "admin_finance"; stageOnly?: "commission" }
  | { kind: "coaches"; coachIds: string[]; reason: "s3" | "own" };

/** 這位教練能看到哪些案件。all＝全部；coaches＝這些教練名下的案。管理員永遠全部看得到（Ray 2026/10/28）。 */
export function caseScopeFor(me: CoachRow, all: CoachRow[], perms: CasePerms = DEFAULT_PERMS): CaseScope {
  if (isAdminLike(me)) return { kind: "all", reason: "admin" };
  if (hasServiceRole(me, "client_relations")) return { kind: "all", reason: "client_relations" };
  if (hasServiceRole(me, "admin_finance")) return { kind: "all", reason: "admin_finance", stageOnly: perms.financeScope === "commission" ? "commission" : undefined };
  const down = downlineIds(me.id, all).filter((id) => id !== me.id);
  if (down.length && (isS3(me) || me.orgRank === "manager")) return { kind: "coaches", coachIds: [me.id, ...down], reason: "s3" };
  return { kind: "coaches", coachIds: [me.id], reason: "own" };
}

/** 能不能「改」這一案的進度：主責教練一定可以；管理員、S3（所屬）、客戶關係依開關。 */
export function canEditCase(me: CoachRow, c: { coachId: string; s3CoachId?: string | null }, perms: CasePerms = DEFAULT_PERMS, all: CoachRow[] = []): boolean {
  if (me.id === c.coachId) return true;
  if (isAdminLike(me)) return perms.adminEdit;
  if (perms.s3Edit && (c.s3CoachId === me.id || (all.length > 0 && downlineIds(me.id, all).includes(c.coachId) && (isS3(me) || me.orgRank === "manager")))) return true;
  if (perms.relationsEdit && hasServiceRole(me, "client_relations")) return true;
  return false;
}
/** 客戶關係（與管理員）可以處理標記（客訴／低分／轉交） */
export function canHandleFlags(me: CoachRow): boolean {
  return isAdminLike(me) || hasServiceRole(me, "client_relations");
}

/** 權限矩陣（照現況程式與開關產生，給後台頁面顯示；不是另外手寫一份） */
export type MatrixCell = "edit" | "view" | "none";
export function permissionMatrix(perms: CasePerms): { row: string; cells: Record<"client" | "coach" | "s3" | "relations" | "finance" | "admin", MatrixCell | string> }[] {
  const s3edit: MatrixCell = perms.s3Edit ? "edit" : "view";
  const relEdit: MatrixCell = perms.relationsEdit ? "edit" : "view";
  const adm: MatrixCell = perms.adminEdit ? "edit" : "view";
  const fin = perms.financeScope === "commission" ? "看（階段 1）" : "看（全部）";
  return [
    { row: "階段、狀態、下一步", cells: { client: "看（自己）", coach: "改（自己）", s3: `${s3edit === "edit" ? "改" : "看"}（所屬）`, relations: `${relEdit === "edit" ? "改" : "看"}（全部）`, finance: fin, admin: `${adm === "edit" ? "改" : "看"}（全部）＋設定規則` } },
    { row: "預計／承諾／實際完成日", cells: { client: "看（預計／承諾／實際）", coach: "改承諾日（改既有要原因）", s3: `${s3edit === "edit" ? "改" : "看"}（所屬）`, relations: "看", finance: fin, admin: `${adm === "edit" ? "改" : "看"}＋設定預設期限` } },
    { row: "本階段應完成項目勾選", cells: { client: "看", coach: "改", s3: s3edit === "edit" ? "改" : "看", relations: relEdit === "edit" ? "改" : "看", finance: "—", admin: adm === "edit" ? "改" : "看" } },
    { row: "案件標記（等待客戶／客訴／低分）", cells: { client: "—（等待客戶會看到待辦）", coach: "改（自己）", s3: "看（所屬）", relations: "改（客訴／低分）", finance: "—", admin: "改" } },
    { row: "諮詢紀錄與會談內容", cells: { client: "只看標客戶可見的", coach: "改（自己）", s3: "看（所屬）", relations: "—", finance: "—", admin: "看" } },
    { row: "KYC 與財務明細", cells: { client: "看（自己）", coach: "改（自己）", s3: "看（所屬）", relations: "—", finance: "—", admin: "看" } },
    { row: "報告書（版本／最終版）", cells: { client: "看最終版", coach: "改（自己）", s3: "看（所屬）", relations: "—", finance: "—", admin: "看" } },
    { row: "合約與付款狀態", cells: { client: "看（自己）", coach: "看", s3: "—", relations: "—", finance: "改", admin: "看" } },
    { row: "客戶回饋問卷", cells: { client: "填", coach: "看（自己）", s3: "看（所屬）", relations: "看（全部）＋處理低分", finance: "—", admin: "看＋設定題目" } },
    { row: "逾期升級、轉交紀錄", cells: { client: "—", coach: "看（自己）", s3: "看（所屬）＋了解原因", relations: "接待轉交", finance: "—", admin: "看" } },
    { row: "全部案件報表與 KPI", cells: { client: "—", coach: "—", s3: "看（所屬）", relations: "看（全部）", finance: fin, admin: "看＋管理使用者" } },
  ];
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
