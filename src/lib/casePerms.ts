// 案件進度權限開關的存取（site_settings key case_permissions）。純邏輯在 caseScope.ts。
import { sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { siteSettings } from "@/Shared/db/schema";
import { DEFAULT_PERMS, sanitizePerms, type CasePerms } from "./caseScope";

export const PERMS_KEY = "case_permissions";
export async function getCasePerms(): Promise<CasePerms> {
  try {
    const rows = await db.select().from(siteSettings).where(sql`${siteSettings.key} = ${PERMS_KEY}`).limit(1);
    return rows[0] ? sanitizePerms(rows[0].value) : DEFAULT_PERMS;
  } catch { return DEFAULT_PERMS; }
}
export async function saveCasePerms(input: unknown, updatedBy: string | null): Promise<CasePerms> {
  const v = sanitizePerms(input);
  await db.insert(siteSettings).values({ key: PERMS_KEY, value: v, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at`, updatedBy: sql`excluded.updated_by` } });
  return v;
}
