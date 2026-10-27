"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClientInviteAction } from "./loginActions";

export type ClientLoginInfo = {
  /** 已接上登入帳號＝已開通 */
  linked: boolean;
  email: string | null;
  lastLoginAt: string | null;
  /** 目前有效（未用）的專用碼；重整頁面後還看得到同一條連結 */
  pendingCode: string | null;
};

// 客戶專用登入連結面板（只有主責教練看得到）。
// 做完規劃 → 產一條連結傳給客戶 → 客戶註冊／登入後直接接到這一筆，登入 /portal 看到的就是教練軌投影。
// 一人一碼、綁定後失效；「重新產生」會作廢舊碼。
export default function ClientLogin({
  clientId,
  info,
  readOnly = false,
}: {
  clientId: string;
  info: ClientLoginInfo;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(info.pendingCode);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 連結要帶完整網域；伺服端沒有 window，先給空字串，水合後補上（避免 effect 裡 setState）。
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const link = code ? `${origin}/portal/join?code=${code}` : null;

  function gen() {
    setErr(null); setCopied(false);
    start(async () => {
      const r = await createClientInviteAction(clientId);
      if (r.ok) { setCode(r.code); router.refresh(); }
      else setErr(r.error);
    });
  }

  return (
    <section className="mt-3 bg-panel border border-line rounded-xl shadow-e1">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
        <span className="text-sm font-bold text-tx">客戶登入</span>
        <span className={"text-11 px-2 py-0.5 rounded-full border shadow-e1 " + (info.linked ? "border-ok/50 text-ok bg-ok/10" : "bg-panel text-tx2 border-line")}>
          {info.linked ? "已開通" : code ? "連結已產生・待客戶開啟" : "未開通"}
        </span>
        <div className="flex-1" />
        <span className="text-tx3 text-xs">{open ? "收合 ▲" : "展開 ▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 grid gap-3 border-t border-line pt-3">
          {info.linked ? (
            <div className="text-sm text-tx2">
              這位客戶已用 <b className="text-tx">{info.email ?? "（無 email）"}</b> 登入，前台「人生護照」顯示的是你這裡的規劃。
              {info.lastLoginAt && <span className="text-tx3 text-xs ml-2">最後登入 {info.lastLoginAt}</span>}
            </div>
          ) : (
            <>
              <p className="text-xs text-tx2">
                把這條連結傳給客戶；他註冊或登入客戶帳號後，會直接接到<b className="text-brand2">這一筆規劃</b>，
                不會另外長出一位新客戶。一人一碼，開啟綁定後就失效；重新產生會讓舊連結作廢。
              </p>
              {link ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <input readOnly value={link} onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-[220px] bg-field border border-line rounded-lg px-3 py-2 text-sm text-tx" />
                  <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}
                    className="text-onbrand bg-brand hover:bg-brand2 px-4 py-2 rounded-lg text-sm font-bold">
                    {copied ? "已複製 ✓" : "複製"}
                  </button>
                  <button onClick={gen} disabled={readOnly || pending}
                    className="text-tx2 hover:text-tx border border-line2 px-3 py-2 rounded-lg text-sm disabled:opacity-50">
                    重新產生
                  </button>
                </div>
              ) : (
                <div>
                  <button onClick={gen} disabled={readOnly || pending}
                    className="px-3 py-1.5 text-sm font-bold rounded-md bg-brand text-onbrand disabled:opacity-40 disabled:cursor-not-allowed">
                    {pending ? "產生中…" : "產生客戶登入連結"}
                  </button>
                </div>
              )}
              {err && <div className="text-danger text-sm">⚠ {err}</div>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
