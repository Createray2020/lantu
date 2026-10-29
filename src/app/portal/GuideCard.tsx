import Link from "next/link";
import { CLAIM_ENTRY_LABEL, guideDone, type PortalGuideState } from "@/lib/inviteMessage";

// 客戶首頁「我的進度」（2026/10/29 Ray：「頁面上做引導，讓我們不用特別通知，就可以照著流程走」）。
// 三條路（自己先玩→選教練／教練先邀請→填護照／教練做好規劃→接上）都走同一條三步驟：
//   ① 建立帳號 ② 連結教練 ③ 看教練的規劃
// 每一態只給一個主要動作；接上教練規劃之後整張收起（首頁改由服務進度與規劃本身說話）。
const STEPS = ["建立帳號", "連結教練", "看教練的規劃"];

export default function GuideCard({ state, coachName }: { state: PortalGuideState; coachName: string | null }) {
  if (state === "done") return null;
  const done = guideDone(state);
  const coach = coachName ? `${coachName} 教練` : "你的教練";

  const body: Record<Exclude<PortalGuideState, "done">, { title: string; text: string; primary?: { href: string; label: string }; secondary?: { href: string; label: string } }> = {
    start: {
      title: "歡迎！你可以從這兩種方式開始",
      text: "還沒有教練？先用「人生護照」花 10 分鐘看看自己能達成什麼。教練已經給你連結或開通碼？直接接上教練為你準備的規劃。",
      primary: { href: "/portal/passport", label: "自己先試算人生護照" },
      secondary: { href: "/portal/claim", label: `🔑 ${CLAIM_ENTRY_LABEL}` },
    },
    need_coach: {
      title: "下一步：找一位教練，把規劃做深",
      text: "人生護照只是起點。補上現況、看缺口，再選一位教練送出連結；教練接受後就能一起規劃。",
      primary: { href: "/portal/setup", label: "去選一位教練" },
      secondary: { href: "/portal/claim", label: `🔑 ${CLAIM_ENTRY_LABEL}` },
    },
    waiting: {
      title: `已送出給 ${coach}，等待接受`,
      text: "教練接受後，這裡會自動更新，你不用再做什麼。想先調整人生護照也可以。",
      secondary: { href: "/portal/passport", label: "調整人生護照" },
    },
    fill_passport: {
      title: `已連結 ${coach}`,
      text: "下一步：填寫「人生護照」（大約 10 分鐘）。教練會從你填的內容開始幫你規劃。",
      primary: { href: "/portal/passport", label: "開始填人生護照" },
    },
    coach_preparing: {
      title: `${coach} 正在準備你的規劃`,
      text: "教練整理好之後會出現在這裡，你登入就能看到。",
    },
  };
  const b = body[state];

  return (
    <section className="max-w-2xl mx-auto mb-8 rounded-2xl border border-brand/30 bg-panel2 px-5 py-5 shadow-e1">
      {/* 三步驟進度條 */}
      <ol className="flex items-center gap-2 mb-4 text-11">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const isDone = n <= done;
          const isNow = n === done + 1;
          return (
            <li key={label} className="flex items-center gap-2 flex-1 min-w-0">
              <span className={`w-6 h-6 shrink-0 rounded-full grid place-items-center font-bold ${isDone ? "bg-ok-solid text-onsolid" : isNow ? "bg-brand text-onbrand" : "bg-field border border-line text-tx3"}`}>
                {isDone ? "✓" : n}
              </span>
              <span className={`truncate ${isNow ? "text-tx font-bold" : "text-tx3"}`}>{label}</span>
              {n < STEPS.length && <span className="flex-1 h-px bg-line hidden sm:block" />}
            </li>
          );
        })}
      </ol>
      <h2 className="font-serif text-lg mb-1">{b.title}</h2>
      <p className="text-13 text-tx2 leading-relaxed mb-4">{b.text}</p>
      {(b.primary || b.secondary) && (
        <div className="flex flex-wrap items-center gap-3">
          {b.primary && (
            // ⚠️ 外框樣式不是填色：首頁「一主三次」規則——填色主按鈕只能有一顆（portalHomeUI.test 守著）
            <Link href={b.primary.href} className="font-bold text-brand2 border border-brand hover:bg-brand/10 px-5 py-2.5 rounded-lg text-sm">
              {b.primary.label}
            </Link>
          )}
          {b.secondary && (
            <Link href={b.secondary.href} className="text-sm text-tx2 hover:text-tx border border-line rounded-lg px-4 py-2">
              {b.secondary.label}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
