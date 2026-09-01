"use client";

// 客戶財務儀表板的顯示開關（全平台）。
//
// 2026/09/01 起這裡有 30 個以上的模組（總覽 6 ＋ 教練端分析 21 ＋ 建議 5），
// 所以分成三群、每群有「全開／全關」，不然一整排勾不完。
// ⚠️ 受控元件＋明確的存檔回饋：Server Component 內嵌 form + defaultValue 那一套
//    會出現「選了存不進去」的錯覺（見專案記憶「後台存檔UI同步」）。
import { useState, useTransition } from "react";
import {
  CLIENT_DASH_GROUPS, CLIENT_DASH_MODULES, dashModulesOf, type ClientDashGroup,
} from "@/lib/clientDashModules";
import { saveClientDashAction, resetClientDashAction } from "./actions";

const GROUP_NOTE: Record<ClientDashGroup, string> = {
  總覽: "客戶登入後第一眼看到的那幾塊。",
  分析: "教練端「分析」分頁的同一批模組，客戶端用一樣的收合卡片呈現，點開才載入。",
  建議: "教練端「建議」分頁的同一批模組。這一群帶著教練的判斷與行動清單，要不要先當面講完再開放，由你決定。",
};

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

  function setGroup(g: ClientDashGroup, on: boolean) {
    setMsg(null);
    setOff((p) => {
      const next = { ...p };
      for (const m of dashModulesOf(g)) next[m.k] = !on;
      return next;
    });
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
      {CLIENT_DASH_GROUPS.map((g) => {
        const mods = dashModulesOf(g);
        const onN = mods.filter((m) => !off[m.k]).length;
        return (
          <section key={g} className="mb-5">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h2 className="text-[15px] font-bold text-[#e0bd8b]">{g}</h2>
              <span className="text-[12px] text-[#8aa0b3]">
                {onN} / {mods.length} 塊顯示
              </span>
              <span className="flex-1" />
              <button
                onClick={() => setGroup(g, true)}
                className="text-[12px] text-[#a9bccf] border border-white/15 rounded-md px-2.5 py-1 hover:text-white"
              >
                本群全開
              </button>
              <button
                onClick={() => setGroup(g, false)}
                className="text-[12px] text-[#a9bccf] border border-white/15 rounded-md px-2.5 py-1 hover:text-white"
              >
                本群全關
              </button>
            </div>
            <p className="text-[12px] text-[#8aa0b3] mb-2 leading-relaxed">{GROUP_NOTE[g]}</p>
            <div className="rounded-xl border border-white/10 bg-[#0d2b45] overflow-hidden">
              {mods.map((m) => (
                <label
                  key={m.k}
                  className="flex items-start gap-3 px-4 py-2.5 border-b border-white/8 last:border-b-0 cursor-pointer"
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
                    {m.cond && <span className="ml-2 text-[11px] text-[#c99a5b] align-middle">{m.cond}</span>}
                    <span className="block text-[11.5px] text-[#8aa0b3] mt-0.5 leading-relaxed">{m.d}</span>
                  </span>
                  <span className={`text-[11.5px] shrink-0 mt-[3px] ${off[m.k] ? "text-[#6b7d8f]" : "text-[#8ba888]"}`}>
                    {off[m.k] ? "不顯示" : "顯示"}
                  </span>
                </label>
              ))}
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 sticky bottom-0 bg-[#081a2b] py-3 border-t border-white/10">
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
