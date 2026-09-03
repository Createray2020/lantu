"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReviewChecksAction } from "./actions";
import {
  APPLY_CONSENTS,
  INTRODUCER_STATE_LABEL,
  approvalGate,
  checklistFor,
  routeMeta,
  type ApplyLicense,
  type ApplySettings,
  type IntroducerState,
} from "@/lib/coachApply";

export type ApplicationBrief = {
  route: string;
  introducerName: string | null;
  introducerCode: string | null;
  introducerState: string;
  introducerNote: string | null;
  phone: string | null;
  currentJob: string | null;
  motive: string | null;
  experience: string | null;
  licenses: ApplyLicense[];
  consents: Record<string, string>;
  reviewChecks: Record<string, string>;
  reviewNote: string | null;
};

const STATE_COLOR: Record<IntroducerState, string> = {
  pending: "#c99a5b",
  confirmed: "#7fd1a8",
  declined: "#e08b7a",
  skipped: "#6f869c",
};

// 後台名冊裡的報聘詳情＋審核檢核表。
//
// 為什麼檢核表放在這裡而不是另開一頁：審核者要看的東西（自述、證照、推薦人說了什麼）
// 與要打的勾是同一件事，拆兩頁就會變成「先在 A 頁看完、再到 B 頁憑印象打勾」。
// 打勾即存（存的是時間戳），核准鈕仍在右邊那一欄 —— 沒勾完按下去會回一句缺什麼。
export default function ReviewPanel({
  id,
  app,
  settings,
  status,
}: {
  id: string;
  app: ApplicationBrief;
  settings: ApplySettings;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(status === "pending");
  const [checked, setChecked] = useState<string[]>(() => Object.keys(app.reviewChecks ?? {}));
  const [note, setNote] = useState(app.reviewNote ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const items = checklistFor(settings, app.route);
  const st = app.introducerState as IntroducerState;
  const gate = approvalGate(
    { route: app.route, introducerState: app.introducerState, checked, hasApplication: true },
    settings,
  );

  function save(next: string[], nextNote: string) {
    setChecked(next);
    setNote(nextNote);
    setErr(null);
    start(async () => {
      const r = await saveReviewChecksAction(id, next, nextNote);
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-2 border border-white/10 rounded-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1 text-[11px] text-[#a9bccf] hover:text-white"
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>報聘資料</span>
        <span className="text-[#6f869c]">{routeMeta(app.route).label}</span>
        <span style={{ color: STATE_COLOR[st] ?? "#6f869c" }}>{INTRODUCER_STATE_LABEL[st] ?? app.introducerState}</span>
        {status === "pending" && (
          <span className={gate.ok ? "ml-auto text-[#7fd1a8]" : "ml-auto text-[#c99a5b]"}>
            {gate.ok ? "可核准" : `尚缺 ${gate.reasons.length} 項`}
          </span>
        )}
      </button>

      {open && (
        <div className="px-2 pb-2 grid gap-2 text-[11px]">
          <div className="text-[#a9bccf]">
            推薦人：
            {app.introducerName
              ? `${app.introducerName}${app.introducerCode ? `（${app.introducerCode}）` : ""}`
              : app.introducerCode
                ? `${app.introducerCode}（查無此編號）`
                : "—"}
          </div>
          {app.introducerNote && (
            <div className="text-[#8fa8bd] whitespace-pre-wrap">推薦人留言：{app.introducerNote}</div>
          )}
          {app.currentJob && <div className="text-[#8fa8bd]">現況：{app.currentJob}</div>}
          {app.motive && <div className="text-[#8fa8bd] whitespace-pre-wrap">動機：{app.motive}</div>}
          {app.experience && <div className="text-[#8fa8bd] whitespace-pre-wrap">經歷：{app.experience}</div>}

          <div className="text-[#a9bccf]">
            證照：
            {app.licenses?.length
              ? app.licenses
                  .map((l) => [l.type === "其他" ? l.name || "其他" : l.type, l.at, l.no].filter(Boolean).join(" "))
                  .join("；")
              : "未填"}
          </div>

          <div className="text-[#6f869c]">
            聲明：
            {APPLY_CONSENTS.every((c) => app.consents?.[c.key])
              ? `全數勾選（${(app.consents[APPLY_CONSENTS[0].key] ?? "").slice(0, 10)}）`
              : "⚠ 未完整勾選"}
          </div>

          {/* 檢核表：後台設定的那一份，逐項打勾才放行。 */}
          <div className="border-t border-white/10 pt-2 grid gap-1">
            {items.map((it) => {
              const on = checked.includes(it.key);
              return (
                <label key={it.key} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-[2px] accent-[#c99a5b]"
                    checked={on}
                    disabled={busy}
                    onChange={() => save(on ? checked.filter((k) => k !== it.key) : [...checked, it.key], note)}
                  />
                  <span className={on ? "text-[#a9bccf]" : "text-[#eef2f7]"}>
                    {it.label}
                    {it.required && <span className="text-[#c99a5b]"> *</span>}
                    {on && app.reviewChecks?.[it.key] && (
                      <span className="text-[#6f869c]"> · {app.reviewChecks[it.key].slice(0, 10)}</span>
                    )}
                  </span>
                </label>
              );
            })}
            <textarea
              className="mt-1 w-full bg-[#0a1a2b] border border-white/15 rounded-md px-2 py-1 text-[11px] text-[#eef2f7] placeholder:text-[#4f6478]"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => save(checked, note)}
              placeholder="審核備註（選填）"
            />
            {!gate.ok && status === "pending" && (
              <div className="text-[#c99a5b]">核准前還要：{gate.reasons.join("、")}</div>
            )}
            {err && <div className="text-[#e08b7a]">儲存失敗：{err}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
