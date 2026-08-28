"use client";

/**
 * 諮詢紀錄表單 —— 「一場諮詢」與「事後補記」合併之後的唯一入口。
 *
 * 背景（2026/08/26 教練回饋）：系統原本有兩條路。
 *   ①「一場諮詢 → 結束並摘要」在規劃編輯器裡，日期寫死今天、摘要只吃區塊註記；
 *   ②「新增諮詢」在客戶詳情頁，可以選日期、貼全文。
 * 教練的實際用法是「用 AI 整理完諮詢紀錄再貼進系統」，日期常常是過去的某一天——
 * 走 ① 會記成今天、摘要也跟他談的內容無關。兩條路並存本身就是體感混亂的來源。
 *
 * 所以抽成這一個元件，兩處共用：
 *   - 規劃編輯器：結束諮詢後就地彈出，草稿當預填，不用離開編輯器
 *   - 客戶詳情頁：新增、補記、編輯既有紀錄
 */

import { useState } from "react";
import { REVIEW_TYPES, REVIEW_TYPE_LABEL, REVIEW_TYPE_DESC } from "./format";

const field = "w-full bg-[#0a1a2b] border border-white/15 rounded-md text-sm px-3 py-2 text-[#eef2f7]";
const btn = "px-3 py-1.5 text-sm font-bold rounded-md";
const lab = "text-[11px] text-[#a9bccf]";

export type ConsultRecordValue = {
  date: string;
  type: string;
  planId: string | null;
  attendees: string | null;
  summary: string | null;
  nextAppt: string | null;
};

export default function ConsultRecordForm({
  plans,
  initial,
  todos = [],
  notice,
  error = null,
  submitLabel = "存檔",
  pending = false,
  onSubmit,
  onCancel,
  onDiscard,
}: {
  plans: { id: string; year: number }[];
  initial?: Partial<ConsultRecordValue>;
  /** 存檔後會一併進追蹤的待辦（來自這一場的註記），唯讀提示用。 */
  todos?: string[];
  /** 表單上方的一句說明（例如「這是 8/26 那一場的草稿」）。 */
  notice?: string;
  /** 送出／捨棄失敗的理由。顯示在表單最上方——內容還在框裡，使用者改完可以直接再按一次。 */
  error?: string | null;
  submitLabel?: string;
  pending?: boolean;
  onSubmit: (v: ConsultRecordValue) => void;
  onCancel?: () => void;
  /** 只有草稿模式才給：這一場決定不留紀錄。 */
  onDiscard?: () => void;
}) {
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [type, setType] = useState(initial?.type ?? "review");
  const [planId, setPlanId] = useState(initial?.planId ?? "");
  const [attendees, setAttendees] = useState(initial?.attendees ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [nextAppt, setNextAppt] = useState(initial?.nextAppt ?? "");

  return (
    <div className="bg-[#0c2135] border border-white/10 rounded-xl p-3 grid gap-2.5">
      {error && (
        <div role="alert" className="text-[12.5px] font-bold text-[#ffd7d8] bg-[#5b1f22] border border-[#ff9d9f]/45 rounded-lg px-3 py-2">
          ⚠️ {error}
        </div>
      )}
      {notice && (
        <div className="text-[12px] text-[#e0bd8b] bg-[#c99a5b]/10 border border-[#c99a5b]/40 rounded-lg px-3 py-2">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lab}>日期</label>
          <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
          <p className="text-[10.5px] text-[#6b7d8f] mt-0.5">補記過去的諮詢就把日期改成當天，時間軸會排到正確的位置。</p>
        </div>
        <div>
          <label className={lab}>類型</label>
          <select className={field} value={type} onChange={(e) => setType(e.target.value)}>
            {REVIEW_TYPES.map((t) => <option key={t} value={t}>{REVIEW_TYPE_LABEL[t]}</option>)}
          </select>
          <p className="text-[10.5px] text-[#6b7d8f] mt-0.5">{REVIEW_TYPE_DESC[type] ?? ""}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lab}>對應版本</label>
          <select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">—</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.year} 版</option>)}
          </select>
        </div>
        <div>
          <label className={lab}>下次預約</label>
          <input type="date" className={field} value={nextAppt} onChange={(e) => setNextAppt(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={lab}>出席</label>
        <input className={field} value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="例如：本人、配偶" />
      </div>

      <div>
        <label className={lab}>內容</label>
        <textarea
          className={field + " min-h-[180px] leading-relaxed"}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="可以直接把整理好的諮詢紀錄整段貼進來。時間軸上預設收合，只顯示第一行。"
        />
      </div>

      {todos.length > 0 && (
        <div className="text-[12px] text-[#a9bccf] bg-[#0d2b45] border border-white/10 rounded-lg px-3 py-2">
          <b className="text-[#e0bd8b]">存檔後會有 {todos.length} 筆待辦進追蹤：</b>
          <ul className="mt-1 grid gap-0.5">
            {todos.map((t, i) => <li key={i} className="text-[#6b7d8f]">· {t}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button
          className={btn + " bg-[#c99a5b] text-[#08202a] disabled:opacity-60"}
          disabled={pending || !date}
          onClick={() =>
            onSubmit({
              date,
              type,
              planId: planId || null,
              attendees: attendees.trim() || null,
              summary: summary.trim() || null,
              nextAppt: nextAppt || null,
            })
          }
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button className={btn + " bg-[#0d2b45] text-[#a9bccf] border border-white/10"} onClick={onCancel} disabled={pending}>
            取消
          </button>
        )}
        {onDiscard && (
          <button
            className="text-[12px] text-[#6b7d8f] hover:text-[#e08a68] ml-auto"
            onClick={() => { if (confirm("這一場就不留紀錄了？\n\n草稿會丟掉，但諮詢場次與還原點都會保留。")) onDiscard(); }}
            disabled={pending}
          >
            這場不留紀錄
          </button>
        )}
      </div>
    </div>
  );
}
