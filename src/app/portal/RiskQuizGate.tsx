"use client";

// 「教練邀請你填投資風險屬性測驗」的入口。
//
// 被邀請時一進首頁就跳浮動框；關掉之後留一條橫幅隨時可以再開
// ——關掉不等於拒絕，那則待辦也還在清單上。
import { useState } from "react";
import RiskQuizModal from "./RiskQuizModal";

export default function RiskQuizGate({ invited }: { invited: boolean }) {
  const [open, setOpen] = useState(invited);
  const [dismissed, setDismissed] = useState(false);

  if (!invited) return null;

  return (
    <>
      {!open && !dismissed && (
        <div className="mx-auto mb-6 flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border border-[#c99a5b]/40 bg-[#c99a5b]/10 px-5 py-4">
          <span className="flex-1 text-sm text-[#e0bd8b]">
            你的教練邀請你完成<b>投資風險屬性測驗</b>，12 題約 5 分鐘。
          </span>
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-[#c99a5b] px-4 py-2 text-sm font-bold text-[#08202a] hover:bg-[#e0bd8b]"
          >
            開始填寫
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-[12.5px] text-[#a7bacb] underline underline-offset-[3px] hover:text-white"
          >
            先不要
          </button>
        </div>
      )}
      <RiskQuizModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
