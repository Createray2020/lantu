"use client";

import { useState } from "react";
import { respondCollabInviteAction } from "./actions";

type Invite = { id: string; clientName: string; clientCode: string | null; ownerName: string | null };

// 共同執案邀請的收件匣。接受後那位客戶會出現在「客戶」頁的「共同執案」區（唯讀）。
export default function CollabInviteList({ invites }: { invites: Invite[] }) {
  const [list, setList] = useState<Invite[]>(invites);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function respond(id: string, accept: boolean) {
    setBusy(id); setErr(null);
    try {
      const r = await respondCollabInviteAction(id, accept);
      if (r.ok) setList((l) => l.filter((x) => x.id !== id));
      else setErr(r.error || "處理失敗");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "處理失敗");
    } finally {
      setBusy(null);
    }
  }

  if (!list.length) return <p className="text-[#a7bacb]">目前沒有待回覆的共同執案邀請。</p>;

  return (
    <div className="space-y-3">
      {err && <div className="text-[#ff9b9b] text-sm">⚠ {err}</div>}
      {list.map((iv) => (
        <div key={iv.id} className="rounded-xl bg-[#12334f] border border-[#3b82f6]/25 p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[#eef2f7] font-semibold">
              {iv.clientName}
              {iv.clientCode && <span className="ml-2 font-mono text-[11px] text-[#6f869c]">{iv.clientCode}</span>}
            </div>
            <div className="text-[11px] text-[#6f869c]">{iv.ownerName ?? "某位教練"} 邀請你共同執案（唯讀）</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => respond(iv.id, true)} disabled={busy === iv.id}
              className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] disabled:opacity-50 px-4 py-2 rounded-lg text-sm">
              {busy === iv.id ? "…" : "接受"}
            </button>
            <button onClick={() => respond(iv.id, false)} disabled={busy === iv.id}
              className="text-[#a7bacb] hover:text-white border border-white/15 px-4 py-2 rounded-lg text-sm">
              婉拒
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
