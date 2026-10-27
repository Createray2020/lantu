"use client";

// 「教練邀請你填投資風險屬性測驗」的入口。
//
// 被邀請時一進首頁就跳浮動框；關掉之後留一條橫幅隨時可以再開
// ——關掉不等於拒絕，那則待辦也還在清單上。
// 2026/10/27 B-2：本人／配偶各一份（教練可只邀其中一份）；兩份都待填時先跳本人，橫幅各一條。
import { useState } from "react";
import RiskQuizModal from "./RiskQuizModal";
import type { QuizWho } from "@/lib/riskQuizTodo";

type Invited = { self: boolean; spouse: boolean };

export default function RiskQuizGate({ invited }: { invited: Invited | boolean }) {
  const inv: Invited = typeof invited === "boolean" ? { self: invited, spouse: false } : invited;
  const [open, setOpen] = useState<QuizWho | null>(inv.self ? "self" : inv.spouse ? "spouse" : null);
  const [dismissed, setDismissed] = useState<Record<QuizWho, boolean>>({ self: false, spouse: false });

  if (!inv.self && !inv.spouse) return null;

  const banner = (who: QuizWho) =>
    inv[who] && open !== who && !dismissed[who] ? (
      <div key={who} className="mx-auto mb-6 flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-brand/10 px-5 py-4">
        <span className="flex-1 text-sm text-brand2">
          {who === "spouse" ? (
            <>你的教練邀請你<b>替配偶</b>完成<b>投資風險屬性測驗</b>，12 題約 5 分鐘——請以配偶的想法作答。</>
          ) : (
            <>你的教練邀請你完成<b>投資風險屬性測驗</b>，12 題約 5 分鐘。</>
          )}
        </span>
        <button
          onClick={() => setOpen(who)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-onbrand hover:bg-brand2"
        >
          開始填寫
        </button>
        <button
          onClick={() => setDismissed((d) => ({ ...d, [who]: true }))}
          className="text-xs text-tx2 underline underline-offset-[3px] hover:text-tx"
        >
          先不要
        </button>
      </div>
    ) : null;

  return (
    <>
      {banner("self")}
      {banner("spouse")}
      {open && <RiskQuizModal key={open} open who={open} onClose={() => setOpen(null)} />}
    </>
  );
}
