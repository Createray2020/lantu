"use client";

import { UserButton } from "@clerk/nextjs";

// 帳號尚未開通 / 已停權時顯示；使用者進不了 App。
export default function PendingNotice({
  email,
  status,
}: {
  email: string | null;
  status: string;
}) {
  const suspended = status === "suspended";
  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] text-[#eef2f7] px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 w-14 h-14 rounded-2xl border border-[#c99a5b] grid place-items-center">
          <svg width="34" height="34" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
            <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="font-serif text-2xl tracking-[0.1em] mb-3">
          {suspended ? "帳號已停權" : "帳號待開通"}
        </h1>
        <p className="text-[#a9bccf] text-sm leading-relaxed mb-2">
          {suspended
            ? "您的帳號目前已停權，若有疑問請與嵐途聯繫。"
            : "已收到您的使用申請，開通需經審核（含費用確認）。開通後即可使用完整系統。"}
        </p>
        <p className="text-[#6f869c] text-xs mb-8">
          登入帳號：{email || "（未提供 email）"}
        </p>
        <div className="flex items-center justify-center gap-3">
          <UserButton />
          <span className="text-[#6f869c] text-xs">點頭像可登出／切換帳號</span>
        </div>
      </div>
    </main>
  );
}
