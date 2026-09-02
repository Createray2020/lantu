import type { ApplyStep } from "@/lib/coachApply";

// 報聘三段進度的畫法。教練端的待開通頁（PendingNotice）與客戶端首頁（portal/CoachEntry）
// 共用同一個外觀，這樣同一件事在兩個介面看起來就是同一件事。
// 步驟本身由 lib/coachApply.ts 的 applySteps() 產生，這裡只負責畫。
export default function ApplyStepList({ steps }: { steps: ApplyStep[] }) {
  return (
    <ol className="grid gap-2">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-[12px]">
          <span
            className="mt-[2px] w-4 h-4 rounded-full grid place-items-center text-[9px] font-bold shrink-0"
            style={{
              background: s.bad ? "#e0a25b22" : s.done ? "#7fd1a822" : "#ffffff10",
              color: s.bad ? "#e0a25b" : s.done ? "#7fd1a8" : "#6f869c",
            }}
          >
            {s.bad ? "!" : s.done ? "✓" : i + 1}
          </span>
          <span className={s.done ? "text-[#a9bccf]" : s.bad ? "text-[#e0a25b]" : "text-[#6f869c]"}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
