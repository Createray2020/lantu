"use client";

import { UserButton } from "@clerk/nextjs";
import { INTRODUCER_STATE_LABEL, routeMeta, type IntroducerState } from "@/lib/coachApply";

export type ApplyProgress = {
  route: string;
  introducerState: string;
  introducerName: string | null;
  introducerNote: string | null;
};

// 帳號尚未開通 / 已停權時顯示；使用者進不了 App。
//
// 2026/08/31 加上報聘進度：舊版只有一句「已收到您的使用申請」，
// 走介紹人推薦路線的人完全看不出來卡在哪一關（等介紹人？還是等審核？），
// 只能回頭私訊問。三段進度條就是把那句話拆開。
export default function PendingNotice({
  email,
  status,
  progress = null,
}: {
  email: string | null;
  status: string;
  progress?: ApplyProgress | null;
}) {
  const suspended = status === "suspended";
  const st = (progress?.introducerState ?? "skipped") as IntroducerState;
  const needsIntro = routeMeta(progress?.route).needsIntroducer;
  const declined = st === "declined";

  // 三段：已送出 → 介紹人確認（只有推薦路線有）→ 嵐途審核。
  const steps = [
    { label: "已送出報聘申請", done: true },
    ...(needsIntro
      ? [
          {
            label: progress?.introducerName
              ? `${INTRODUCER_STATE_LABEL[st]}（${progress.introducerName}）`
              : INTRODUCER_STATE_LABEL[st],
            done: st === "confirmed",
            bad: declined,
          },
        ]
      : []),
    { label: "嵐途審核（含費用確認）", done: false },
  ];

  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] text-[#eef2f7] px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 w-14 h-14 rounded-2xl border border-[#c99a5b] grid place-items-center">
          <svg width="34" height="34" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
            <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="font-serif text-2xl tracking-[0.1em] mb-3">
          {suspended ? "帳號已停權" : "報聘審核中"}
        </h1>
        <p className="text-[#a9bccf] text-sm leading-relaxed mb-2">
          {suspended
            ? "您的帳號目前已停權，若有疑問請與嵐途聯繫。"
            : "已收到您的報聘申請，開通需經審核（含費用確認）。開通後即可使用完整系統。"}
        </p>

        {!suspended && progress && (
          <div className="mt-5 mb-5 text-left border border-white/10 rounded-lg p-4 bg-[#0a1a2b]">
            <div className="text-[11px] text-[#6f869c] mb-2">報聘路線：{routeMeta(progress.route).label}</div>
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
            {progress.introducerNote && (
              <p className="mt-3 pt-3 border-t border-white/10 text-[11px] text-[#a9bccf] whitespace-pre-wrap">
                介紹人留言：{progress.introducerNote}
              </p>
            )}
          </div>
        )}

        <p className="text-[#6f869c] text-xs mb-8">登入帳號：{email || "（未提供 email）"}</p>
        <div className="flex items-center justify-center gap-3">
          <UserButton />
          <span className="text-[#6f869c] text-xs">點頭像可登出／切換帳號</span>
        </div>
      </div>
    </main>
  );
}
