// 全站主導覽的單一真相（2026/11/01 介面整理第一波）。
//
// 改版前三端各寫一份頂欄：教練端 8 個分頁＋11 顆按鈕擠成兩行、後台另一套、客戶端又一套。
// 現在三端共用同一條頂欄（components/shell/ShellBar），「主導覽放什麼」只在這裡決定：
//   - 主導覽只放每天要用的工作區；
//   - 「我的…」、參考資料、外觀、期限、後台、官網都收進頭像選單（ACCOUNT_LINKS）；
//   - 「有人在等我」全部集中到收件匣。
// ⚠️ 只搬位置、不刪入口：舊頂欄的每一個入口都必須出現在這裡的某一處，navUI.test.ts 逐項守著。
// ⚠️ 項目名稱＝落地頁標題（feedback_清單項目名稱等於落地標題）。

export type NavKind = "coach" | "admin" | "client";
export type NavItem = { key: string; href: string; label: string; prefixes: string[] };

/** 教練／主管／管理者（工作台）共用；學習區受模組開關控制。 */
export function coachNav({ learnOn = true }: { learnOn?: boolean } = {}): NavItem[] {
  const items: NavItem[] = [
    // 儀表板與行事曆併成首頁上方的分頁，所以首頁吃 /dashboard/overview、/dashboard/calendar。
    { key: "home", href: "/dashboard", label: "首頁", prefixes: ["/dashboard/overview", "/dashboard/calendar"] },
    { key: "clients", href: "/dashboard/clients", label: "客戶", prefixes: ["/dashboard/clients", "/dashboard/plans", "/dashboard/templates"] },
    { key: "cases", href: "/dashboard/cases", label: "案件", prefixes: ["/dashboard/cases"] },
    { key: "biz", href: "/dashboard/my-business", label: "我的業務", prefixes: ["/dashboard/my-business", "/dashboard/payouts"] },
  ];
  if (learnOn) items.push({ key: "learn", href: "/dashboard/learn", label: "學習區", prefixes: ["/dashboard/learn"] });
  return items;
}

/** 客戶端：首頁就是會員中心。 */
export const CLIENT_NAV: NavItem[] = [
  { key: "home", href: "/portal", label: "首頁", prefixes: [] },
  { key: "plan", href: "/portal/plan", label: "我的規劃", prefixes: ["/portal/plan", "/portal/passport", "/portal/history", "/portal/setup"] },
  { key: "docs", href: "/portal/docs", label: "文件", prefixes: ["/portal/docs"] },
];

/** 頭像選單的連結（工作台／後台共用）。外觀、期限、登出不是連結，在元件裡另外畫。 */
export const ACCOUNT_LINKS: { group: "我的" | "參考資料"; href: string; label: string }[] = [
  { group: "我的", href: "/dashboard/profile", label: "我的檔案" },
  { group: "我的", href: "/dashboard/payouts", label: "我的分潤" },
  { group: "我的", href: "/dashboard/docs", label: "我的文件" },
  { group: "我的", href: "/portal", label: "我的規劃" },
  { group: "參考資料", href: "/dashboard/bizguide", label: "企業主手冊" },
  // 2026/11/01 盤點時發現這一頁在全站沒有任何入口，順手放回來。
  { group: "參考資料", href: "/dashboard/handbook", label: "業務制度說明" },
];

export const INBOX_HREF: Record<NavKind, string> = { coach: "/dashboard/inbox", admin: "/dashboard/inbox", client: "/portal/inbox" };

/** 最長前綴勝出：/dashboard 是所有工作台路徑的前綴，不能讓「首頁」永遠亮著。 */
export function activeKey(items: NavItem[], pathname: string): string | null {
  let best: { key: string; len: number } | null = null;
  for (const it of items) {
    for (const p of [it.href, ...it.prefixes]) {
      const hit = p === "/dashboard" || p === "/portal" ? pathname === p : pathname === p || pathname.startsWith(p + "/");
      if (hit && (!best || p.length > best.len)) best = { key: it.key, len: p.length };
    }
  }
  return best?.key ?? null;
}
