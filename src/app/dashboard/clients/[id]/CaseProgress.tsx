"use client";

import { useEffect, useState, useTransition } from "react";
import Modal from "@/components/ui/Modal";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { STAGE_LABEL, STAGE_NO, STATUS_LABEL, FLAG_LABEL, CLOSE_REASONS, DECISION_LABEL, STAGE_OWNER_HINT, type Stage } from "@/lib/caseEngine";
import {
  caseForClientAction, ensureCaseAction, completeStageAction, revertStageAction, setPromisedAction, setStageNoteAction, toggleCheckAction, setDecisionAction,
  pauseCaseAction, resumeCaseAction, closeCaseAction, reopenCaseAction, setFlagAction, sendFeedbackAction, feedbackForCaseAction, handleFeedbackAction,
  type CaseViewRow, type CaseStageView, type FeedbackRow,
} from "../../caseActions";

// 客戶頁「服務進度」區塊（2026/10/28 案件進度）：一案一條時間軸，目前階段攤開、其餘收合。
// ⚠️ 語彙：這裡叫「服務進度」（階段 4–8）；「財務階段」（整裝／啟程／前行／遠行）是另一條，不混。
// 主責教練可改；S3／客戶關係／行政財法／協作教練唯讀（canEdit 由後端算）。

const STAGES: Stage[] = ["commission", "interview", "planning", "report", "tracking"];
const BTN = "text-xs rounded-md border border-line2 px-2.5 py-1.5 text-tx2 hover:bg-panel3 disabled:opacity-40";
const BTN_PRI = "text-xs rounded-md bg-brand text-onbrand px-2.5 py-1.5 disabled:opacity-40";
const fmt = (d: string | null) => (d ? d.replace(/-/g, "/") : "—");

