"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 管理後台的共用導覽。
//
// 改版理由：原本 7 個入口平鋪在 /admin 首頁、順序看不出邏輯，而且子頁只有一條「← 回後台」——
// 從「案件與分潤」要去「制度設定」得先回首頁再點一次。分組＋常駐導覽同時解掉這兩件事。
//
// 分組的原則是「你現在要處理的是哪一類事」：管人、管制度、管系統設定。
// 「分潤試算器」本來就是制度設定的附屬工具（改了制度想看看影響），卻被排成平級，收進同一組。
const GROUPS: { title: string; items: { href: string; label: string }[] }[] = [
  {
    title: "人員與組織",
    items: [
      { href: "/admin", label: "教練帳號" },
      { href: "/admin/profiles", label: "對外檔案" },
      { href: "/admin/training", label: "訓練時數" },
    ],
  },
  {
    title: "業務制度",
    items: [
      { href: "/admin/system", label: "制度設定" },
      { href: "/admin/system/simulator", label: "分潤試算" },
      { href: "/admin/cases", label: "案件與分潤" },
      { href: "/admin/advisors", label: "職級與晉升" },
    ],
  },
  {
    title: "系統設定",
    items: [
      { href: "/admin/categories", label: "類別與參數" },
      { href: "/admin/brand", label: "品牌設定" },
    ],
  },
];

export default function AdminNav() {
  const pathname = usePathname();
  // /admin 是精確比對，其餘用前綴——否則每一頁都會把「教練帳號」一起點亮。
  const isOn = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  return (
    <nav className="border-b border-white/10 bg-[#0b2036]">
      <div className="max-w-6xl mx-auto px-5 py-3 flex flex-wrap items-start gap-x-7 gap-y-3">
        {GROUPS.map((g) => (
          <div key={g.title} className="min-w-0">
            <div className="text-[10px] tracking-[0.22em] text-[#6b7d8f] mb-1.5">{g.title}</div>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((it) => {
                const on = isOn(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={on ? "page" : undefined}
                    className={
                      "rounded-lg px-2.5 py-1.5 text-[13px] whitespace-nowrap border transition " +
                      (on
                        ? "bg-[#c99a5b] text-[#08202a] border-[#c99a5b] font-bold"
                        : "text-[#a9bccf] border-white/12 hover:bg-[#17406a] hover:text-white")
                    }
                  >
                    {it.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
