// 官網頂欄的讀寫（DB）。規則在 lib/siteNav.ts。
// 讀取走 unstable_cache + tag：官網每一次渲染都要，打一次 DB 是白花的；後台一存就 updateTag。
import { unstable_cache, updateTag } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { siteSettings } from "@/Shared/db/schema";
import { DEFAULT_NAV, sanitizeNav, type NavItem } from "@/lib/siteNav";

export const SITE_NAV_KEY = "header_nav";
export const SITE_SETTINGS_TAG = "site-settings";

export const getSiteNav = unstable_cache(
  async (): Promise<{ items: NavItem[]; configured: boolean }> => {
    try {
      const rows = await db.select().from(siteSettings).where(sql`${siteSettings.key} = ${SITE_NAV_KEY}`).limit(1);
      if (!rows[0]) return { items: DEFAULT_NAV, configured: false };
      return { items: sanitizeNav(rows[0].value), configured: true };
    } catch {
      // ⚠️ DB 抖一下不能讓官網頂欄整條不見：退回預設。
      return { items: DEFAULT_NAV, configured: false };
    }
  },
  ["lantu-site-nav"],
  { tags: [SITE_SETTINGS_TAG] },
);

export async function saveSiteNav(input: unknown, updatedBy: string | null): Promise<NavItem[]> {
  const items = sanitizeNav(input);
  await db.insert(siteSettings)
    .values({ key: SITE_NAV_KEY, value: items, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at`, updatedBy: sql`excluded.updated_by` },
    });
  updateTag(SITE_SETTINGS_TAG);
  return items;
}

export async function resetSiteNav(): Promise<void> {
  await db.delete(siteSettings).where(sql`${siteSettings.key} = ${SITE_NAV_KEY}`);
  updateTag(SITE_SETTINGS_TAG);
}
