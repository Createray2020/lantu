"use client";

import { useState } from "react";
import { respondIntroductionAction } from "./actions";

export type Intro = {
  coachId: string;
  applicantName: string | null;
  applicantEmail: string | null;
  phone: string | null;
  currentJob: string | null;
  motive: string | null;
};

// 推薦人端：有人填了你的教練編號報聘，你在這裡確認推薦或婉拒。
//
// ⚠️ 這一關不是形式：確認過的申請才進得了審核（後台可設定是否強制）。
//    所以畫面上要把「他為什麼想來、現在在做什麼」直接攤開，不能只有一個名字。
export default function IntroductionList({ intros }: { intros: Intro[] }) {
  const [list, setList] = useState<Intro[]>(intros);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  async function respond(coachId: string, action: "confirm" | "decline") {
    setBusy(coachId);
    setErr(null);
    try {
      const r = await respondIntroductionAction(coachId, action, note[coachId] ?? "");
      if (r && r.ok) setList((l) => l.filter((x) => x.coachId !== coachId));
      else setErr((r && r.error) || "處理失敗，請重新整理後再試一次。");
    } finally {
      setBusy(null);
    }
  }

  if (!list.length) return <p className="text-tx2">目前沒有待你確認的報聘申請。</p>;

  return (
    <div className="space-y-3">
      {err && <div className="text-danger text-sm">⚠ {err}</div>}
      {list.map((it) => (
        <div key={it.coachId} className="rounded-xl bg-panel2 border border-line p-4 shadow-e1">
          <div className="text-tx font-semibold">{it.applicantName || "（未命名）"}</div>
          <div className="text-[11px] text-tx3">
            {[it.applicantEmail, it.phone].filter(Boolean).join("｜") || "（未留聯絡方式）"}
          </div>
          {it.currentJob && <div className="text-tx2 text-sm mt-2">現況：{it.currentJob}</div>}
          {it.motive && (
            <div className="text-tx2 text-sm mt-1 whitespace-pre-wrap">報聘動機：{it.motive}</div>
          )}
          <p className="mt-3 text-[11px] text-tx3 leading-relaxed">
            按「確認推薦」代表：此申請人確實由你推薦，並同意其進入後續嵐途審核流程。
          </p>
          <textarea
            className="mt-3 w-full bg-field border border-line2 rounded-md text-sm px-3 py-2 text-tx placeholder:text-tx3"
            rows={2}
            value={note[it.coachId] ?? ""}
            onChange={(e) => setNote((n) => ({ ...n, [it.coachId]: e.target.value }))}
            placeholder="給審核者的一句話（選填）：你怎麼認識他、推薦的理由"
          />
          <div className="flex gap-2 mt-2 justify-end">
            <button
              onClick={() => respond(it.coachId, "confirm")}
              disabled={busy === it.coachId}
              className="font-bold text-onbrand bg-brand hover:bg-brand2 disabled:opacity-50 px-4 py-2 rounded-lg text-sm"
            >
              {busy === it.coachId ? "…" : "確認推薦"}
            </button>
            <button
              onClick={() => respond(it.coachId, "decline")}
              disabled={busy === it.coachId}
              className="text-tx2 hover:text-tx border border-line2 px-4 py-2 rounded-lg text-sm"
            >
              不是我推薦的
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
