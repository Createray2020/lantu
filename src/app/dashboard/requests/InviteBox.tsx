"use client";

import { shareJoinUrl } from "@/lib/joinFlow";
import { groupInviteMessage } from "@/lib/inviteMessage";

import { useState } from "react";
import SubmitButton from "@/components/ui/SubmitButton";
import { createInviteAction } from "./actions";

// 教練產生反向邀請連結；傳給客戶，客戶登入開啟即直接掛到本教練。
export default function InviteBox() {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"" | "link" | "msg">("");
  const [err, setErr] = useState<string | null>(null);

  async function gen() {
    setBusy(true); setErr(null); setCopied("");
    try {
      const r = await createInviteAction();
      if (r.ok) setLink(shareJoinUrl(window.location.origin, r.code));
      else setErr(r.error || "產生失敗");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "產生失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-panel2 border border-line p-4 shadow-e1">
      <div className="font-semibold mb-1">🔗 群發邀請連結（一對多）</div>
      <p className="text-tx2 text-sm mb-3">
        講座、群組用：一條連結可以傳給很多人，誰點進來註冊、按確認，就會新增成你名下的客戶，接著填人生護照。
        <span className="text-tx3">已經知道是誰的一對一客戶，請改到那位客戶頁的「客戶登入」。</span>
      </p>
      {link ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2 items-center">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-[220px] bg-field border border-line rounded-lg px-3 py-2 text-sm text-tx" />
            <button onClick={() => { navigator.clipboard?.writeText(groupInviteMessage({ link })); setCopied("msg"); }}
              className="text-onbrand bg-brand hover:bg-brand2 px-4 py-2 rounded-lg text-sm font-bold">
              {copied === "msg" ? "已複製 ✓" : "複製訊息"}
            </button>
            <button onClick={() => { navigator.clipboard?.writeText(link); setCopied("link"); }}
              className="text-tx2 hover:text-tx border border-line2 px-3 py-2 rounded-lg text-sm">
              {copied === "link" ? "已複製 ✓" : "只複製連結"}
            </button>
            <button onClick={gen} className="text-tx2 hover:text-tx border border-line2 px-3 py-2 rounded-lg text-sm">另產一條</button>
          </div>
          <pre className="whitespace-pre-wrap text-xs text-tx2 bg-field border border-line rounded-md p-2.5 font-sans leading-relaxed">{groupInviteMessage({ link })}</pre>
        </div>
      ) : (
        <SubmitButton onClick={gen} disabled={busy}
          state={busy ? "pending" : "idle"}
          pendingLabel="產生中…"
        >
          產生邀請連結
        </SubmitButton>
      )}
      {err && <div className="text-danger text-sm mt-2">⚠ {err}</div>}
    </div>
  );
}
