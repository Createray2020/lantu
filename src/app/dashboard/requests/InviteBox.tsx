"use client";

import { useState } from "react";
import { createInviteAction } from "./actions";

// 教練產生反向邀請連結；傳給客戶，客戶登入開啟即直接掛到本教練。
export default function InviteBox() {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function gen() {
    setBusy(true); setErr(null); setCopied(false);
    try {
      const r = await createInviteAction();
      if (r.ok) setLink(`${window.location.origin}/portal/join?code=${r.code}`);
      else setErr(r.error || "產生失敗");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "產生失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-[#12334f] border border-white/8 p-4">
      <div className="font-semibold mb-1">🔗 主動邀請客戶</div>
      <p className="text-[#a7bacb] text-sm mb-3">產生一條邀請連結傳給客戶；他登入客戶帳號、做完人生護照後開啟，就會直接掛到你名下（不必再等你接受）。</p>
      {link ? (
        <div className="flex flex-wrap gap-2 items-center">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-[220px] bg-[#0a1a28] border border-white/12 rounded-lg px-3 py-2 text-sm text-[#eef2f7]" />
          <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}
            className="text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-4 py-2 rounded-lg text-sm font-bold">
            {copied ? "已複製 ✓" : "複製"}
          </button>
          <button onClick={gen} className="text-[#a7bacb] hover:text-white border border-white/15 px-3 py-2 rounded-lg text-sm">另產一條</button>
        </div>
      ) : (
        <button onClick={gen} disabled={busy}
          className="text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
          {busy ? "產生中…" : "產生邀請連結"}
        </button>
      )}
      {err && <div className="text-[#ff9b9b] text-sm mt-2">⚠ {err}</div>}
    </div>
  );
}
