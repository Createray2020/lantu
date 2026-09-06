import type { ApplyStep } from "@/lib/coachApply";

// 報聘三段進度的畫法。教練端的待開通頁（PendingNotice）與客戶端首頁（portal/CoachEntry）
// 共用同一個外觀，這樣同一件事在兩個介面看起來就是同一件事。
// 步驟本身由 lib/coachApply.ts 的 applySteps() 產生，這裡只負責畫。
export default function ApplyStepList({ steps }: { steps: ApplyStep[] }) {
  return (
    <ol className="grid gap-2">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <span
            className="mt-[2px] w-4 h-4 rounded-full grid place-items-center text-10 font-bold shrink-0"
            style={{
              background: s.bad ? "color-mix(in srgb, var(--warn) 13%, transparent)" : s.done ? "color-mix(in srgb, var(--ok) 13%, transparent)" : "color-mix(in srgb, var(--tx) 6%, transparent)",
              color: s.bad ? "var(--warn)" : s.done ? "var(--ok)" : "var(--tx3)",
            }}
          >
            {s.bad ? "!" : s.done ? "✓" : i + 1}
          </span>
          <span className={s.done ? "text-tx2" : s.bad ? "text-warn" : "text-tx3"}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
