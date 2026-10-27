"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidInstanceAction } from "../actions";

export default function VoidButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, start] = useTransition();
  if (!open) return <button type="button" className="text-11 text-tx3 underline" onClick={() => setOpen(true)}>作廢這份</button>;
  return (
    <div className="flex items-center gap-2 text-xs">
      <input className="rounded border border-line bg-field px-2 py-1" placeholder="原因（必填）" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="button" className="rounded border border-danger text-danger px-2 py-1 disabled:opacity-40" disabled={busy || !reason.trim()} onClick={() => start(async () => { const r = await voidInstanceAction(id, reason); if (r.ok) { setOpen(false); router.refresh(); } })}>確認作廢</button>
      <button type="button" className="text-tx3" onClick={() => setOpen(false)}>取消</button>
    </div>
  );
}
