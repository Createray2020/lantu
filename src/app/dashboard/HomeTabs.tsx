"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 首頁上方的分頁（2026/11/01 介面整理第一波）。
 * 「儀表板」「行事曆」原本是頂欄的獨立入口；現在收成首頁的分頁，頁面本身與網址都不變
 * （/dashboard/overview、/dashboard/calendar），頂欄的「首頁」在這三頁都會亮。
 */
const TABS = [
  { href: "/dashboard", label: "今天" },
  { href: "/dashboard/overview", label: "儀表板" },
  { href: "/dashboard/calendar", label: "行事曆" },
];

export default function HomeTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="首頁分頁" className="max-w-[1240px] mx-auto w-full px-4 sm:px-6 pt-5">
      <div className="flex gap-6 border-b border-line">
        {TABS.map((t) => {
          const on = t.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
              className={`pb-2.5 -mb-px text-sm whitespace-nowrap border-b-2 transition ${on ? "border-brand2 text-tx font-bold" : "border-transparent text-tx2 hover:text-tx"}`}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
