"use client";

// 客戶端回饋問卷。題目來自制度設定，所以公司改題目不用改這支程式。

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitClientSurveyAction } from "./actions";

export type SurveyCase = {
  id: string;
  clientName: string;
  moduleName: string;
  signedAt: string | null;
  surveyAt: string | null;
  answers: string[] | null;
  marketingOptIn: boolean;
};

export default function SurveyForm({
  cases, questions, marketingEnabled,
}: {
  cases: SurveyCase[];
  questions: string[];
  marketingEnabled: boolean;
}) {
  const pending = cases.filter((c) => !c.surveyAt);
  const done = cases.filter((c) => c.surveyAt);

  return (
    <div className="space-y-6">
      {pending.length === 0 && done.length === 0 && (
        <p className="text-[#a7bacb] text-sm">
          目前沒有需要填寫的回饋問卷。完成諮詢後，這裡會出現一份問卷。
        </p>
      )}

      {pending.map((c) => (
        <OneSurvey key={c.id} c={c} questions={questions} marketingEnabled={marketingEnabled} />
      ))}

      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-[#a7bacb] mb-2">已完成</h2>
          <div className="space-y-2">
            {done.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-[#0d2b45] px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{c.moduleName || "顧問服務"}</span>
                  <span className="text-xs text-[#6f869c]">{c.signedAt ?? ""}</span>
                  <span className="text-xs text-[#7fb894]">已於 {c.surveyAt} 回覆 ✓</span>
                </div>
                {c.answers?.some(Boolean) && (
                  <ul className="mt-2 space-y-1 text-xs text-[#a7bacb]">
                    {questions.map((q, i) => (
                      c.answers?.[i] ? <li key={i}><b className="text-[#cfdcea]">{q}</b>：{c.answers[i]}</li> : null
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OneSurvey({
  c, questions, marketingEnabled,
}: {
  c: SurveyCase; questions: string[]; marketingEnabled: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<string[]>(questions.map((_, i) => c.answers?.[i] ?? ""));
  const [optIn, setOptIn] = useState(c.marketingOptIn);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const filled = answers.some((a) => a.trim());

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0d2b45] p-5">
      <div className="flex flex-wrap items-baseline gap-2 mb-1">
        <h2 className="font-semibold text-base">{c.moduleName || "顧問服務"}</h2>
        {c.signedAt && <span className="text-xs text-[#6f869c]">{c.signedAt}</span>}
      </div>
      <p className="text-xs text-[#7f9ab2] mb-4">
        三個問題，想到什麼寫什麼就好。你的回覆會直接回到為你服務的顧問手上。
      </p>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <label key={i} className="block">
            <span className="block text-sm text-[#cfdcea] mb-1">{i + 1}. {q}</span>
            <textarea
              rows={3}
              value={answers[i] ?? ""}
              disabled={pending}
              onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))}
              className="w-full rounded-lg bg-[#081a2b] border border-white/15 px-3 py-2 text-sm text-[#eef2f7] outline-none focus:border-[#c99a5b] leading-relaxed"
            />
          </label>
        ))}
      </div>

      {marketingEnabled && (
        <label className="flex items-start gap-2 mt-4 text-sm">
          <input type="checkbox" checked={optIn} disabled={pending}
            onChange={(e) => setOptIn(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[#c99a5b]" />
          <span className="text-[#a7bacb]">
            我同意上述回饋可作為嵐途與顧問的服務見證使用（不勾選不影響任何權益）
          </span>
        </label>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !filled}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const r = await submitClientSurveyAction({
                caseId: c.id, questions, answers, marketingOptIn: optIn,
              });
              setMsg(r.ok ? { ok: true, text: "已送出，謝謝你的回饋" } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            });
          }}
          className="rounded-lg bg-[#c99a5b] text-[#08202a] font-bold px-4 py-2 text-sm disabled:opacity-40"
        >
          {pending ? "送出中…" : "送出回饋"}
        </button>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-[#7fb894]" : "text-[#e08b7a]"}`}>
            {msg.ok ? msg.text : `送出失敗：${msg.text}`}
          </span>
        )}
      </div>
    </section>
  );
}
