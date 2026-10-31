import { ensureCoach } from "@/lib/coach";
import { DEFAULT_UI_SCALE } from "@/lib/uiScale";
import { DEFAULT_THEME, normalizeTheme } from "@/lib/theme";
import { headerProps } from "@/app/dashboard/headerProps";
import ShellBar from "@/components/shell/ShellBar";

/**
 * 後台各頁共用頂欄。
 *
 * 2026/11/01 介面整理第一波：改用三端共用的 ShellBar（kind="admin"）。
 * 六大類（人員／營運／制度／帳務／規劃參數／站台）從 AdminNav 的第一排搬上來當主導覽，
 * 左邊多一顆「工作台⇄後台」切換，取代原本散在兩邊的「後台」「← 回系統」。
 * 主題、字級、帳號都在頭像選單；AdminNav 只剩這一類底下的頁面列。
 *
 * label 保留給呼叫端相容（32 支頁面都有傳），目前畫面上由 AdminNav 的頁面列表達「在哪」。
 * 額外連結用 children 傳，會出現在收件匣左邊。
 */
export default async function AdminHeader({
  children,
}: {
  label?: string;
  children?: React.ReactNode;
}) {
  const me = await ensureCoach();
  const hp = me ? await headerProps(me) : null;
  return (
    <ShellBar
      kind="admin"
      isAdmin
      theme={hp?.theme ?? normalizeTheme(me?.theme ?? DEFAULT_THEME)}
      uiScale={hp?.uiScale ?? me?.uiScale ?? DEFAULT_UI_SCALE}
      license={hp?.license}
      counts={(hp?.unread ?? 0) + (hp?.docsPending ?? 0) + (hp?.adminPending ?? 0)}
      docsPending={hp?.docsPending ?? 0}
      persist={!!me}
    >
      {children}
    </ShellBar>
  );
}
