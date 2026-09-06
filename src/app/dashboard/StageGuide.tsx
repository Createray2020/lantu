"use client";

import Modal from "@/components/ui/Modal";
import {
  STAGE_ORDER,
  STAGE_METRICS,
  STAGE_LABEL,
  STAGE_TASK,
  STAGE_GATE,
  STAGE_DESC,
  stageColor,
} from "./format";

// 財務階段的定義／判定標準對照表。current 有值時高亮該階段那一列。
// 與 public/lantu-app.html 的 stageBandInner() 是同一份內容的 React 版。
export function StageGuideTable({ current }: { current?: string | null }) {
  return (
    <div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="text-11 uppercase tracking-wider text-tx3">
            <th className="px-2 py-1.5 font-normal">階段</th>
            <th className="px-2 py-1.5 font-normal">判定條件</th>
            <th className="px-2 py-1.5 font-normal">當前課題與意義</th>
          </tr>
        </thead>
        <tbody>
          {STAGE_ORDER.map((k) => {
            const on = k === current;
            return (
              <tr
                key={k}
                className="border-t border-line align-top"
                style={on ? { background: "rgba(201,154,91,.16)" } : undefined}
              >
                <td className="px-2 py-2 whitespace-nowrap text-13 font-extrabold" style={{ color: stageColor(k) }}>
                  {on ? "▶ " : ""}
                  {STAGE_LABEL[k]}
                </td>
                <td className={`px-2 py-2 text-xs ${on ? "text-brand2" : "text-tx2"}`}>{STAGE_GATE[k]}</td>
                <td className="px-2 py-2 text-xs">
                  <b className="text-tx">{STAGE_TASK[k]}</b>
                  <div className="mt-1 leading-relaxed text-tx2">{STAGE_DESC[k]}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 text-11 uppercase tracking-wider text-tx3">三項指標怎麼算</div>
      <table className="mt-1 w-full border-collapse text-left">
        <tbody>
          {STAGE_METRICS.map(([name, formula]) => (
            <tr key={name} className="border-t border-line align-top">
              <td className="px-2 py-1.5 whitespace-nowrap text-xs text-tx2">{name}</td>
              <td className="px-2 py-1.5 text-xs text-tx2">{formula}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-11 leading-relaxed text-tx3">
        判定是<b className="text-tx2">關卡制</b>不是分數區間：依序檢查「安全度與收支 → 財務自由度 → 願景達成度」，
        任何一關未過就停在該階段。階段代表的是旅程位置與當前該做的事，
        <b className="text-tx2">不是好壞評價</b>——同一階段的成因可能完全不同。
      </p>
    </div>
  );
}

export function StageGuideModal({ current, onClose }: { current?: string | null; onClose: () => void }) {
  // Esc、焦點移入與歸還、背景鎖捲都由共用的 <Modal> 處理。
  return (
    <Modal onClose={onClose} labelledBy="stageGuideTitle" width="max-w-3xl">
      <div className="max-h-[85vh] overflow-auto p-5 text-tx">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 id="stageGuideTitle" className="font-serif text-lg tracking-[0.08em]">財務階段是怎麼判定的</h3>
          <button
            onClick={onClose}
            className="rounded-md border border-line2 px-2.5 py-1 text-sm text-tx2 hover:text-tx"
          >
            關閉
          </button>
        </div>
        {current && (
          <div className="mb-3 text-13 font-extrabold" style={{ color: stageColor(current) }}>
            這位客戶目前在 {STAGE_LABEL[current] ?? "未評估"}
          </div>
        )}
        <StageGuideTable current={current} />
      </div>
    </Modal>
  );
}