export default function CaseProgress({ clientId, readOnly }: { clientId: string; readOnly: boolean }) {
  const [row, setRow] = useState<CaseViewRow | null | undefined>(undefined);
  const [fb, setFb] = useState<FeedbackRow[]>([]);
  const [open, setOpen] = useState<Stage | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const load = () => caseForClientAction(clientId).then((r) => { setRow(r); if (r && open === null) setOpen(r.stage); if (r) feedbackForCaseAction(r.id).then(setFb).catch(() => setFb([])); }).catch(() => setRow(null));
  useEffect(() => { load(); }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => { setErr(""); start(async () => { const r = await fn(); if (!r.ok) { setErr(r.error ?? "失敗"); return; } load(); }); };

  if (row === undefined) return <div className="bg-panel border border-line rounded-xl p-4 shadow-e1 text-xs text-tx3">服務進度載入中…</div>;
  if (row === null) {
    return (
      <div className="bg-panel border border-line rounded-xl p-4 shadow-e1 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold">服務進度</div>
          <div className="text-xs text-tx3">還沒有案件進度。建立付費服務案件時會自動開始；沒收費也想追進度，可以手動開始。</div>
        </div>
        {!readOnly && <button className={BTN} disabled={pending} onClick={() => run(() => ensureCaseAction(clientId))}>開始追蹤服務進度</button>}
        {err && <p className="text-danger text-xs w-full">{err}</p>}
      </div>
    );
  }
  const edit = row.canEdit && !readOnly;
  const cur = row.stages.find((s) => s.stage === row.stage)!;

  return (
    <div className="bg-panel border border-line rounded-xl p-4 shadow-e1 grid gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="text-sm font-bold">服務進度</div>
        <span className="text-11 text-tx3">案件 {row.caseNo}{row.startedAt ? `・${fmt(row.startedAt)} 開始` : ""}</span>
        <span className={`text-11 rounded-full border px-2 py-0.5 ${row.status === "active" ? "border-ok text-ok" : row.status === "paused" ? "border-brand2 text-brand2" : "border-line text-tx2"}`}>{STATUS_LABEL[row.status as keyof typeof STATUS_LABEL] ?? row.status}</span>
        {row.flags.map((f) => <span key={f} className={`text-11 rounded-full px-2 py-0.5 ${f === "overdue" || f === "complaint" ? "bg-danger/15 text-danger" : "bg-brand2/15 text-brand2"}`}>{FLAG_LABEL[f as keyof typeof FLAG_LABEL] ?? f}{f === "waiting" && row.waitingSince ? `・自 ${fmt(row.waitingSince)}` : ""}</span>)}
        {row.overdue > 0 && <span className="text-11 text-danger">逾期 {row.overdue} 天{row.escalation > 0 ? `・升級第 ${row.escalation} 步` : ""}</span>}
        <span className="ml-auto text-xs text-tx2">已完成 <b className="text-tx">{row.done}</b>／{row.total} 階段{row.s3Name ? `・S3 ${row.s3Name}` : ""}</span>
      </div>

      {/* 時間軸 */}
      <ol className="grid grid-cols-5 gap-1">
        {row.stages.map((s) => (
          <li key={s.stage}>
            <button type="button" onClick={() => setOpen(open === s.stage ? null : s.stage)} className={`w-full text-left rounded-md border px-2 py-1.5 ${s.progress === "active" ? "border-brand bg-brand/10" : s.progress === "done" ? "border-ok/40" : "border-line"} ${open === s.stage ? "ring-1 ring-brand" : ""}`}>
              <div className="flex items-center gap-1.5">
                <span className={`grid place-items-center w-5 h-5 rounded-full text-10 font-bold ${s.progress === "done" ? "bg-ok text-onsolid" : s.progress === "active" ? "bg-brand text-onbrand" : "bg-panel3 text-tx3"}`}>{s.progress === "done" ? "✓" : STAGE_NO[s.stage]}</span>
                <span className="text-xs font-bold truncate">{STAGE_LABEL[s.stage]}</span>
              </div>
              <div className="text-10 text-tx3 mt-0.5 truncate">{s.actualDate ? `實際 ${fmt(s.actualDate)}` : s.promisedDate ? `承諾 ${fmt(s.promisedDate)}` : s.expectedDate ? `預計 ${fmt(s.expectedDate)}` : s.progress === "pending" ? "待開始" : ""}</div>
            </button>
          </li>
        ))}
      </ol>

      {open && <StagePanel row={row} s={row.stages.find((x) => x.stage === open)!} isCurrent={open === row.stage} edit={edit} pending={pending} run={run} />}

      {/* 狀態與標記 */}
      {(edit || row.canFlags) && <StatusBar row={row} edit={edit} pending={pending} run={run} />}
      {err && <p className="text-danger text-xs">{err}</p>}

      <FeedbackBlock row={row} fb={fb} edit={edit} pending={pending} run={run} />
      <details className="text-xs">
        <summary className="cursor-pointer text-tx3">服務年期（{row.terms.length}）與異動紀錄（{row.log.length}）</summary>
        <div className="mt-2 grid gap-1">
          {row.terms.map((t) => <div key={t.id} className="text-tx2">{t.year} 年度・{t.kind === "renewal" ? "年度續約" : "首次委任"}・{t.itemName}・{t.caseNo}・{t.status}</div>)}
          {row.log.map((l, i) => <div key={i} className="text-tx3">{l.at}・{l.who}・{logLabel(l.action, l.detail)}{l.reason ? `・${l.reason}` : ""}</div>)}
        </div>
      </details>
      <p className="text-10 text-tx3">目前階段「{STAGE_LABEL[cur.stage]}」負責：{STAGE_OWNER_HINT[cur.stage]}。客戶端只看承諾／實際完成日，預計日留教練端。</p>
    </div>
  );
}

function logLabel(a: string, d: Record<string, unknown>): string {
  const st = (k: unknown) => (typeof k === "string" && k in STAGE_LABEL ? STAGE_LABEL[k as Stage] : String(k ?? ""));
  switch (a) {
    case "case_created": return "建立案件";
    case "stage_done": return `完成「${st(d.from)}」→「${st(d.to)}」`;
    case "stage_auto_done": return `系統依完成訊號推進「${st(d.from)}」→「${st(d.to)}」`;
    case "stage_reverted": return `退回「${st(d.to)}」`;
    case "tracking_cycle_done": return "本季追蹤完成";
    case "promised_set": return `承諾日 ${d.from ?? "—"} → ${d.to ?? "—"}`;
    case "check_done": return `勾選 ${d.k}`;
    case "check_undone": return `取消勾選 ${d.k}`;
    case "check_auto": return `系統勾選 ${d.k}`;
    case "note_set": return "更新說明";
    case "decision_set": return `客戶決定：${DECISION_LABEL[String(d.decision)] ?? "—"}`;
    case "paused": return "暫停";
    case "resumed": return "恢復";
    case "closed": return `結案（${CLOSE_REASONS[String(d.reason)] ?? d.reason}）`;
    case "reopened": return "重新開啟";
    case "flag_on": return `標記 ${FLAG_LABEL[d.flag as keyof typeof FLAG_LABEL] ?? d.flag}`;
    case "flag_off": return `解除 ${FLAG_LABEL[d.flag as keyof typeof FLAG_LABEL] ?? d.flag}`;
    case "escalation": return `逾期升級 ${d.from} → ${d.to}`;
    case "s3_set": return "指定 S3";
    case "coach_set": return "更換主責教練";
    default: return a;
  }
}

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void;

function StagePanel({ row, s, isCurrent, edit, pending, run }: { row: CaseViewRow; s: CaseStageView; isCurrent: boolean; edit: boolean; pending: boolean; run: Run }) {
  const [promise, setPromise] = useState(s.promisedDate ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(s.note);
  const [revert, setRevert] = useState("");
  // 換階段／伺服器值變了就把輸入拉回真實值（render 期間校正 state，不用 effect）
  const [snap, setSnap] = useState({ stage: s.stage, promised: s.promisedDate, note: s.note });
  if (snap.stage !== s.stage || snap.promised !== s.promisedDate || snap.note !== s.note) { setSnap({ stage: s.stage, promised: s.promisedDate, note: s.note }); setPromise(s.promisedDate ?? ""); setNote(s.note); setReason(""); }
  const canAct = edit && isCurrent && row.status === "active";
  const needReason = !!s.promisedDate && promise !== s.promisedDate;
  return (
    <div className="rounded-lg border border-line bg-panel2 p-3 grid gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <b>{STAGE_NO[s.stage]}・{STAGE_LABEL[s.stage]}</b>
        <span className="text-11 text-tx3">{s.progress === "done" ? "已完成" : s.progress === "active" ? "進行中" : "待開始"}</span>
        <span className="ml-auto text-11 text-tx3">預計 {fmt(s.expectedDate)}・承諾 {fmt(s.promisedDate)}・實際 {fmt(s.actualDate)}</span>
      </div>
      <ul className="grid sm:grid-cols-2 gap-1">
        {s.checklist.map((c) => (
          <li key={c.k} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={c.done} disabled={!edit || row.status !== "active"} onChange={(e) => run(() => toggleCheckAction(row.id, s.stage, c.k, e.target.checked))} />
            <span className={c.done ? "text-tx3 line-through" : ""}>{c.label}</span>
            {c.at && <span className="text-10 text-tx3">{fmt(c.at)}</span>}
          </li>
        ))}
        {!s.checklist.length && <li className="text-xs text-tx3">這一階段還沒開始，清單在開始時長出來。</li>}
      </ul>
      {s.stage === "report" && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-tx3">客戶決定</span>
          <select className={SELECT_SM} value={s.decision} disabled={!edit} onChange={(e) => run(() => setDecisionAction(row.id, e.target.value as "accept" | "revise" | ""))}>
            <option value="">—</option><option value="accept">接受</option><option value="revise">修改後再提案</option>
          </select>
          <span className="text-10 text-tx3">修改次數不設上限；超出原委託範圍另行確認。</span>
        </div>
      )}
      {edit && (
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs">
            <span className="text-tx3">承諾完成日（客戶看得到）</span>
            <div className="flex gap-1">
              <input type="date" className={FIELD_SM} value={promise} onChange={(e) => setPromise(e.target.value)} />
              <button className={BTN} disabled={pending || promise === (s.promisedDate ?? "") || (needReason && !reason.trim())} onClick={() => run(() => setPromisedAction(row.id, s.stage, promise || null, reason))}>存</button>
            </div>
            {needReason && <input className={FIELD_SM} placeholder="更改承諾日期的原因（必填）" value={reason} onChange={(e) => setReason(e.target.value)} />}
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-tx3">本階段說明／備註（客戶看得到）</span>
            <div className="flex gap-1">
              <input className={`${FIELD_SM} flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：資料齊全後 14 天內給初稿" />
              <button className={BTN} disabled={pending || note === s.note} onClick={() => run(() => setStageNoteAction(row.id, s.stage, note))}>存</button>
            </div>
          </label>
        </div>
      )}
      {!edit && s.note && <p className="text-xs text-tx2">{s.note}</p>}
      {canAct && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line">
          <button className={BTN_PRI} disabled={pending} onClick={async () => {
            const nxt = STAGES[STAGES.indexOf(s.stage) + 1];
            const ok = await confirmDialog(nxt ? `確認「${STAGE_LABEL[s.stage]}」已完成，進入「${STAGE_LABEL[nxt]}」？實際完成日會記成今天。` : "確認本季追蹤已完成？預計日會往後推一個週期。", { title: "本階段完成", okLabel: "完成" });
            if (ok) run(() => completeStageAction(row.id, s.stage));
          }}>{s.stage === "tracking" ? "本季追蹤完成" : "本階段完成 →"}</button>
          {STAGES.indexOf(s.stage) > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <input className={FIELD_SM} placeholder="退回原因" value={revert} onChange={(e) => setRevert(e.target.value)} />
              <button className={BTN} disabled={pending || !revert.trim()} onClick={() => run(() => revertStageAction(row.id, revert))}>退回上一階段</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBar({ row, edit, pending, run }: { row: CaseViewRow; edit: boolean; pending: boolean; run: Run }) {
  const [modal, setModal] = useState<null | "pause" | "close" | "waiting" | "reopen">(null);
  const [text, setText] = useState("");
  const [closeReason, setCloseReason] = useState("done");
  const has = (f: string) => row.flags.includes(f);
  const submit = () => {
    const t = text.trim();
    if (modal === "pause") run(() => pauseCaseAction(row.id, t));
    if (modal === "close") run(() => closeCaseAction(row.id, closeReason, t));
    if (modal === "waiting") run(() => setFlagAction(row.id, "waiting", true, t));
    if (modal === "reopen") run(() => reopenCaseAction(row.id, t));
    setModal(null); setText("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {edit && row.status === "active" && (
        <>
          {has("waiting")
            ? <button className={BTN} disabled={pending} onClick={() => run(() => setFlagAction(row.id, "waiting", false))}>客戶已回覆（解除等待）</button>
            : <button className={BTN} disabled={pending} onClick={() => setModal("waiting")}>等待客戶（暫停計時）</button>}
          <button className={BTN} disabled={pending} onClick={() => setModal("pause")}>暫停服務</button>
          <button className={BTN} disabled={pending} onClick={() => setModal("close")}>結案</button>
        </>
      )}
      {edit && row.status === "paused" && <button className={BTN_PRI} disabled={pending} onClick={() => run(() => resumeCaseAction(row.id))}>重新啟動</button>}
      {edit && row.status === "closed" && <button className={BTN} disabled={pending} onClick={() => setModal("reopen")}>重新開啟</button>}
      {(edit || row.canFlags) && row.status !== "closed" && (
        <>
          <button className={`${BTN} ${has("complaint") ? "border-danger text-danger" : ""}`} disabled={pending} onClick={() => run(() => setFlagAction(row.id, "complaint", !has("complaint")))}>{has("complaint") ? "解除異常客訴" : "標記異常客訴"}</button>
          <button className={`${BTN} ${has("lowscore") ? "border-brand2 text-brand2" : ""}`} disabled={pending} onClick={() => run(() => setFlagAction(row.id, "lowscore", !has("lowscore")))}>{has("lowscore") ? "低分回饋已處理" : "標記低分回饋"}</button>
        </>
      )}
      {row.status === "paused" && <span className="text-tx3">暫停原因：{row.pauseReason}（自 {fmt(row.pausedAt)}）</span>}
      {row.status === "closed" && <span className="text-tx3">結案：{CLOSE_REASONS[row.closeReason] ?? row.closeReason}{row.closeNote ? `・${row.closeNote}` : ""}（{fmt(row.closedAt)}）</span>}
      {has("waiting") && row.waitingNote && <span className="text-tx3">等待：{row.waitingNote}</span>}
      <Modal open={modal !== null} onClose={() => setModal(null)} label="案件狀態">
        <div className="grid gap-2 text-sm">
          <div className="font-bold">{modal === "pause" ? "暫停服務" : modal === "close" ? "結案" : modal === "waiting" ? "等待客戶" : "重新開啟"}</div>
          {modal === "close" && (
            <select className={SELECT_SM} value={closeReason} onChange={(e) => setCloseReason(e.target.value)}>
              {Object.entries(CLOSE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          <textarea className={`${FIELD_SM} min-h-20`} value={text} onChange={(e) => setText(e.target.value)} placeholder={modal === "close" ? "未完成事項／備註（選填）" : modal === "waiting" ? "等什麼：補件／確認／改期／回覆（客戶看得到）" : "原因（必填）"} />
          <p className="text-10 text-tx3">{modal === "close" ? "無回應不等於結案；結案也不等於所有財務目標達成。" : modal === "waiting" ? "等待客戶期間不計逾期；客戶端會顯示待辦與時間戳。" : modal === "pause" ? "客戶暫緩或聯繫 2 次無回應，且確認無未完成服務與客訴時才暫停；原則上不超過 30 天。" : ""}</p>
          <div className="flex justify-end gap-2">
            <button className={BTN} onClick={() => setModal(null)}>取消</button>
            <button className={BTN_PRI} disabled={pending || (modal !== "close" && !text.trim())} onClick={submit}>確定</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FeedbackBlock({ row, fb, edit, pending, run }: { row: CaseViewRow; fb: FeedbackRow[]; edit: boolean; pending: boolean; run: Run }) {
  const [note, setNote] = useState("");
  const can = edit || row.canFlags;
  if (!fb.length && !edit) return null;
  return (
    <div className="rounded-lg border border-line bg-panel2 p-3 grid gap-2 text-xs">
      <div className="flex items-center gap-2">
        <b className="text-sm">服務回饋</b>
        <span className="text-tx3">{fb.length ? `${fb.length} 份` : "還沒發過"}</span>
        {edit && row.status !== "closed" && <button className={`${BTN} ml-auto`} disabled={pending} onClick={() => run(() => sendFeedbackAction(row.id))}>發送回饋問卷</button>}
      </div>
      {fb.map((f) => (
        <div key={f.id} className="rounded-md bg-panel p-2 grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-tx3">發送 {fmt(f.sentAt)}</span>
            {f.submittedAt ? <span>填寫 {fmt(f.submittedAt)}・平均 <b className={f.low ? "text-danger" : "text-ok"}>{f.avg?.toFixed(1)}</b>（{f.scores.join("／")}）</span> : <span className="text-tx3">尚未填寫</span>}
            {f.low && !f.handledAt && <span className="rounded-full bg-danger/15 text-danger px-2 py-0.5">低分・待處理</span>}
            {f.handledAt && <span className="text-tx3">已處理 {fmt(f.handledAt)}{f.handleNote ? `・${f.handleNote}` : ""}</span>}
          </div>
          {f.comment && <div className="text-tx2">「{f.comment}」</div>}
          {f.low && !f.handledAt && can && (
            <div className="flex gap-1">
              <input className={`${FIELD_SM} flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="處理紀錄（已聯繫客戶／結果）" />
              <button className={BTN} disabled={pending || !note.trim()} onClick={() => run(() => handleFeedbackAction(f.id, row.id, note))}>標為已處理</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
