"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

// 各頁共用頂欄：品牌 + 首頁/客戶/儀表板切換 + 後台 + Clerk 頭貼。
export default function DashboardHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const onHome = pathname === "/dashboard";
  const onClients = pathname.startsWith("/dashboard/clients");
  const onOverview = pathname.startsWith("/dashboard/overview");

  const tab = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-sm font-bold transition ${
      active ? "bg-[#c99a5b] text-[#08202a]" : "text-[#a9bccf] hover:text-[#eef2f7]"
    }`;

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-[#081a2b] to-[#0d2b45] border-b border-white/10">
      <Link href="/dashboard" className="flex items-center gap-2 mr-2">
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
          <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </svg>
        <span className="font-serif tracking-[0.14em] text-[#eef2f7] text-lg">嵐途</span>
      </Link>
      <nav className="flex items-center gap-1">
        <Link href="/dashboard" className={tab(onHome)}>首頁</Link>
        <Link href="/dashboard/clients" className={tab(onClients)}>客戶</Link>
        <Link href="/dashboard/overview" className={tab(onOverview)}>儀表板</Link>
      </nav>
      <div className="flex-1" />
      {isAdmin && (
        <Link
          href="/admin"
          className="rounded-md bg-[#0d2b45] border border-[#c99a5b]/50 text-[#e0bd8b] text-xs font-bold px-2.5 py-1.5"
        >
          後台
        </Link>
      )}
      <UserButton appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
    </header>
  );
}
