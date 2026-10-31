"use client";

import type { LicenseState } from "@/lib/license";
import { DEFAULT_THEME, type ThemeName } from "@/lib/theme";
import ShellBar from "@/components/shell/ShellBar";

/**
 * 工作台（教練／主管／管理者）各頁共用頂欄。
 *
 * 2026/11/01 介面整理第一波：改用三端共用的 ShellBar。舊版這裡是 8 個分頁＋11 顆按鈕擠成兩行；
 * 搬家對照（一個都沒刪）：
 *   儀表板 → 首頁上方分頁　待確認／通知 → 收件匣　企業主手冊 → 頭像選單「參考資料」
 *   我的檔案／我的分潤／我的文件／我的規劃 → 頭像選單「我的」　深淺色／字級／期限 → 頭像選單
 *   官網首頁 → 頭像選單（Logo 也回官網）　後台 → 「工作台⇄後台」切換＋頭像選單
 * props 與舊版相同，19 個呼叫端不用改。
 */
export default function DashboardHeader({
  isAdmin = false,
  uiScale = 100,
  theme = DEFAULT_THEME,
  license,
  learnOn = true,
  docsPending = 0,
  unread = 0,
  adminPending = 0,
}: {
  isAdmin?: boolean;
  uiScale?: number;
  theme?: ThemeName;
  license?: LicenseState;
  /** 輪到我簽的電子文件份數（2026/10/28）。 */
  docsPending?: number;
  /** 站內通知未讀數（2026/10/28）。 */
  unread?: number;
  /** 管理者：待審報聘數。 */
  adminPending?: number;
  // 學習區模組關閉時整顆入口不出現（見 /admin/modules）。
  learnOn?: boolean;
}) {
  return (
    <ShellBar
      kind="coach"
      isAdmin={isAdmin}
      learnOn={learnOn}
      theme={theme}
      uiScale={uiScale}
      license={license}
      counts={unread + docsPending + adminPending}
      docsPending={docsPending}
    />
  );
}
