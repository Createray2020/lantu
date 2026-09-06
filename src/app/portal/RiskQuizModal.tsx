"use client";

// 客戶端的投資風險屬性測驗浮動框（2026/09/01）。
//
// Ray：「投資屬性問卷勾選給客戶可以填，有『邀請客戶填寫』的按鈕然後送出，
//       客戶端用跳出浮動框。」
//
// ⚠️ 題庫走 src/lib/riskQuiz.ts 的鏡像（真正的題目活在 lantu-app.html，
//    由 riskQuiz.drift.test.ts 逐字比對兩邊）。這裡只負責畫與收答案。
// ⚠️ 只送選項索引，分數與等級由伺服器重算——前端不算分、也不顯示「你會是幾分」，
//    免得客戶為了拿到某個等級回頭改答案。
// ⚠️ 關掉不等於拒絕：待辦清單上那一則還在，隨時可以再開（onReopen 由首頁提供）。
import { useState } from "react";
import SubmitButton from "@/components/ui/SubmitButton";
import Modal from "@/components/ui/Modal";
import { RISK_QUESTIONS } from "@/lib/riskQuiz";
import { submitMyRiskQuizAction } from "./actions";

type Answers = Record<string, number | number[]>;

export default function RiskQuizModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [ans, setAns] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ score: number; tier: string } | null>(null);

  if (!open) return null;

  const answered = RISK_QUESTIONS.filter((_, i) => {
    const v = ans[String(i)];
    return Array.isArray(v) ? v.length > 0 : v != null;
  }).length;
  const all = RISK_QUESTIONS.length;

  function pick(qi: number, oi: number, multi: boolean) {
    setErr(null);
    setAns((prev) => {
      const key = String(qi);
      if (!multi) return { ...prev, [key]: oi };
      const cur = Array.isArray(prev[key]) ? (prev[key] as number[]) : [];
      const next = cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi].sort((a, b) => a - b);
      const out = { ...prev };
      if (next.length) out[key] = next;
      else delete out[key];
      return out;
    });
  }

  function isOn(qi: number, oi: number) {
    const v = ans[String(qi)];
    return Array.isArray(v) ? v.includes(oi) : v === oi;
  }

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const r = await submitMyRiskQuizAction(ans);
      if (r.ok) setDone({ score: r.score, tier: r.tier });
      else setErr(r.error);
    } catch {
      setErr("送出失敗，請稍後再試一次。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="riskQuizTitle" width="max-w-[680px]">
      <div>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="flex-1">
            <div id="riskQuizTitle" className="text-15 font-bold text-brand2">投資風險屬性測驗</div>
            <div className="text-11 text-tx2">
              {done ? "已完成" : `${all} 題 · 約 5 分鐘 · 已作答 ${answered}／${all}`}
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-line2 px-3 py-1.5 text-xs text-tx2 hover:text-tx"
          >
            {done ? "關閉" : "稍後再填"}
          </button>
        </div>

        {done ? (
          <div className="px-6 py-8 text-center">
            <div className="text-13 text-tx2">你的風險屬性是</div>
            <div className="my-2 font-serif text-3xl text-brand2">{done.tier}</div>
            <div className="text-xs text-tx2">{done.score} / 60 分</div>
            <p className="mx-auto mt-4 max-w-[440px] text-xs leading-relaxed text-tx3">
              這份結果會提供給你的教練，作為討論投資報酬率假設與資產配置方向的依據。
              <b className="text-tx2">屬性沒有好壞</b>——它只是說明你能睡得著的波動有多大。
            </p>
          </div>
        ) : (
          <>
            <div className="max-h-[62dvh] overflow-auto px-5 py-4">
              <p className="mb-4 rounded-lg bg-tx/5 px-3 py-2.5 text-xs leading-relaxed text-tx2">
                題目裡的「這一筆資金」是<b className="text-brand2">假設情境</b>——
                問的是「如果要做長期配置，你會怎麼選」，不代表你現在要投入任何一筆錢。
                沒有投資經驗也可以完整作答。
              </p>
              {RISK_QUESTIONS.map((q, qi) => (
                <div key={qi} className="mb-5">
                  <div className="mb-1 text-13 font-bold text-tx">
                    <span className="mr-1.5 text-brand2">{qi + 1}.</span>
                    {q.q}
                  </div>
                  {q.hint && <div className="mb-2 text-11 text-tx3">{q.hint}</div>}
                  <div className="flex flex-wrap gap-2">
                    {q.o.map((o, oi) => (
                      <button
                        key={oi}
                        onClick={() => pick(qi, oi, !!q.multi)}
                        className={
                          "rounded-full border px-3 py-1.5 text-xs font-bold " +
                          (isOn(qi, oi)
                            ? "border-brand bg-brand text-onbrand"
                            : "border-line2 bg-tx/5 text-tx2 hover:border-brand/60")
                        }
                      >
                        {isOn(qi, oi) ? "✓ " : ""}
                        {o[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
              {err && <span className="text-xs text-danger">⚠ {err}</span>}
              <span className="flex-1" />
              <span className="text-xs text-tx3">
                {answered < all ? `還有 ${all - answered} 題` : "全部答完了"}
              </span>
              <SubmitButton
                disabled={busy || answered < all}
                onClick={send}
              
          state={busy ? "pending" : "idle"}
          pendingLabel="送出中…"
        >
          送出
        </SubmitButton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
