"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/acctEngine";
import { fmtMoney0 } from "@/lib/money";
import { reportTrainingPaymentAction, saveMyProfileAction } from "./apply/actions";
import SignerProfileForm, { emptyProfile, profileComplete, type ProfileDraft } from "@/components/SignerProfileForm";

export type TrainingCaseView = {
  itemName: string;
  amountDue: number;
  stage: string;
  confirmed: number;
  pending: number;
  met: boolean;
  receipts: { id: string; on: string; amount: number; gross: number | null; method: string; verified: boolean; void: boolean }[];
  docs: { id: string; title: string; status: string; myTurn: boolean; expiresAt: string | null }[];
  docsDone: number;
  docsRequired: number;
  expiresAt: string | null;
  // 簽約資料（2026/10/28）：範本有用到才要求；missing 是啟動簽署前還缺的（含行政端的）
  profile: ProfileDraft | null;
  profileNeeded: boolean;
  missing: { label: string; by: "person" | "admin" }[];
};

// 申請人進度頁（PendingNotice）裡的培訓報名案件：費用與提報付款、應簽文件。
// 待簽階段只開這一塊——完整教練功能由 requireCoach() 擋著（status 仍是 pending）。
export default function TrainingCase({ t }: { t: TrainingCaseView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(t.amountDue || ""));
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [last5, setLast5] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [gross, setGross] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const m = PAYMENT_METHODS.find((x) => x.value === method)!;

  // 簽約資料：文件產出前都能改；已產出（passed 且有文件）就唯讀——內容已凍結進文件。
  const [prof, setProf] = useState<ProfileDraft>(t.profile ?? emptyProfile());
  const [profOpen, setProfOpen] = useState(!t.profile || !profileComplete(t.profile));
  const [profMsg, setProfMsg] = useState<string | null>(null);
  const profLocked = t.stage === "activated" || (t.stage === "passed" && t.docs.length > 0);
  function saveProf() {
    setProfMsg(null);
    start(async () => {
      const r = await saveMyProfileAction(prof);
      if (r.ok) { setProfMsg("已儲存"); setProfOpen(false); router.refresh(); } else setProfMsg(r.error);
    });
  }

  function submit() {
    setMsg(null);
    start(async () => {
      const amt = Number(String(amount).replace(/,/g, ""));
      const g = gross.trim() ? Number(gross.replace(/,/g, "")) : null;
      const r = await reportTrainingPaymentAction({ amount: amt, gross: g, fee: g != null ? Math.max(0, g - amt) : 0, on, method, methodFields: fields, last5 });
      if (r.ok) {
        setOpen(false);
        setMsg("已提報，等公司確認入帳");
        router.refresh();
      } else setMsg(r.error);
    });
  }

  const stageLabel = t.stage === "activated" ? "已開通" : t.stage === "passed" ? "審核通過・待簽文件" : t.stage === "rejected" ? "已退回" : "審核中";

  return (
    <div className="mt-5 text-left border border-line rounded-lg p-4 bg-field grid gap-4">
      <div className="flex items-center justify-between">
        <div className="text-11 text-tx3">培訓報名案件</div>
        <span className="text-11 rounded-full border border-line px-2 py-0.5 text-tx2">{stageLabel}</span>
      </div>

      {/* 收款 */}
      <section className="grid gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="font-bold">{t.itemName}</span>
          <span className="text-tx2">應收 {fmtMoney0(t.amountDue)}</span>
          <span className={t.met ? "text-ok" : "text-tx2"}>已確認 {fmtMoney0(t.confirmed)}</span>
          {t.pending > 0 && <span className="text-brand2">待公司確認 {fmtMoney0(t.pending)}</span>}
        </div>
        {t.receipts.length > 0 && (
          <ul className="text-xs text-tx2 grid gap-0.5">
            {t.receipts.filter((r) => !r.void).map((r) => (
              <li key={r.id} className="flex gap-2">
                <span>{r.on}</span>
                <span>{fmtMoney0(r.gross ?? r.amount)}</span>
                <span className="text-tx3">{PAYMENT_METHODS.find((x) => x.value === r.method)?.label ?? ""}</span>
                <span className={r.verified ? "text-ok" : "text-brand2"}>{r.verified ? "公司已確認" : "待公司確認"}</span>
              </li>
            ))}
          </ul>
        )}
        {!t.met && t.stage === "pending" && (
          !open ? (
            <button type="button" className="justify-self-start text-sm rounded-md border border-brand2 text-brand2 px-3 py-1.5" onClick={() => setOpen(true)}>我已付款，提報付款資訊</button>
          ) : (
            <div className="grid gap-2 rounded-md border border-line p-3 bg-panel">
              <p className="text-11 text-tx3">提報不等於公司已確認收款；公司核對入帳後狀態才會變。</p>
              <div className="flex flex-wrap gap-2 text-sm">
                <label className="grid gap-1 text-xs text-tx3">付款方式
                  <select className={SELECT_SM} value={method} onChange={(e) => { setMethod(e.target.value as PaymentMethod); setFields({}); }}>
                    {PAYMENT_METHODS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select></label>
                <label className="grid gap-1 text-xs text-tx3">付款金額
                  <input className={`${FIELD_SM} w-28 text-right`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
                <label className="grid gap-1 text-xs text-tx3">付款日期
                  <input type="date" className={`${FIELD_SM} w-40`} value={on} onChange={(e) => setOn(e.target.value)} /></label>
                {method === "bank" && (
                  <label className="grid gap-1 text-xs text-tx3">匯款後五碼
                    <input className={`${FIELD_SM} w-28`} value={last5} onChange={(e) => setLast5(e.target.value)} /></label>
                )}
                {m.fields.filter((f) => f.key !== "account" && f.key !== "settle").map((f) => (
                  <label key={f.key} className="grid gap-1 text-xs text-tx3">{f.label}
                    <input className={`${FIELD_SM} w-36`} value={fields[f.key] ?? ""} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} /></label>
                ))}
                {method !== "bank" && (
                  <label className="grid gap-1 text-xs text-tx3">實付總額（含手續費，可留空）
                    <input className={`${FIELD_SM} w-28 text-right`} inputMode="numeric" value={gross} onChange={(e) => setGross(e.target.value)} /></label>
                )}
              </div>
              <div className="flex gap-2 text-sm">
                <button type="button" className="rounded-md bg-brand text-onbrand font-bold px-3 py-1.5 disabled:opacity-40" disabled={busy} onClick={submit}>送出提報</button>
                <button type="button" className="text-tx2 px-2" onClick={() => setOpen(false)}>取消</button>
              </div>
            </div>
          )
        )}
        {msg && <p className="text-xs text-tx2">{msg}</p>}
      </section>

      {/* 簽約資料（2026/10/28）：合約欄位從這裡帶，簽署時只需要簽名 */}
      {t.profileNeeded && t.stage !== "rejected" && (
        <section className="grid gap-2 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold">簽約資料 {t.profile && profileComplete(t.profile) ? <span className="text-ok font-normal text-xs">已填齊</span> : <span className="text-brand2 font-normal text-xs">待填</span>}</div>
            {!profLocked && !profOpen && <button type="button" className="text-xs rounded-md border border-line px-2.5 py-1" onClick={() => setProfOpen(true)}>修改</button>}
          </div>
          <p className="text-11 text-tx3">培訓契約與同意書會直接帶入這些資料（身分證／護照、地址、發票…），簽署時只需要簽名。{profLocked ? "文件已產生，資料已帶入、不再更動。" : ""}</p>
          {profOpen && !profLocked ? (
            <div className="grid gap-2 rounded-md border border-line p-3 bg-panel">
              <SignerProfileForm value={prof} onChange={setProf} disabled={busy} />
              <div className="flex gap-2 text-sm">
                <button type="button" className="rounded-md bg-brand text-onbrand font-bold px-3 py-1.5 disabled:opacity-40" disabled={busy || !profileComplete(prof)} onClick={saveProf}>儲存簽約資料</button>
                {t.profile && <button type="button" className="text-tx2 px-2" onClick={() => { setProf(t.profile ?? emptyProfile()); setProfOpen(false); }}>取消</button>}
              </div>
              {!profileComplete(prof) && <p className="text-11 text-tx3">身分證／護照、出生日期、電話、Email、地址都要填；公司發票要統編與抬頭。</p>}
            </div>
          ) : t.profile ? (
            <dl className="text-xs text-tx2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt>身分證／護照</dt><dd>{t.profile.idNo || "—"}</dd>
              <dt>出生日期</dt><dd>{t.profile.birthDate || "—"}</dd>
              <dt>電話／Email</dt><dd>{t.profile.phone || "—"}　{t.profile.email || "—"}</dd>
              <dt>通訊地址</dt><dd>{t.profile.address || "—"}</dd>
              <dt>發票</dt><dd>{t.profile.invoiceKind === "company" ? `公司（統編 ${t.profile.invoiceTaxId}　抬頭 ${t.profile.invoiceTitle}）` : `個人${t.profile.invoiceCarrier ? `（載具 ${t.profile.invoiceCarrier}）` : ""}`}</dd>
            </dl>
          ) : null}
          {profMsg && <p className="text-xs text-tx2">{profMsg}</p>}
          {t.stage === "pending" && t.missing.some((x) => x.by === "admin") && <p className="text-11 text-tx3">另有行政端要確認的項目（{t.missing.filter((x) => x.by === "admin").map((x) => x.label).join("、")}），不用你處理。</p>}
        </section>
      )}

      {/* 文件 */}
      {t.docs.length > 0 && (
        <section className="grid gap-2 border-t border-line pt-3">
          <div className="text-sm font-bold">應簽文件 <span className="text-tx2 font-normal">已完成 {t.docsDone}／{t.docsRequired} 份</span></div>
          <ul className="grid gap-1.5">
            {t.docs.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${d.status === "completed" ? "bg-ok" : d.myTurn ? "bg-brand" : "bg-line2"}`} />
                <span className="flex-1 truncate">{d.title}</span>
                {d.myTurn ? (
                  <Link href={`/sign/${d.id}`} className="text-xs font-bold rounded-md bg-brand text-onbrand px-2.5 py-1">閱讀並簽署</Link>
                ) : (
                  <Link href={`/sign/${d.id}`} className="text-xs rounded-md border border-line px-2.5 py-1">{d.status === "completed" ? "下載已簽文件" : d.status === "pending" ? "查看進度" : "查看"}</Link>
                )}
              </li>
            ))}
          </ul>
          {t.docsDone === t.docsRequired && t.stage === "passed" && <p className="text-xs text-tx2">文件都簽完了，系統正在開通；重新整理一下。</p>}
        </section>
      )}
      {t.stage === "passed" && t.docs.length === 0 && <p className="text-xs text-tx2">審核已通過，等系統產生應簽文件。</p>}
    </div>
  );
}
