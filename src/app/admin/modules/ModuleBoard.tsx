"use client";

import { useState, useTransition } from "react";
import { setModuleAction } from "./actions";

export type ModuleRowView = {
  key: string;
  label: string;
  area: string;
  effect: string;
  defaultNotice: string;
  enabled: boolean;
  notice: string;
  configured: boolean;
};

export default function ModuleBoard({ rows }: { rows: ModuleRowView[] }) {
  const [state, setState] = useState(rows);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const patch = (key: string, p: Partial<ModuleRowView>) =>
    setState((s) => s.map((r) => (r.key === key ? { ...r, ...p } : r)));

  // 開關與說明文字一起送：說明是「關閉時要顯示什麼」，兩者本來就是同一個決定。
  const save = (row: ModuleRowView, enabled: boolean) => {
    setMsg(null); setErr(null);
    start(async () => {
      const r = await setModuleAction(row.key, enabled, row.notice);
      if (r.ok) {
        patch(row.key, { enabled, configured: true });
        setMsg(`${row.label}已${enabled ? "開啟" : "關閉"}`);
      } else setErr(r.error);
    });
  };

  return (
    <div className="space-y-3">
      {(msg || err) && (
        <div className={`text-sm rounded-lg px-3 py-2 border ${err ? "border-danger text-danger" : "border-ok text-ok"}`}>
          {err ?? msg}
        </div>
      )}

      {state.map((r) => (
        <div key={r.key} className="rounded-xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-bold">{r.label}</h2>
                <span className="text-11 text-tx3 border border-line rounded px-1.5 py-0.5">{r.area}</span>
                <span className={`text-11 font-bold rounded px-1.5 py-0.5 ${r.enabled ? "bg-ok/16 text-ok" : "bg-brand/18 text-brand2"}`}>
                  {r.enabled ? "開啟中" : "關閉中"}
                </span>
              </div>
              <p className="text-sm text-tx2 mt-1.5 leading-relaxed">{r.effect}</p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => save(r, !r.enabled)}
              className={
                "shrink-0 rounded-lg px-3.5 py-2 text-sm font-bold border transition disabled:opacity-50 " +
                (r.enabled
                  ? "border-line text-tx2 hover:bg-panel3 hover:text-tx"
                  : "bg-brand text-onbrand border-brand hover:bg-brand2")
              }
            >
              {r.enabled ? "關閉此模組" : "開啟此模組"}
            </button>
          </div>

          <label className="block mt-3">
            <span className="text-11 text-tx3">關閉時顯示給使用者的說明</span>
            <textarea
              value={r.notice}
              onChange={(e) => patch(r.key, { notice: e.target.value })}
              onBlur={() => start(async () => {
                const cur = state.find((x) => x.key === r.key);
                if (!cur) return;
                const res = await setModuleAction(r.key, cur.enabled, cur.notice);
                if (!res.ok) setErr(res.error);
              })}
              rows={2}
              className="w-full mt-1 bg-field border border-line rounded-lg px-3 py-2 text-sm"
              placeholder={r.defaultNotice}
            />
            <span className="text-11 text-tx3">留空＝使用預設文案「{r.defaultNotice}」</span>
          </label>

          {!r.configured && (
            <p className="text-11 text-tx3 mt-2">
              尚未設定過，目前是系統預設值（{r.enabled ? "開啟" : "關閉"}）。
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
