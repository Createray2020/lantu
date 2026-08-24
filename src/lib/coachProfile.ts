// 教練公開檔案：讀寫與公開查詢。
//
// 公開面（官網 /coaches、客戶選教練）與內部面（教練自填、管理員下架）走同一份資料，
// 差別只在「哪些欄位對外送出」——email、電話這類聯絡資訊永遠不會出現在公開查詢裡。

import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches, coachProfiles, coachDisplayName } from "@/Shared/db/schema";
import { canBePicked, publicRankLabel } from "./license";

export type ProfileRow = typeof coachProfiles.$inferSelect;

/**
 * 對外送出的教練卡片。刻意不含 email／電話／**制度職級**。
 *
 * pickable 是職級的衍生結論而不是職級本身：客戶只需要知道「這位能不能直接點」，
 * 不需要（也不該）知道對方是 C2 還是 S1。把 rankCode 送到瀏覽器等於把內部職級公開。
 */
export type PublicCoach = {
  id: string;
  /** 教練編號（FC+YYMM+三碼）。未核准前為 null，但公開列表本來就只收 active。 */
  code: string | null;
  /** 能不能在官網被直接點選／出現在自動建議：S1 以上才可以（見 lib/license.ts canBePicked）。 */
  pickable: boolean;
  name: string;
  /**
   * 對外的職級（認證教練／資深教練／首席教練／實習教練）。
   *
   * ⚠️ 這裡**刻意沒有 title 欄位**：教練自填的職稱（「執行長」「處經理」那種）
   *    是對內的稱謂，Ray 2026/08/24 拍板一律不進官網。型別上直接不給，
   *    才不會哪天有人順手 `{...coach}` 就把頭銜渲染出去。內部頁要用 title 請直接查 coaches。
   */
  rankLabel: string | null;
  headline: string | null;
  bio: string | null;
  specialties: string[];
  photoUrl: string | null;
  yearsExp: number | null;
  prevRole: string | null;
  credentials: string[];
  serviceModes: string[];
  areas: string[];
};

export type ProfileInput = {
  headline?: string | null;
  bio?: string | null;
  specialties?: string[];
  photoUrl?: string | null;
  yearsExp?: number | null;
  prevRole?: string | null;
  credentials?: string[];
  serviceModes?: string[];
  areas?: string[];
  /** 教練自己選擇不要把資料放上官網。undefined＝這次存檔不動它。 */
  selfHidden?: boolean;
  /**
   * 對外顯示名稱。**存到 `coaches.display_name`，不是 coach_profiles** ——
   * 名字是全站都要用的東西，而 coach_profiles 是 CASCADE、也不是每位教練都填了檔案。
   * 留空＝沿用 Clerk 姓名。
   */
  displayName?: string;
};

export async function getProfile(coachId: string): Promise<ProfileRow | null> {
  const r = await db.select().from(coachProfiles)
    .where(eq(coachProfiles.coachId, coachId)).limit(1);
  return r[0] ?? null;
}

export async function saveProfile(coachId: string, input: ProfileInput) {
  const values = {
    coachId,
    headline: input.headline?.trim() || null,
    bio: input.bio?.trim() || null,
    specialties: input.specialties ?? [],
    photoUrl: input.photoUrl ?? null,
    yearsExp: input.yearsExp ?? null,
    prevRole: input.prevRole?.trim() || null,
    credentials: input.credentials ?? [],
    serviceModes: input.serviceModes ?? [],
    areas: input.areas ?? [],
    // selfHidden 相反：這是**教練自己的**開關，存檔就該生效。
    selfHidden: input.selfHidden ?? false,
    updatedAt: new Date(),
  };
  await db.insert(coachProfiles).values(values).onConflictDoUpdate({
    target: coachProfiles.coachId,
    // published 不在這裡動 —— 那是管理員的下架開關，教練存檔不該把自己重新上架。
    set: {
      headline: values.headline, bio: values.bio, specialties: values.specialties,
      photoUrl: values.photoUrl, yearsExp: values.yearsExp, prevRole: values.prevRole,
      credentials: values.credentials, serviceModes: values.serviceModes, areas: values.areas,
      selfHidden: values.selfHidden,
      updatedAt: values.updatedAt,
    },
  });
}

export async function setPublished(coachId: string, published: boolean) {
  await db.update(coachProfiles).set({ published })
    .where(eq(coachProfiles.coachId, coachId));
}

