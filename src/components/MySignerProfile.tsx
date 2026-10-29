"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SignerProfileForm, { emptyProfile, profileComplete, type ProfileDraft } from "@/components/SignerProfileForm";
import { saveMyProfileAction } from "@/app/dashboard/apply/actions";

// 我的文件 › 簽約資料（LT12，2026/10/29）：已開通教練補簽合約要帶入的身分證／電話／地址等，在這裡填一次、自己維護。
// 存檔後，還沒有任何人簽過的補簽文件會用新資料重產；已簽完的文件不改寫。
export default function MySignerProfile({ initial, email }: { initial: ProfileDraft | null; email: string }) {
  const router = useRouter();
  const [p, setP] = useState<ProfileDraft>(initial ?? emptyProfile({ email }));
  const [open, setOpen] = useState(!initial || !profileComplete(initial));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const save = () => start(async () => {
    setMsg(null);
    const r = await saveMyProfileAction(p);
    if (r.ok) { setMsg("已儲存；還沒有人簽的文件已帶入新資料"); setOpen(false); router.refresh(); } else setMsg(r.error);
  });
  const done = !!initial && profileComplete(initial);
  return (
    <section className="rounded-lg border border-line bg-panel p-4 grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">簽約資料 {done ? <span className="text-ok font-normal text-xs">已填齊</span> : <span className="text-brand2 font-normal text-xs">待填</span>}</h2>
        {!open && <button type="button" className="text-xs rounded-md border border-line px-2.5 py-1" onClick={() => setOpen(true)}>修改</button>}
      </div>
      <p className="text-xs text-tx2">合約上的身分證／護照、電話、通訊地址、發票等從這裡帶入，簽署時只需要簽名。改了之後，還沒有人簽過的文件會用新資料重新產生；已簽完的文件不會改。</p>
      {open ? (
        <div className="grid gap-2">
          <SignerProfileForm value={p} onChange={setP} disabled={busy} />
          <div className="flex gap-2 text-sm">
            <button type="button" className="rounded-md bg-brand text-onbrand font-bold px-3 py-1.5 disabled:opacity-40" disabled={busy || !profileComplete(p)} onClick={save}>儲存簽約資料</button>
            {initial && <button type="button" className="text-tx2 px-2" onClick={() => { setP(initial); setOpen(false); }}>取消</button>}
          </div>
          {!profileComplete(p) && <p className="text-11 text-tx3">身分證／護照、出生日期、電話、Email、地址都要填；公司發票要統編與抬頭。</p>}
        </div>
      ) : initial ? (
        <dl className="text-xs text-tx2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt>身分證／護照</dt><dd>{initial.idNo || "—"}</dd>
          <dt>電話／Email</dt><dd>{initial.phone || "—"}　{initial.email || "—"}</dd>
          <dt>通訊地址</dt><dd>{initial.address || "—"}</dd>
        </dl>
      ) : null}
      {msg && <p className="text-xs text-tx2">{msg}</p>}
    </section>
  );
}
