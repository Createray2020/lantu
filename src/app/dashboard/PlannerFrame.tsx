"use client";

import { UserButton } from "@clerk/nextjs";

// 全螢幕嵌入嵐途 App（v12 HTML），右上角保留 Clerk 登出。
export default function PlannerFrame() {
  return (
    <div className="fixed inset-0 flex flex-col bg-[#081a2b]">
      <div
        className="absolute top-2 right-3 z-50"
        style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,.4))" }}
      >
        <UserButton
          appearance={{ elements: { avatarBox: "w-8 h-8" } }}
        />
      </div>
      <iframe
        src="/lantu-app.html"
        title="嵐途 LAN TU"
        className="flex-1 w-full h-full border-0"
      />
    </div>
  );
}
