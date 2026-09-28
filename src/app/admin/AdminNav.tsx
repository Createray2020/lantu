"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 管理後台的共用導覽，兩層：第一排是大類（6 個），第二排只放目前這一類底下的頁面。
//
// 2026/09/29 Ray：一次攤開 23 個入口太雜。改成兩層之後每一屏最多看到 6＋6 個字，
// 頁面路徑全部不動（舊連結、書籤照常），只有帳務拆成三頁。
// 分類原則還是「你現在要處理的是哪一類事」：人／營運／制度／帳務／規劃參數／站台。
// 大類的順序＝一天工作的順序：先看有沒有人在等（人員），再看制度與錢，最後才是設定。
// 項目名稱一律等於落地頁的標題（feedback_清單項目名稱等於落地標題）。
export const ADMIN_GROUPS: { key: string; title: string; items: { href: string; label: string }[] }[] = [
  {
    key: "people",
    title: "人員",
    items: [
      // 待我處理排第一：它是「有人在等」的那一類，而且是後台唯一在手機上做得完的入口。
      { href: "/admin/inbox", label: "待我處理" },
      { href: "/admin", label: "教練帳號" },
      { href: "/admin/apply", label: "報聘設定" },
      { href: "/admin/profiles", label: "對外檔案" },
      // 外部客戶（官網自己註冊的那群）與教練帳號是兩批人，排在同一類的最後：這一類回答的是「平台上有誰」。
      { href: "/admin/visitors", label: "訪客記錄" },
    ],
  },
  {
    key: "ops",
    title: "營運",
    items: [
      { href: "/admin/calendar", label: "公司行事曆" },
      { href: "/admin/training", label: "訓練時數" },
      { href: "/admin/learn", label: "學習區" },
    ],
  },
  {
    key: "system",
    title: "制度",
    items: [
      { href: "/admin/system", label: "制度設定" },
      // 分潤試算是制度設定的附屬工具（改了制度想看看影響），排在它旁邊。
      { href: "/admin/system/simulator", label: "分潤試算" },
      { href: "/admin/cases", label: "案件與分潤" },
      { href: "/admin/advisors", label: "職級與晉升" },
    ],
  },
  {
    key: "acct",
    title: "帳務",
    // 一個一個往後延：先設參數 → 用參數設目標 → 才填本月帳務。
    items: [
      { href: "/admin/accounting", label: "參數設定" },
      { href: "/admin/accounting/targets", label: "目標設定" },
      { href: "/admin/accounting/monthly", label: "本月帳務" },
    ],
  },
  {
    key: "params",
    title: "規劃參數",
    items: [
      { href: "/admin/categories", label: "類別與參數" },
      { href: "/admin/house-params", label: "房價參數" },
      { href: "/admin/car-params", label: "車價參數" },
      { href: "/admin/analysis", label: "分析模組" },
      { href: "/admin/client-view", label: "客戶端顯示" },
      { href: "/admin/templates", label: "示範範本" },
    ],
  },
  {
    key: "site",
    title: "站台",
    items: [
      { href: "/admin/brand", label: "品牌設定" },
      { href: "/admin/site-nav", label: "官網頂欄" },
      { href: "/admin/modules", label: "模組開關" },
    ],
  },
];

const hit = (pathname: string, href: string) => pathname === href || pathname.startsWith(href.endsWith("/") ? href : href + "/");

export default function AdminNav() {
  const pathname = usePathname();
  // 最長前綴唯一勝出：一條路徑可能同時前綴命中好幾個入口
  // （/admin/system/simulator 同時是 /admin、/admin/system、/admin/system/simulator 的子路徑），
  // 只點亮最長的那一個；它所屬的大類就是第一排要點亮、第二排要展開的那一類。
  const { active, group } = useMemo(() => {
    const all = ADMIN_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, g })));
    const best = all.filter((i) => hit(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0];
    return { active: best?.href ?? null, group: best?.g ?? ADMIN_GROUPS[0] };
  }, [pathname]);

  return (
    <nav className="border-b border-line bg-field">
      {/* 第一排：大類。點大類＝去那一類的第一頁。 */}
      <div className="px-5 pt-2.5 flex gap-1 overflow-x-auto">
        {ADMIN_GROUPS.map((g) => {
          const on = g.key === group.key;
          return (
            <Link
              key={g.key}
              href={g.items[0].href}
              aria-current={on ? "true" : undefined}
              className={
                "px-3 py-1.5 text-13 whitespace-nowrap border-b-2 transition " +
                (on ? "border-brand text-tx font-bold" : "border-transparent text-tx2 hover:text-tx")
              }
            >
              {g.title}
            </Link>
          );
        })}
      </div>
      {/* 第二排：這一類底下的頁面。手機單列橫捲，不 wrap 成好幾列。 */}
      <div className="px-5 py-2 flex gap-1.5 overflow-x-auto">
        {group.items.map((it) => {
          const on = it.href === active;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={on ? "page" : undefined}
              className={
                "rounded-lg px-2.5 py-1 text-13 whitespace-nowrap border transition " +
                (on ? "bg-brand text-onbrand border-brand font-bold" : "text-tx2 border-line hover:bg-panel3 hover:text-tx")
              }
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
