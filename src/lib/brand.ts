// 全組織品牌設定（伺服器端）。
// 全組織「一組品牌」：以 org 擁有者(owner)的 org_settings 為準，全員共用。
// 只有 admin 能寫入（見 app/admin/actions.ts）。
import { asc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coaches, orgSettings } from "@/Shared/db/schema";

export const BRAND_DEFAULTS = {
  brandName: "嵐途 LAN TU",
  slogan: "理解自己・做出選擇・走向未來",
} as const;

export type Brand = {
  logoUrl: string | null; // 橫式 logo（透明底，供頂欄與報告書）
  iconUrl: string | null; // 512 方形 icon（供 favicon / PWA）
  brandName: string;
  slogan: string;
};

// org 擁有者（品牌歸屬）：orgRank='owner' 的第一位；找不到就回 null。
export async function getOrgOwnerId(): Promise<string | null> {
  const rows = await db
    .select({ id: coaches.id })
    .from(coaches)
    .where(eq(coaches.orgRank, "owner"))
    .orderBy(asc(coaches.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

// 讀取全組織品牌（沒設定就回預設，logo/icon 為 null）。
export async function getBrand(): Promise<Brand> {
  const ownerId = await getOrgOwnerId();
  if (!ownerId) {
    return { logoUrl: null, iconUrl: null, ...BRAND_DEFAULTS };
  }
  const rows = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.coachId, ownerId))
    .limit(1);
  const s = rows[0];
  return {
    logoUrl: s?.logoUrl ?? null,
    iconUrl: s?.iconUrl ?? null,
    brandName: s?.brandName ?? BRAND_DEFAULTS.brandName,
    slogan: s?.slogan ?? BRAND_DEFAULTS.slogan,
  };
}

// 寫入品牌（logo/icon 皆為 dataURL 或 null＝清除）。寫到 owner 那一列。
// 若尚無 owner（理論上不會），退回寫到指定的 fallback coachId（通常是操作的 admin）。
export async function saveBrand(
  fallbackCoachId: string,
  patch: { logoUrl?: string | null; iconUrl?: string | null },
): Promise<void> {
  const ownerId = (await getOrgOwnerId()) ?? fallbackCoachId;
  await db
    .insert(orgSettings)
    .values({
      coachId: ownerId,
      logoUrl: patch.logoUrl ?? null,
      iconUrl: patch.iconUrl ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: orgSettings.coachId,
      set: {
        ...(patch.logoUrl !== undefined ? { logoUrl: patch.logoUrl } : {}),
        ...(patch.iconUrl !== undefined ? { iconUrl: patch.iconUrl } : {}),
        updatedAt: new Date(),
      },
    });
}

// dataURL 解析成 bytes（給 icon 路由用）。非法/非 dataURL 回 null。
export function parseDataUrl(
  dataUrl: string | null | undefined,
): { mime: string; bytes: Buffer } | null {
  if (!dataUrl) return null;
  const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  try {
    return { mime: m[1], bytes: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}
