"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { activeKey, coachNav, CLIENT_NAV, INBOX_HREF, type NavItem, type NavKind } from "@/lib/nav";
import { ADMIN_GROUPS } from "@/app/admin/AdminNav";
import { useThemeSync } from "@/components/ThemeToggle";
import { useUiScaleSync } from "@/components/UiScaleToggle";
import type { ThemeName } from "@/lib/theme";
import type { LicenseState } from "@/lib/license";
import BrandMark from "@/components/BrandMark";
import AccountMenu from "./AccountMenu";

/**
 * 三端共用的頂欄（2026/11/01 介面整理第一波）。
 *
 * 左：Logo →（管理者）工作台⇄後台 → 主導覽；右：收件匣 → 頭像選單。就這樣，不再放別的。
 * 主導覽放什麼由 lib/nav.ts 決定；後台沿用 AdminNav 的六大類（第二排頁面列照舊在 AdminNav）。
 *
 * ⚠️ 收件匣的數字＝待確認＋未讀通知＋待簽文件（＋管理者的待我處理）。待確認只能在 client 端打
 *    /api/pending-links（原本頂欄就是這樣拿），讀不到時標灰「?」，不要偽裝成 0——
 *    沒人在等跟「現在不知道有沒有人在等」是兩件事。
 */
export default function ShellBar({
  kind,
  isAdmin = false,
  learnOn = true,
  theme,
  uiScale,
  license,
  counts = 0,
  docsPending = 0,
  persist = true,
  menuExtra,
  children,
}: {
  kind: NavKind;
  isAdmin?: boolean;
  learnOn?: boolean;
  theme: ThemeName;
  uiScale: number;
  license?: LicenseState;
  /** 伺服器端算好的待處理數（未讀通知＋待簽文件＋待我處理）。 */
  counts?: number;
  docsPending?: number;
  persist?: boolean;
  menuExtra?: { href: string; label: string }[];
  /** 頁面要插在收件匣左邊的東西（後台少數頁面的捷徑）。 */
  children?: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  useThemeSync(theme, persist);
  useUiScaleSync(uiScale, persist);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [pendingErr, setPendingErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/brand", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (alive && b?.logoUrl) setLogoUrl(b.logoUrl as string); })
      .catch(() => {});
    if (kind !== "client") {
      fetch("/api/pending-links", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive) return;
          if (!d || d.error) { setPendingErr(true); return; }
          setPendingErr(false);
          if (typeof d.count === "number") setPending(d.count);
        })
        .catch(() => { if (alive) setPendingErr(true); });
    }
    return () => { alive = false; };
  }, [pathname, kind]);

  let items: NavItem[];
  let cur: string | null;
  if (kind === "admin") {
    items = ADMIN_GROUPS.map((g) => ({ key: g.key, href: g.items[0].href, label: g.title, prefixes: g.items.map((i) => i.href) }));
    // 後台的 /admin 是「教練帳號」，不能當成所有後台頁面的前綴——用跟 AdminNav 一樣的最長前綴勝出。
    const all = ADMIN_GROUPS.flatMap((g) => g.items.map((i) => ({ g: g.key, href: i.href })));
    const best = all.filter((i) => pathname === i.href || pathname.startsWith(i.href + "/")).sort((a, b) => b.href.length - a.href.length)[0];
    cur = best?.g ?? null;
  } else {
    items = kind === "client" ? CLIENT_NAV : coachNav({ learnOn });
    cur = activeKey(items, pathname);
  }

  const total = counts + pending;
  const inboxHref = INBOX_HREF[kind];
  const onInbox = pathname === inboxHref;
  const seg = (on: boolean) =>
    `px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition ${on ? "bg-panel text-tx shadow-e1" : "text-tx2 hover:text-tx"}`;

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 bg-panel border-b border-line shadow-e1">
      <Link href="/home" className="flex items-center gap-2 mr-1 shrink-0" title="回官網首頁">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="嵐途" className="h-7 w-auto max-w-[120px] object-contain rounded-md" />
        ) : (
          <BrandMark size={28} className="rounded-md" />
        )}
        <span className="hidden sm:inline font-serif tracking-[0.16em] text-tx text-lg">嵐途</span>
      </Link>

      {isAdmin && kind !== "client" && (
        <div className="hidden sm:flex items-center rounded-full bg-panel2 border border-line p-0.5 shrink-0" role="group" aria-label="工作台或後台">
          <Link href="/dashboard" className={seg(kind === "coach")} aria-current={kind === "coach" ? "page" : undefined}>工作台</Link>
          <Link href="/admin/inbox" className={seg(kind === "admin")} aria-current={kind === "admin" ? "page" : undefined}>後台</Link>
        </div>
      )}

      {/* 可橫捲而不換行：手機上主導覽一列滑動，頂欄不會長成三排。 */}
      <nav aria-label="主導覽" className="flex items-center gap-0.5 min-w-0 overflow-x-auto [scrollbar-width:none]">
        {items.map((it) => {
          const on = it.key === cur;
          return (
            <Link
              key={it.key}
              href={it.href}
              aria-current={on ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm transition ${
                on ? "font-bold text-tx bg-brand/10 shadow-[inset_0_-2px_0_var(--brand2)]" : "text-tx2 hover:text-tx"
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />
      {children}
      {/* 使用期限剩 30 天內才浮到頂欄；平常在頭像選單裡。 */}
      {license?.managed && (license.warn || license.expired) && (
        <span className={`hidden md:inline text-xs font-bold px-2.5 py-1 rounded-md border whitespace-nowrap ${license.expired ? "border-danger/50 text-danger" : "border-brand2/50 text-brand2"}`}>
          {license.expired ? "使用期限已到期" : `期限剩 ${license.daysLeft} 天`}
        </span>
      )}
      <Link
        href={inboxHref}
        aria-current={onInbox ? "page" : undefined}
        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${onInbox ? "font-bold text-tx bg-brand/10" : "text-tx2 hover:text-tx"}`}
      >
        收件匣
        {pendingErr ? (
          <span title="待確認數暫時讀不到，請重新整理" className="min-w-[18px] h-[18px] px-1 rounded-full bg-tx3 text-panel text-10 font-bold grid place-items-center">?</span>
        ) : total > 0 ? (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-danger-solid text-onsolid text-10 font-bold grid place-items-center">{total > 99 ? "99+" : total}</span>
        ) : null}
      </Link>
      <AccountMenu kind={kind} isAdmin={isAdmin} theme={theme} uiScale={uiScale} license={license} docsPending={docsPending} extra={menuExtra} />
    </header>
  );
}
