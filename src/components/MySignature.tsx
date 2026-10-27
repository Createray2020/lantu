"use client";

import { useState, useTransition } from "react";
import SignaturePad from "./SignaturePad";
import { saveMySignatureAction } from "@/app/sign/[id]/actions";

// 我的簽名檔：預存一份，簽署時可直接選用。存了不代表同意任何文件——每份仍要本人勾選確認。
export default function MySignature({ saved }: { saved: string | null }) {
  const [img, setImg] = useState<string | null>(saved);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function save(next: string | null) {
    setMsg(null);
    start(async () => {
      const r = await saveMySignatureAction(next);
      if (r.ok) {
        setImg(next);
        setEditing(false);
        setDraft(null);
        setMsg(next ? "已儲存簽名檔" : "已移除簽名檔");
      } else setMsg(r.error ?? "失敗");
    });
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4 grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">我的簽名檔</h2>
        {msg && <span className="text-xs text-tx2">{msg}</span>}
      </div>
      <p className="text-xs text-tx3">預存一份，簽文件時可以直接選用。存了不等於同意任何文件——每一份仍要你本人確認。</p>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-52 h-24 rounded-md border border-line bg-white grid place-items-center overflow-hidden">
            {img ? <img src={img} alt="我的簽名" className="max-h-20 max-w-48 object-contain" /> : <span className="text-xs text-tx3">尚未建立</span>}
          </div>
          <div className="flex gap-2 text-sm">
            <button type="button" className="rounded-md border border-line px-3 py-1.5" onClick={() => setEditing(true)}>{img ? "重新簽一份" : "建立簽名檔"}</button>
            {img && <button type="button" className="text-danger px-2" disabled={busy} onClick={() => save(null)}>移除</button>}
          </div>
        </div>
      ) : (
        <div className="grid gap-2 max-w-md">
          <SignaturePad value={draft} onChange={setDraft} disabled={busy} />
          <div className="flex gap-2 text-sm">
            <button type="button" className="rounded-md bg-brand text-onbrand font-bold px-3 py-1.5 disabled:opacity-40" disabled={!draft || busy} onClick={() => save(draft)}>儲存為我的簽名檔</button>
            <button type="button" className="text-tx2 px-2" onClick={() => { setEditing(false); setDraft(null); }}>取消</button>
          </div>
        </div>
      )}
    </section>
  );
}
