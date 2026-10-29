"use client";

import { useState, useTransition } from "react";
import { confirmClaimAction, dismissClaimAction } from "./actions";
import { CLAIM_BUTTON_DEDICATED, CLAIM_BUTTON_GROUP } from "@/lib/inviteMessage";

// 按鈕字要跟教練「複製訊息」裡寫的一模一樣（lib/inviteMessage），客戶才找得到要按哪一顆。
export default function ClaimConfirm({ code, disabled = false, group = false }: { code: string; disabled?: boolean; group?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="grid gap-3 justify-items-center">
      {!disabled && (
        <button
          type="button"
          disabled={busy}
          onClick={() => start(async () => { setErr(null); const r = await confirmClaimAction(code); if (r && !r.ok) setErr(r.error); })}
          className="font-bold text-onbrand bg-brand hover:bg-brand2 px-8 py-2.5 rounded-lg disabled:opacity-50"
        >
          {busy ? "接上中…" : group ? CLAIM_BUTTON_GROUP : CLAIM_BUTTON_DEDICATED}
        </button>
      )}
      {err && <p className="text-danger text-sm">⚠ {err}</p>}
      <button type="button" disabled={busy} onClick={() => start(() => dismissClaimAction())} className="text-sm text-tx2 hover:text-tx underline underline-offset-4">
        {disabled ? "回我的首頁" : "這不是我的"}
      </button>
    </div>
  );
}
