"use client";

// 後台帳號狀態動作（核准開通／停權／重設待審）。
// 改成 client component 的理由同 OrgCell：原本直接把 Server Action 綁在 <form> 上，
// 途中失敗（例如伺服器暫時 5xx）不會有任何提示，使用者只看到「按了沒反應」。
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { approveCoach, resetCoach, suspendCoach, retryActivateAction, rejectTrainingAction } from "./actions";
import { SELECT_SM } from "@/components/ui/Field";
import { fmtMoney0 } from "@/lib/money";

export type TrainingBrief = { enrollmentId: string; stage: string; amountDue: number; confirmed: number; pending: number; met: boolean; docsDone: number; docsRequired: number; docsTotal: number; anyDeclined: boolean; needsCompany: boolean };
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
  return (
    <div className="flex flex-col items-end gap-1">
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
        {status !== "active" && !signing && (
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
              onClick={() => run(() => retryActivateAction(t.enrollmentId))}
              className="rounded-md bg-ok-solid text-onbrand font-bold px-3 py-1.5 text-xs disabled:opacity-50"
              title="文件都簽完就會自動開通；這顆是沒跟上時再推一次"
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
