"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

// 全螢幕嵌入嵐途 App（v12 HTML），右上角保留 Clerk 登出；管理員多一個後台入口。
export default function PlannerFrame({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <div className="fixed inset-0 flex flex-col bg-canvas">
      <div
        className="absolute top-2.5 right-3 z-50 flex items-center gap-3"
        style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,.4))" }}
      >
        {isAdmin && (
          <Link
            href="/admin"
            className="rounded-md bg-panel border border-brand/50 text-brand2 text-xs font-bold px-2.5 py-1.5 shadow-e1"
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
