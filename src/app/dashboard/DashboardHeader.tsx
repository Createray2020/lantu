"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import type { LicenseState } from "@/lib/license";
import UiScaleToggle from "@/components/UiScaleToggle";
import ThemeToggle from "@/components/ThemeToggle";
import { DEFAULT_THEME, type ThemeName } from "@/lib/theme";
import LicenseBadge from "./LicenseBadge";

// 各頁共用頂欄：品牌 + 首頁/客戶/儀表板/學習區切換 + 字級 + 剩餘天數 + 後台 + Clerk 頭貼。
export default function DashboardHeader({
  isAdmin = false,
  uiScale = 100,
  theme = DEFAULT_THEME,
  license,
}: {
  isAdmin?: boolean;
  uiScale?: number;
  theme?: ThemeName;
  license?: LicenseState;
}) {
  const pathname = usePathname();
  const onHome = pathname === "/dashboard";
  const onClients = pathname.startsWith("/dashboard/clients");
  const onOverview = pathname.startsWith("/dashboard/overview");
  const onRequests = pathname.startsWith("/dashboard/requests");
  const onBusiness = pathname.startsWith("/dashboard/my-business");
  const onBizGuide = pathname.startsWith("/dashboard/bizguide");
  const onLearn = pathname.startsWith("/dashboard/learn");

  // 全組織品牌 Logo：有上傳就換掉預設標記（保留「嵐途」文字）。
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  // 讀不到待處理數（斷線／DB 出問題）：紅點換成灰點，讓人知道「這個數字現在不可信」。
  const [pendingErr, setPendingErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/brand", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (alive && b?.logoUrl) setLogoUrl(b.logoUrl as string);
      })
      .catch(() => {});
    fetch("/api/pending-links", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        // 查不到就標灰點，不要當成「沒有待處理」——那是兩件不同的事。
        if (!d || d.error) {
          setPendingErr(true);
          return;
        }
        setPendingErr(false);
        if (typeof d.count === "number") setPending(d.count);
      })
      .catch(() => {
        if (alive) setPendingErr(true);
      });
    return () => {
      alive = false;
    };
  }, [pathname]);

  // shrink-0 + nowrap：在可橫捲的 nav 裡，少了這兩個中文分頁名會被壓成一字一行。
  const tab = (active: boolean) =>
    `shrink-0 whitespace-nowrap px-3 py-1.5 rounded-md text-sm font-bold transition ${
      active ? "bg-brand text-onbrand" : "text-tx2 hover:text-tx"
    }`;

  return (
    // ⚠️ 手機只做「不破版」：加 flex-wrap、讓分頁列自己橫捲。
    //    刻意不做漢堡選單、也不隱藏任何入口——教練端的手機動線要等「管理邊界」定案
    //    （待辦/註記/業績各自算不算手機的事）才動，現在改導覽結構等於先斬後奏。
    //    代價是頂欄在 390px 會變成兩三列，但東西都在、也不再有東西被推出畫面。
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-canvas to-panel border-b border-line">
      <Link href="/home" className="flex items-center gap-2 mr-2 shrink-0" title="回官網首頁">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="嵐途" className="h-[26px] w-auto max-w-[150px] object-contain" />
        ) : (
          <svg width="26" height="26" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
            <path d="M15 12 L15 33 L34 33" className="stroke-tx2" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 24 A13 13 0 0 1 36 16" className="stroke-brand" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </svg>
        )}
        <span className="font-serif tracking-[0.14em] text-tx text-lg">嵐途</span>
      </Link>
      {/* 7 個分頁在 390px 排不下。改成單列可橫捲（而不是 wrap 成三列），
          順序與可見性完全不變；-my-1 py-1 是留給待確認那顆紅點的溢出空間。 */}
      <nav className="flex items-center gap-1 min-w-0 max-w-full overflow-x-auto -my-1 py-1">
        <Link href="/dashboard" className={tab(onHome)}>首頁</Link>
        <Link href="/dashboard/clients" className={tab(onClients)}>客戶</Link>
        <Link href="/dashboard/overview" className={tab(onOverview)}>儀表板</Link>
        <Link href="/dashboard/requests" className={`${tab(onRequests)} relative`}>
          待確認
          {pendingErr ? (
            <span
              title="待處理數暫時讀不到，請重新整理"
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-tx3 text-panel text-10 font-bold grid place-items-center"
            >
              ?
            </span>
          ) : pending > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger-solid text-onsolid text-10 font-bold grid place-items-center">
              {pending}
            </span>
          ) : null}
        </Link>
        <Link href="/dashboard/my-business" className={tab(onBusiness)}>我的業務</Link>
        <Link href="/dashboard/bizguide" className={tab(onBizGuide)}>企業主手冊</Link>
        <Link href="/dashboard/learn" className={tab(onLearn)}>學習區</Link>
      </nav>
      <div className="flex-1" />
      <ThemeToggle initial={theme} persist compact />
      <UiScaleToggle initial={uiScale} persist />
      {license && <LicenseBadge license={license} />}
      <Link
        href="/dashboard/profile"
        className="text-tx2 hover:text-tx text-xs font-bold px-2.5 py-1.5 rounded-md border border-line2"
      >
        我的檔案
      </Link>
      <Link
        href="/portal"
        className="text-tx2 hover:text-tx text-xs font-bold px-2.5 py-1.5 rounded-md border border-line2"
      >
        我的規劃
      </Link>
      <Link
        href="/home"
        className="text-tx2 hover:text-tx text-xs font-bold px-2.5 py-1.5 rounded-md border border-line2"
      >
        官網首頁
      </Link>
      {isAdmin && (
        <Link
          href="/admin"
          className="rounded-md bg-panel border border-brand/50 text-brand2 text-xs font-bold px-2.5 py-1.5 shadow-e1"
        >
          後台
        </Link>
      )}
      <UserButton appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
    </header>
  );
}
