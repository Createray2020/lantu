"use client";

import { useState } from "react";
import Link from "next/link";
import { applyAsCoachAction } from "./actions";

// 「成為教練」必須是明確動作。舊版是任何人走到 /dashboard 就被自動建成待審教練，
// 客戶點邀請連結被導進來時就變成「教練申請」——所以這裡一定要有一次確認。
export default function ApplyForm({ email }: { email: string | null }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="max-w-md text-center">
      <h1 className="font-serif text-2xl tracking-[0.1em] mb-3">申請成為嵐途財務教練</h1>
      <p className="text-[#a9bccf] text-sm leading-relaxed mb-2">
        送出後由嵐途審核（含費用確認），開通即可使用完整的教練工作台。
      </p>
      <p className="text-[#6f869c] text-xs mb-8">登入帳號：{email || "（未提供 email）"}</p>

      <button
        onClick={async () => { setBusy(true); await applyAsCoachAction(); }}
        disabled={busy}
        className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg disabled:opacity-50"
      >
        {busy ? "送出中…" : "送出教練申請"}
      </button>

      <div className="mt-8 pt-6 border-t border-white/10">
        <p className="text-[#6f869c] text-xs mb-3">不是要當教練？</p>
        <Link href="/portal" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">
          我是客戶，前往我的財務規劃 →
        </Link>
      </div>
    </div>
  );
}
