"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

// 全螢幕嵌入嵐途 App（v12 HTML），右上角保留 Clerk 登出；管理員多一個後台入口。
export default function PlannerFrame({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <div className="fixed inset-0 flex flex-col bg-[#081a2b]">
      <div
        className="absolute top-2 right-3 z-50 flex items-center gap-2"
        style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,.4))" }}
      >
        {isAdmin && (
          <Link
            href="/admin"
            className="rounded-md bg-[#0d2b45] border border-[#c99a5b]/50 text-[#e0bd8b] text-xs font-bold px-2.5 py-1.5"
          >
            後台
          </Link>
        )}
        <UserButton appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
      </div>
      <iframe
        src="/lantu-app.html"
        title="嵐途 LAN TU"
        className="flex-1 w-full h-full border-0"
      />
    </div>
  );
}
