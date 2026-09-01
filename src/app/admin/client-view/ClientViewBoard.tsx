"use client";

// 客戶財務儀表板的顯示開關（全平台）。
// ⚠️ 受控元件＋明確的存檔回饋：Server Component 內嵌 form + defaultValue 那一套
//    會出現「選了存不進去」的錯覺（見專案記憶「後台存檔UI同步」）。
import { useState, useTransition } from "react";
import { CLIENT_DASH_MODULES } from "@/lib/clientDashModules";
import { saveClientDashAction, resetClientDashAction } from "./actions";

export default function ClientViewBoard({ hidden }: { hidden: string[] }) {
  const [off, setOff] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const k of hidden) o[k] = true;
    return o;
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(k: string) {
    setMsg(null);
    setOff((p) => ({ ...p, [k]: !p[k] }));
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveClientDashAction(Object.keys(off).filter((k) => off[k]));
      setMsg(r.ok ? "已儲存——客戶下次打開就是這一份。" : r.error);
    });
  }

  function reset() {
    setMsg(null);
    start(async () => {
      const r = await resetClientDashAction();
      if (r.ok) { setOff({}); setMsg("已回到系統內建：全部顯示。"); }
      else setMsg(r.error);
    });
  }

  const onCount = CLIENT_DASH_MODULES.filter((m) => !off[m.k]).length;

  return (
    <div>
      <div className="rounded-xl border border-white/10 bg-[#0d2b45] overflow-hidden">
        {CLIENT_DASH_MODULES.map((m) => (
          <label
            key={m.k}
            className="flex items-start gap-3 px-4 py-3 border-b border-white/8 last:border-b-0 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={!off[m.k]}
              onChange={() => toggle(m.k)}
              className="mt-[3px] w-[17px] h-[17px] accent-[#c99a5b] shrink-0"
            />
            <span className="flex-1 min-w-0">
              <span className={`text-[13.5px] font-bold ${off[m.k] ? "text-[#6b7d8f]" : "text-[#eef2f7]"}`}>
                {m.t}
              </span>
              <span className="block text-[12px] text-[#8aa0b3] mt-0.5 leading-relaxed">{m.d}</span>
            </span>
            <span className={`text-[11.5px] shrink-0 mt-[3px] ${off[m.k] ? "text-[#6b7d8f]" : "text-[#8ba888]"}`}>
              {off[m.k] ? "不顯示" : "顯示"}
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-[#c99a5b] px-5 py-2 text-sm font-bold text-[#08202a] disabled:opacity-50 hover:bg-[#e0bd8b]"
        >
          {pending ? "儲存中…" : "儲存"}
        </button>
        <button
          onClick={reset}
          disabled={pending}
          className="rounded-lg border border-white/20 px-4 py-2 text-[13px] text-[#a9bccf] disabled:opacity-50 hover:text-white"
        >
          回到系統內建（全部顯示）
        </button>
        <span className="text-[12.5px] text-[#8aa0b3]">
          目前 {onCount} / {CLIENT_DASH_MODULES.length} 塊會顯示給客戶
        </span>
        {msg && <span className="text-[12.5px] text-[#e0bd8b]">{msg}</span>}
      </div>
    </div>
  );
}
