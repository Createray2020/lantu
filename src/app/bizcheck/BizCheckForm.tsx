"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import SubmitButton from "@/components/ui/SubmitButton";
import Link from "next/link";
import { GATE_Q, GATE_GUIDE, GATE_LAMP, GATE_VETO_INDEX, gateLevelOf, topGaps, MAX_GAPS_AT_ONCE } from "@/lib/bizCheck";
import { readBizDraft, saveBizDraft, clearBizDraft, type BizCheckAnswers } from "@/lib/bizCheckDraft";
import { saveBizCheckAction } from "./actions";

// hydration-safe 的「我在瀏覽器了嗎」。用 useSyncExternalStore 而不是 useEffect+setState：
// 專案的 eslint 有 react-hooks/set-state-in-effect，而且 effect 版本會先閃一次 SSR 的內容。
const noopSubscribe = () => () => {};

// 企業主十題自我檢核（公開頁）。
// 全程純前端計算、不送任何資料到後端——所以訪客可以放心填，我們也沒有蒐集個資。
// 按「開始規劃」才導去註冊，動線與人生護照一致。

const LAMP_STYLE: Record<string, { ring: string; text: string; bg: string }> = {
  green: { ring: "border-ok-solid", text: "text-ok", bg: "bg-ok-solid/20" },
  amber: { ring: "border-brand", text: "text-brand2", bg: "bg-warn-solid/20" },
  red: { ring: "border-danger-solid", text: "text-danger", bg: "bg-danger-solid/25" },
  na: { ring: "border-line", text: "text-tx2", bg: "bg-panel2" },
};

