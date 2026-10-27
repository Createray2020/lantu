// 會員中心「聯絡客服」面板的內容（LINE／專線／信箱／防詐提示）：存 site_settings key=support_contact，後台可編。
import { sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { siteSettings } from "@/Shared/db/schema";

export const SUPPORT_KEY = "support_contact";
export type SupportContact = {
  intro: string;      // 面板引言
  line: string;       // LINE 官方帳號 id（@xxx）
  lineUrl: string;    // LINE 連結
  lineHours: string;
  phone: string;
  phoneHours: string;
  email: string;
  emailNote: string;
  safety: string[];   // 防詐提示（每行一條）
};
export const DEFAULT_SUPPORT: SupportContact = {
  intro: "付款、合約、系統問題找客服；規劃內容的問題可直接問你的教練。",
  line: "", lineUrl: "", lineHours: "最快回覆，平日 09:00–21:00",
  phone: "", phoneHours: "週一至週五 09:00–18:00",
  email: "", emailNote: "一個工作日內回覆",
  safety: ["客服不會向你索取密碼或驗證碼", "緊急財務風險請來電，並於語音留言留下回撥號碼"],
};
const str = (v: unknown, n = 120) => String(v ?? "").trim().slice(0, n);
export function sanitizeSupport(v: unknown): SupportContact {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const safety = Array.isArray(o.safety) ? o.safety.map((x) => str(x, 120)).filter(Boolean).slice(0, 6) : DEFAULT_SUPPORT.safety;
  return {
    intro: str(o.intro, 200) || DEFAULT_SUPPORT.intro, line: str(o.line, 60), lineUrl: str(o.lineUrl, 300), lineHours: str(o.lineHours, 60),
    phone: str(o.phone, 40), phoneHours: str(o.phoneHours, 60), email: str(o.email, 120), emailNote: str(o.emailNote, 60), safety,
  };
}
export async function getSupportContact(): Promise<SupportContact> {
  try {
    const rows = await db.select().from(siteSettings).where(sql`${siteSettings.key} = ${SUPPORT_KEY}`).limit(1);
    return rows[0] ? sanitizeSupport(rows[0].value) : DEFAULT_SUPPORT;
  } catch { return DEFAULT_SUPPORT; }
}
export async function saveSupportContact(input: unknown, updatedBy: string | null): Promise<SupportContact> {
  const v = sanitizeSupport(input);
  await db.insert(siteSettings).values({ key: SUPPORT_KEY, value: v, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at`, updatedBy: sql`excluded.updated_by` } });
  return v;
}
