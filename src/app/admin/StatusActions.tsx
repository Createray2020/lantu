"use client";

// 後台帳號狀態動作（核准開通／停權／重設待審）。
// 改成 client component 的理由同 OrgCell：原本直接把 Server Action 綁在 <form> 上，
// 途中失敗（例如伺服器暫時 5xx）不會有任何提示，使用者只看到「按了沒反應」。
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { approveCoach, resetCoach, suspendCoach, retryActivateAction, rejectTrainingAction, reopenTrainingAction, saveEnrollmentAdminAction } from "./actions";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { fmtMoney0 } from "@/lib/money";

export type TrainingAdminFields = { memberKind: string; briefKind: string | null; briefDate: string | null; briefVersion: string; resignDate: string | null };
export type TrainingBrief = {
  enrollmentId: string; stage: string; amountDue: number; confirmed: number; pending: number; met: boolean;
  docsDone: number; docsRequired: number; docsTotal: number; anyDeclined: boolean; needsCompany: boolean;
  // 2026/10/28 合約自動帶入：行政確認欄＋啟動前還缺什麼（誰填）
  admin: TrainingAdminFields;
  missing: { label: string; by: "person" | "admin" }[];
};
export type CompanyOption = { id: string; name: string };

export default function StatusActions({ id, status, training = null, companyOptions = [], meId = "" }: { id: string; status: string; training?: TrainingBrief | null; companyOptions?: CompanyOption[]; meId?: string }) {
  const [company, setCompany] = useState<string>(meId);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn(id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  const t = training;
  const signing = !!t && t.stage === "passed";
  const rejected = !!t && t.stage === "rejected";
  const [adminOpen, setAdminOpen] = useState(false);
  const [af, setAf] = useState<TrainingAdminFields>(t?.admin ?? { memberKind: "intern", briefKind: null, briefDate: null, briefVersion: "", resignDate: null });
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  function saveAdmin() {
    setAdminMsg(null);
    startTransition(async () => {
      const r = await saveEnrollmentAdminAction(id, af);
      if (r.ok) { setAdminMsg("已儲存"); setAdminOpen(false); router.refresh(); } else setAdminMsg(r.error);
    });
  }
  return (
    <div className="flex flex-col items-end gap-1">
      {/* 行政確認（2026/10/28）：合約要印、申請人不該自己填的三樣；缺的項目啟動簽署會被擋 */}
      {t && status === "pending" && t.stage !== "activated" && t.stage !== "rejected" && (
        <div className="text-10 text-right text-tx2 leading-relaxed max-w-[320px]">
          {t.missing.length > 0 ? (
            <div className="text-warn">啟動前還缺：{t.missing.map((m) => `${m.label}（${m.by === "person" ? "申請人" : "行政"}）`).join("、")}</div>
          ) : (
            <div className="text-ok">合約資料已齊</div>
          )}
          {!adminOpen ? (
            <button type="button" className="underline text-tx3" onClick={() => setAdminOpen(true)}>
              行政確認：{af.memberKind === "partner" ? "合作教練" : af.memberKind === "hired" ? "報聘教練" : "實習教練"}・{af.briefKind === "meeting" ? `說明會 ${af.briefDate ?? "（日期未填）"}` : af.briefKind === "public" ? `公版 ${af.briefVersion || "（版本未填）"}` : "說明方式未確認"}{af.resignDate ? `・補簽（原報名 ${af.resignDate}）` : ""}
            </button>
          ) : (
            <div className="grid gap-1.5 text-left rounded-md border border-line p-2 bg-panel mt-1 text-xs">
              <label className="grid gap-0.5 text-tx3">身分
                <select className={SELECT_SM} value={af.memberKind} onChange={(e) => setAf({ ...af, memberKind: e.target.value })}>
                  <option value="intern">實習教練</option><option value="partner">合作教練</option><option value="hired">報聘教練</option>
                </select></label>
              <label className="grid gap-0.5 text-tx3">報名前說明方式
                <select className={SELECT_SM} value={af.briefKind ?? ""} onChange={(e) => setAf({ ...af, briefKind: e.target.value || null })}>
                  <option value="">（未確認）</option><option value="meeting">嵐途說明會</option><option value="public">公版介紹內容</option>
                </select></label>
              {af.briefKind === "meeting" && <label className="grid gap-0.5 text-tx3">說明會日期<input type="date" className={FIELD_SM} value={af.briefDate ?? ""} onChange={(e) => setAf({ ...af, briefDate: e.target.value || null })} /></label>}
              {af.briefKind === "public" && <label className="grid gap-0.5 text-tx3">公版介紹版本<input className={FIELD_SM} value={af.briefVersion} onChange={(e) => setAf({ ...af, briefVersion: e.target.value })} placeholder="例 2026/10 版" /></label>}
              <label className="grid gap-0.5 text-tx3">補簽：原報名日（不是補簽留空）<input type="date" className={FIELD_SM} value={af.resignDate ?? ""} onChange={(e) => setAf({ ...af, resignDate: e.target.value || null })} /></label>
              <div className="flex gap-2">
                <button type="button" className="rounded-md bg-brand text-onbrand font-bold px-2.5 py-1 disabled:opacity-40" disabled={pending} onClick={saveAdmin}>儲存</button>
                <button type="button" className="text-tx3" onClick={() => setAdminOpen(false)}>取消</button>
              </div>
            </div>
          )}
          {adminMsg && <div>{adminMsg}</div>}
        </div>
      )}
      {/* 三組獨立狀態（2026/10/28）：收款／文件；資格審核在左邊的檢核表 */}
      {t && status !== "active" && (
        <div className="text-10 text-right text-tx2 leading-relaxed">
          <div>收款 <b className={t.met ? "text-ok" : "text-danger"}>{fmtMoney0(t.confirmed)}／{fmtMoney0(t.amountDue)}</b>{t.pending > 0 && <span className="text-brand2">（待查帳 {fmtMoney0(t.pending)}）</span>}</div>
          <div>文件 {t.docsTotal ? <b className={t.docsDone === t.docsRequired ? "text-ok" : ""}>{t.docsDone}／{t.docsRequired} 必簽</b> : <span className="text-tx3">尚未啟動</span>}{t.anyDeclined && <span className="text-danger ml-1">有拒簽</span>}</div>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        {status !== "active" && !signing && t?.needsCompany && t.stage === "pending" && (
          <select className={SELECT_SM} value={company} onChange={(e) => setCompany(e.target.value)} title="公司代表簽名位由誰簽">
            {companyOptions.map((c) => <option key={c.id} value={c.id}>公司代表：{c.name}</option>)}
          </select>
        )}
        {status !== "active" && rejected && (
          <button type="button" className="rounded-md border border-line2 text-tx2 px-3 py-1.5 text-xs disabled:opacity-50" disabled={pending} onClick={() => run(reopenTrainingAction)}>重新受理</button>
        )}
        {status !== "active" && !signing && !rejected && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run((cid) => approveCoach(cid, t?.needsCompany ? company : null))}
            className="rounded-md bg-ok-solid text-onbrand font-bold px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {pending ? "處理中…" : t ? "審核通過並啟動簽署" : "核准開通"}
          </button>
        )}
        {status !== "active" && signing && t && (
          <>
            <Link href="/admin/docs/instances?status=pending" className="rounded-md border border-line2 text-tx2 px-3 py-1.5 text-xs">查看簽署進度</Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(retryActivateAction)}
              className="rounded-md bg-ok-solid text-onbrand font-bold px-3 py-1.5 text-xs disabled:opacity-50"
              title="文件都簽完就會自動開通；這顆是沒跟上、或文件沒產出來時再推一次"
            >
              {pending ? "處理中…" : "開通"}
            </button>
          </>
        )}
        {status === "pending" && t && t.stage !== "rejected" && t.stage !== "activated" && !rejecting && (
          <button type="button" className="rounded-md border border-line2 text-tx2 px-2.5 py-1.5 text-xs" disabled={pending} onClick={() => setRejecting(true)}>退回</button>
        )}
        {status === "active" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(suspendCoach)}
            className="rounded-md bg-danger-solid text-onsolid font-bold px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {pending ? "處理中…" : "停權"}
          </button>
        )}
        {status === "suspended" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(resetCoach)}
            className="rounded-md border border-line2 text-tx2 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            重設待審
          </button>
        )}
      </div>
      {rejecting && (
        <div className="flex items-center gap-1 text-xs">
          <input className="rounded border border-line bg-field px-2 py-1 w-40" placeholder="退回原因（必填）" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="rounded border border-danger text-danger px-2 py-1 disabled:opacity-40" disabled={pending || !reason.trim()} onClick={() => run(() => rejectTrainingAction(id, reason).then((r) => { if (r.ok) setRejecting(false); return r; }))}>確認退回</button>
          <button type="button" className="text-tx3" onClick={() => setRejecting(false)}>取消</button>
        </div>
      )}
      {t?.stage === "rejected" && <span className="text-10 text-danger">培訓報名已退回</span>}
      {error && <span className="text-10 text-danger">失敗：{error}</span>}
    </div>
  );
}
