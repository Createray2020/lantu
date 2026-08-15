"use client";

import { useState } from "react";
import { respondLinkAction } from "./actions";

type Req = { id: string; clientId: string; clientName: string; note: string | null };

export default function RequestList({ requests }: { requests: Req[] }) {
  const [list, setList] = useState<Req[]>(requests);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function respond(id: string, accept: boolean) {
    setBusy(id); setErr(null);
    try {
      const r = await respondLinkAction(id, accept);
      if (r.ok) setList((l) => l.filter((x) => x.id !== id));
      else setErr(r.error || "處理失敗");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "處理失敗");
    } finally {
      setBusy(null);
    }
  }

  if (!list.length) return <p className="text-[#a7bacb]">目前沒有待處理的客戶連結申請。</p>;

  return (
    <div className="space-y-3">
      {err && <div className="text-[#ff9b9b] text-sm">⚠ {err}</div>}
      {list.map((rq) => (
        <div key={rq.id} className="rounded-xl bg-[#12334f] border border-white/8 p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[#eef2f7] font-semibold">{rq.clientName}</div>
            {rq.note ? <div className="text-[#a7bacb] text-sm">{rq.note}</div> : null}
            <div className="text-[11px] text-[#6f869c]">想連結你為教練</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => respond(rq.id, true)} disabled={busy === rq.id}
              className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] disabled:opacity-50 px-4 py-2 rounded-lg text-sm">
              {busy === rq.id ? "…" : "接受"}
            </button>
            <button onClick={() => respond(rq.id, false)} disabled={busy === rq.id}
              className="text-[#a7bacb] hover:text-white border border-white/15 px-4 py-2 rounded-lg text-sm">
              婉拒
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