function toPublic(row: {
  id: string; name: string | null;
  code?: string | null; rankCode?: string | null; p: ProfileRow | null;
}): PublicCoach {
  return {
    id: row.id,
    code: row.code ?? null,
    pickable: canBePicked(row.rankCode),
    name: row.name || "教練",
    rankLabel: publicRankLabel(row.rankCode),
    headline: row.p?.headline ?? null,
    bio: row.p?.bio ?? null,
    specialties: row.p?.specialties ?? [],
    photoUrl: row.p?.photoUrl ?? null,
    yearsExp: row.p?.yearsExp ?? null,
    prevRole: row.p?.prevRole ?? null,
    credentials: row.p?.credentials ?? [],
    serviceModes: row.p?.serviceModes ?? [],
    areas: row.p?.areas ?? [],
  };
}

/**
 * 官網公開列表的四道門檻（缺一不可）：
 *   1. `coaches.status = 'active'` —— 帳號已開通
 *   2. 有 `coach_profiles` 列（innerJoin）—— 只有姓名的卡片對客戶沒有判斷價值，
 *      放上去只會讓整頁看起來像沒做完
 *   3. `published` —— 管理員沒有下架
 *   4. `NOT self_hidden` —— 教練自己沒有選擇隱藏（2026/08/24）
 *   5. `rank_code IS NOT NULL` —— 已定級。卡片上要印職級，沒有職級就沒有東西可印；
 *      而且未定級的人本來就不可被客戶指定（見 license.canBePicked）。
 *
 * ⚠️ `getPublicCoach()` 必須跟這裡**逐條一致**——它是單人頁與 pickCoachAction 的守門人，
 *    漏一條就等於開了一扇後門，讓不該被看到的教練靠直連網址或帶 id 進來。
 */
const PUBLIC_CONDITIONS = () => [
  eq(coaches.status, "active"),
  eq(coachProfiles.published, true),
  eq(coachProfiles.selfHidden, false),
  isNotNull(coaches.rankCode),
];

export async function listPublicCoaches(): Promise<PublicCoach[]> {
  const rows = await db
    .select({
      id: coaches.id, name: coachDisplayName,
      code: coaches.code, rankCode: coaches.rankCode, p: coachProfiles,
    })
    .from(coaches)
    .innerJoin(coachProfiles, eq(coaches.id, coachProfiles.coachId))
    .where(and(...PUBLIC_CONDITIONS()))
    .orderBy(asc(coaches.createdAt));
  return rows.map(toPublic);
}

/**
 * 官網首頁「N 位認證教練」用的人數。
 *
 * 跟 listPublicCoaches 差**一條**：把「自己選擇隱藏」的人算回來（Ray 2026/08/24 拍板）。
 * 隱藏是「不想被公開陳列」，不是「不存在」——公司規模的數字該包含他們。
 * 但仍然不含沒填檔案、還沒定級的人：那些是「還沒到位」，算進去就是灌水。
 */
export async function countPublicCoaches(): Promise<number> {
  const rows = await db
    .select({ id: coaches.id })
    .from(coaches)
    .innerJoin(coachProfiles, eq(coaches.id, coachProfiles.coachId))
    .where(and(
      eq(coaches.status, "active"),
      eq(coachProfiles.published, true),
      isNotNull(coaches.rankCode),
    ));
  return rows.length;
}

export async function getPublicCoach(coachId: string): Promise<PublicCoach | null> {
  const rows = await db
    .select({
      id: coaches.id, name: coachDisplayName,
      code: coaches.code, rankCode: coaches.rankCode, p: coachProfiles,
    })
    .from(coaches)
    .innerJoin(coachProfiles, eq(coaches.id, coachProfiles.coachId))
    .where(and(eq(coaches.id, coachId), ...PUBLIC_CONDITIONS()))
    .limit(1);
  return rows[0] ? toPublic(rows[0]) : null;
}

/** 後台用：所有已開通教練＋其檔案（含未填、含已下架），供管理員檢視與下架。 */
export async function listAllProfiles() {
  return db
    .select({
      // 後台名冊刻意同時給兩個：name＝顯示名，clerkName＝登入帳號的真名（對得上是誰）。
      id: coaches.id, name: coachDisplayName, clerkName: coaches.name, email: coaches.email,
      title: coaches.title, status: coaches.status,
      code: coaches.code, rankCode: coaches.rankCode, p: coachProfiles,
    })
    .from(coaches)
    .leftJoin(coachProfiles, eq(coaches.id, coachProfiles.coachId))
    .orderBy(asc(coaches.createdAt));
}

/** 派案候選排序會用到：一次撈所有教練的專長。 */
export async function specialtiesByCoach(): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ coachId: coachProfiles.coachId, specialties: coachProfiles.specialties })
    .from(coachProfiles);
  return new Map(rows.map((r) => [r.coachId, r.specialties ?? []]));
}

export const SERVICE_MODES = ["線上", "實體"] as const;
