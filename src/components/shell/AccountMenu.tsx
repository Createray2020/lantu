"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import ThemeToggle from "@/components/ThemeToggle";
import UiScaleToggle from "@/components/UiScaleToggle";
import type { ThemeName } from "@/lib/theme";
import type { LicenseState } from "@/lib/license";
import { ACCOUNT_LINKS } from "@/lib/nav";

/**
 * 頭像選單（2026/11/01）。舊頂欄右半邊那 11 顆按鈕都搬到這裡，依用途分組：
 *   我的 → 參考資料 → 外觀（主題／字級）→ 使用期限 → 前往後台／官網 → 帳號設定／登出。
 * 外觀是設一次就不再動的東西，不該佔頂欄；Clerk 的帳號設定與登出也在這裡（取代原本的 UserButton）。
 */
export default function AccountMenu({
  kind,
  isAdmin = false,
  theme,
  uiScale,
  license,
  docsPending = 0,
  extra,
}: {
  kind: "coach" | "admin" | "client";
  isAdmin?: boolean;
  theme: ThemeName;
  uiScale: number;
  license?: LicenseState;
  docsPending?: number;
  /** 客戶端專用：教練工作台／申請成為教練這一類，依身分由頁面決定。 */
  extra?: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const { user } = useUser();
  const clerk = useClerk();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const name = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || "";
  const initial = (name || "嵐").slice(0, 1);
  const item = "flex items-center justify-between gap-3 w-full text-left px-3 py-1.5 rounded-lg text-sm text-tx hover:bg-panel2";
  const head = "px-3 pt-2.5 pb-1 text-10 font-bold tracking-[0.16em] text-tx3";
  const groups = kind === "client" ? [] : (["我的", "參考資料"] as const);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="帳號選單"
        className="w-8 h-8 rounded-full overflow-hidden grid place-items-center bg-brand text-onbrand text-sm font-bold ring-1 ring-line2"
      >
        {user?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 w-[264px] rounded-xl border border-line bg-panel shadow-e3 p-1.5">
          <div className="px-3 pt-2 pb-2.5 border-b border-line mb-1">
            <div className="font-serif font-bold text-15 truncate">{name || "我的帳號"}</div>
            {user?.primaryEmailAddress?.emailAddress && <div className="text-xs text-tx3 truncate">{user.primaryEmailAddress.emailAddress}</div>}
          </div>
          {groups.map((g) => (
            <div key={g}>
              <div className={head}>{g}</div>
              {ACCOUNT_LINKS.filter((l) => l.group === g).map((l) => (
                <Link key={l.href} href={l.href} className={item} role="menuitem" onClick={() => setOpen(false)}>
                  {l.label}
                  {l.href === "/dashboard/docs" && docsPending > 0 && <span className="text-xs font-bold text-brand2">{docsPending} 待簽</span>}
                </Link>
              ))}
            </div>
          ))}
          {extra?.map((l) => (
            <Link key={l.href} href={l.href} className={item} role="menuitem" onClick={() => setOpen(false)}>{l.label}</Link>
          ))}
          <div className="border-t border-line mt-1.5 pt-1.5 flex flex-col gap-1.5 px-3 py-1.5 text-sm text-tx2">
            <div className="flex items-center justify-between gap-2"><span>外觀</span><ThemeToggle initial={theme} persist={kind !== "client"} compact /></div>
            <div className="flex items-center justify-between gap-2"><span>字級</span><UiScaleToggle initial={uiScale} persist={kind !== "client"} compact /></div>
            {license?.managed && license.daysLeft != null && (
              <div className="flex items-center justify-between gap-2">
                <span>使用期限</span>
                <span className={license.expired ? "text-danger font-bold" : license.warn ? "text-brand2 font-bold" : "text-tx2"}>
                  {license.expired ? "已到期" : `剩 ${license.daysLeft} 天`}
                </span>
              </div>
            )}
          </div>
          <div className="border-t border-line mt-1 pt-1">
            {kind === "coach" && isAdmin && <Link href="/admin/inbox" className={item} role="menuitem" onClick={() => setOpen(false)}>前往後台</Link>}
            {kind === "admin" && <Link href="/dashboard" className={item} role="menuitem" onClick={() => setOpen(false)}>回到工作台</Link>}
            <Link href="/home" className={item} role="menuitem" onClick={() => setOpen(false)}>官網首頁</Link>
            <button type="button" className={item} role="menuitem" onClick={() => { setOpen(false); clerk.openUserProfile(); }}>帳號設定</button>
            <button type="button" className={`${item} text-tx2`} role="menuitem" onClick={() => void clerk.signOut({ redirectUrl: "/" })}>登出</button>
          </div>
        </div>
      )}
    </div>
  );
}
