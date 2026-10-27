"use client";

import { useState, useTransition } from "react";
import { submitFeedbackAction } from "../../caseActions";

export default function FeedbackForm({ id, questions, initial }: { id: string; questions: string[]; initial: { scores: number[]; comment: string } | null }) {
  const [scores, setScores] = useState<number[]>(initial?.scores.length === questions.length ? initial.scores : questions.map(() => 0));
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [done, setDone] = useState(!!initial);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const LABELS = ["很不同意", "不同意", "普通", "同意", "非常同意"];
  return (
    <div className="grid gap-5">
      {questions.map((q, i) => (
        <div key={i} className="rounded-xl border border-line bg-panel2 p-4">
          <div className="text-sm font-bold mb-3">{i + 1}. {q}</div>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" onClick={() => setScores((s) => s.map((x, j) => (j === i ? v : x)))} className={`rounded-lg border px-1 py-2 text-xs ${scores[i] === v ? "border-brand bg-brand/15 text-brand2 font-bold" : "border-line text-tx2 hover:border-brand/50"}`}>
                <div className="text-base font-bold">{v}</div><div className="text-10 truncate">{LABELS[v - 1]}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
      <label className="grid gap-1 text-sm">
        <span className="font-bold">一句話（選填）</span>
        <textarea className="bg-field border border-line2 rounded px-3 py-2 text-sm min-h-24" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="最有感的地方、或希望我們改進的事" />
      </label>
      {err && <p className="text-danger text-sm">{err}</p>}
      {done && <p className="text-sm text-ok">已收到你的回饋，謝謝。你隨時可以回來修改。</p>}
      <button className="justify-self-start font-bold text-onbrand bg-brand hover:bg-brand2 px-6 py-2.5 rounded-lg text-sm disabled:opacity-40" disabled={pending || scores.some((s) => !s)} onClick={() => start(async () => { setErr(""); const r = await submitFeedbackAction(id, scores, comment); if (!r.ok) setErr(r.error); else setDone(true); })}>
        {pending ? "送出中…" : done ? "更新回饋" : "送出回饋"}
      </button>
    </div>
  );
}