export default function BizCheckForm({ signedIn = false }: { signedIn?: boolean }) {
  const [ans, setAns] = useState<BizCheckAnswers>({});
  const [draftChecked, setDraftChecked] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [needPassport, setNeedPassport] = useState(false);
  const [pending, start] = useTransition();
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // render 期間校正 state（React 允許、也不會像 effect 那樣先閃一幀空白）。
  // 註冊繞一圈回到這一頁時，草稿還在同一個分頁的 sessionStorage 裡，答案就接得回來。
  if (isClient && !draftChecked) {
    setDraftChecked(true);
    const d = readBizDraft();
    if (d) setAns(d);
  }

  const g = gateLevelOf(ans);
  const lamp = GATE_LAMP[g.lv];
  const st = LAMP_STYLE[g.lv];
  const gaps = topGaps(g.noIndexes);
  const done = g.answered === GATE_Q.length;

  const pick = (i: number, v: "是" | "否") =>
    setAns((prev) => {
      const next = { ...prev };
      if (next[i] === v) delete next[i];
      else next[i] = v;
      saveBizDraft(next);
      return next;
    });

  const save = () =>
    start(async () => {
      const r = await saveBizCheckAction(ans);
      if (r.ok) { setStatus("saved"); setErr(null); setNeedPassport(false); clearBizDraft(); }
      else { setErr(r.error); setNeedPassport(!!r.needPassport); }
    });

  const btn = (i: number, v: "是" | "否") => {
    const on = ans[i] === v;
    return (
      <button
        type="button"
        onClick={() => pick(i, v)}
        aria-pressed={on}
        className={`w-[52px] py-1.5 rounded-lg text-13 font-bold border transition-colors ${
          on ? "bg-brand text-onbrand border-brand" : "bg-panel3 text-tx2 border-line hover:border-brand2"
        }`}
      >
        {v}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-panel2 border border-line p-5 sm:p-6 shadow-e1">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <h2 className="font-serif text-lg">十個問題</h2>
          <span className="text-11 text-tx3">已回答 {g.answered} / {GATE_Q.length}　·　約兩分鐘</span>
        </div>

        <ol className="space-y-3">
          {GATE_Q.map((q, i) => (
            <li key={q} className="flex items-start gap-3 border-t border-line pt-3 first:border-0 first:pt-0">
              <span className="font-serif text-13 text-tx3 w-5 shrink-0 pt-1.5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-13 leading-relaxed">
                  {q}
                  {i === GATE_VETO_INDEX && (
                    <span className="ml-2 text-10 text-brand2 border border-brand/50 rounded px-1.5 py-0.5 whitespace-nowrap">
                      有時效性
                    </span>
                  )}
                </p>
                {ans[i] === "否" && (
                  <p className="text-xs text-tx2 mt-1.5 leading-relaxed">
                    → {GATE_GUIDE[i].mean}
                  </p>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">{btn(i, "是")}{btn(i, "否")}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className={`rounded-2xl border p-5 sm:p-6 ${st.ring} ${st.bg}`}>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className={`font-serif text-xl ${st.text}`}>{lamp.title}</h2>
          {done && <span className="text-xs text-tx2">勾「否」{g.no} 題</span>}
        </div>
        <p className="text-13 text-tx mt-2 leading-relaxed">{lamp.note}</p>

        {!done && (
          <p className="text-xs text-tx3 mt-3">
            還有 {GATE_Q.length - g.answered} 題沒回答。十題都答完才會給判定——沒問到的不會被當成沒問題。
          </p>
        )}

        {done && g.no > 0 && (
          <>
            <h3 className="text-xs text-tx2 mt-5 mb-2">
              建議優先處理（最多 {MAX_GAPS_AT_ONCE} 項）
            </h3>
            <ol className="space-y-2.5">
              {gaps.map((x, i) => (
                <li key={x.q} className="rounded-lg bg-field/70 border border-line p-3">
                  <p className="text-13 font-bold text-tx">{i + 1}. {x.mean}</p>
                  <p className="text-xs text-tx2 mt-1 leading-relaxed">{x.next}</p>
                </li>
              ))}
            </ol>
            {g.no > MAX_GAPS_AT_ONCE && (
              <p className="text-xs text-tx3 mt-3">
                你還有 {g.no - MAX_GAPS_AT_ONCE} 項也勾了「否」，但一次處理超過三項通常會癱瘓、不會行動——先把上面三件做完。
              </p>
            )}
          </>
        )}

        {done && g.no === 0 && (
          <p className="text-13 text-tx mt-4">
            十題全是「是」——這在企業主當中相當少見。接下來值得談的是報酬結構最適化、稅務效率與退場規劃。
          </p>
        )}
      </section>

      {done && (
        <section className="rounded-2xl bg-panel2 border border-line p-5 sm:p-6 shadow-e1">
          <h2 className="font-serif text-lg mb-1">下一步</h2>
          <p className="text-13 text-tx2 leading-relaxed mb-4">
            這十題只看得到公私界線。真正能讓你「看見全貌」的，是一張<b className="text-tx">整合式個人資產負債表</b>——
            把公司股權、股東往來與個人連帶保證一起攤開之後，算出你真正可以動用的<b className="text-brand2">流動性淨值</b>。
            多數企業主算完會嚇一跳。
          </p>
          {status === "saved" ? (
            <div className="rounded-lg bg-ok-solid/20 border border-ok-solid p-4">
              <p className="text-13 text-ok font-bold">已存進你的規劃</p>
              <p className="text-xs text-tx mt-1 leading-relaxed">
                企業財務規劃已經在你的規劃裡打開了——之後接上教練時，他會直接看到公司概況、公私勾稽與這份檢核。
              </p>
              <Link href="/portal" className="inline-block mt-3 rounded-lg bg-brand text-onbrand font-bold text-13 px-4 py-2.5 hover:bg-brand2">
                去看我的規劃 →
              </Link>
            </div>
          ) : (
            <>
              {err && (
                <p className="text-xs text-danger mb-3 leading-relaxed">
                  {err}
                  {needPassport && (
                    <Link href="/passport" className="ml-2 underline underline-offset-4 text-brand2">先做人生護照 →</Link>
                  )}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {signedIn ? (
                  <SubmitButton
                    type="button"
                    onClick={save}
                    disabled={pending}
                  
          state={pending ? "pending" : "idle"}
          pendingLabel="存檔中…"
        >
          存進我的規劃
        </SubmitButton>
                ) : (
                  // 帶 redirect_url 繞回這一頁：答案還在同一分頁的 sessionStorage 裡，回來就接得回去
                  <Link
                    href="/client/sign-up?redirect_url=/bizcheck"
                    className="rounded-lg bg-brand text-onbrand font-bold text-13 px-4 py-2.5 hover:bg-brand2"
                  >
                    註冊並存下這份檢核
                  </Link>
                )}
                <Link href="/coaches" className="rounded-lg border border-line2 text-tx2 font-bold text-13 px-4 py-2.5 hover:border-brand2 hover:text-brand2">
                  找一位教練談談
                </Link>
              </div>
            </>
          )}
        </section>
      )}

      <p className="text-11 text-tx3 leading-relaxed">
        本頁全程在你的瀏覽器裡計算，答案只留在這個分頁，關掉就消失——<b>按下「存進我的規劃」才會送出</b>。
        內容為觀念釐清與風險辨識，不構成稅務、法律或投資建議；涉及具體情況請與會計師或律師諮詢。
      </p>
    </div>
  );
}
