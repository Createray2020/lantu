"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "@/components/SignaturePad";
import SubmitButton from "@/components/ui/SubmitButton";
import { CONSENT_LABEL, E_SIGN_CLAUSE, ROLE_LABEL, STATUS_LABEL, type DocAsk, type DocInstanceStatus, type DocRole } from "@/lib/docs";
import { declineAction, signAction } from "./actions";

export type SignerLite = {
  id: string;
  role: string;
  seq: number;
  label: string;
  displayName: string;
  status: string;
  signedAt: string | null;
  isMe: boolean;
  declineReason?: string | null;
};

// 簽署側欄：進度 → 同意聲明（預設不勾）→ 簽名 → 確認。
// ⚠️ 「同意」與「簽名圖」都在這裡，但真正的判斷（輪到誰、雜湊對不對、是不是本人）全在 server 的 consentAndSign。
export default function SignView({
  instanceId,
  status,
  hash,
  expiresAt,
  signers,
  myTurn,
  asks = [],
  isMine,
  saved,
  admin,
}: {
  instanceId: string;
  status: string;
  hash: string;
  expiresAt: string | null;
  signers: SignerLite[];
  myTurn: boolean;
  asks?: DocAsk[];
  isMine: boolean;
  saved: string | null;
  admin: boolean;
}) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  // 本人確認項：預設全部不勾（不能預設同意）；必勾項沒勾不開放送出
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [img, setImg] = useState<string | null>(null);
  const [keep, setKeep] = useState(!saved);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<null | { completed: boolean }>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, start] = useTransition();

  const mustOk = asks.every((a) => a.kind !== "must" || answers[a.key] === true);
  const canSubmit = myTurn && consent && mustOk && !!img && !busy && !done;

  function submit() {
    if (!img) return;
    setErr(null);
    start(async () => {
      const r = await signAction(instanceId, { consent, answers, signatureImg: img, hashSeen: hash, saveAsDefault: keep });
      if (!r.ok) return setErr(r.error);
      setDone({ completed: r.completed });
      router.refresh();
    });
  }
  function decline() {
    setErr(null);
    start(async () => {
      const r = await declineAction(instanceId, reason);
      if (!r.ok) return setErr(r.error ?? "失敗");
      setDeclining(false);
      router.refresh();
    });
  }

  const st = (done?.completed ? "completed" : status) as DocInstanceStatus;

  return (
    <aside className="grid gap-4 lg:sticky lg:top-20">
      {/* 進度 */}
      <section className="rounded-lg border border-line bg-panel p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold">簽署進度</h2>
          <span className={`text-xs rounded px-2 py-0.5 ${st === "completed" ? "bg-ok/15 text-ok" : st === "pending" ? "bg-brand/15 text-brand2" : "bg-danger/15 text-danger"}`}>{STATUS_LABEL[st] ?? st}</span>
        </div>
        <ol className="grid gap-1.5 text-sm">
          {signers.map((s) => (
            <li key={s.id} className={`flex items-center gap-2 ${s.isMe ? "font-bold" : ""}`}>
              <span className={`w-5 h-5 rounded-full grid place-items-center text-11 ${s.status === "signed" ? "bg-ok-solid text-onsolid" : s.status === "declined" ? "bg-danger-solid text-onsolid" : "bg-panel2 text-tx3 border border-line"}`}>{s.status === "signed" ? "✓" : s.seq}</span>
              <span className="text-tx2 text-xs w-10">{ROLE_LABEL[s.role as DocRole] ?? s.role}</span>
              <span className="truncate">{s.displayName || s.label}{s.isMe ? "（你）" : ""}</span>
              {s.signedAt && <span className="ml-auto text-11 text-tx3">{s.signedAt.slice(0, 10)}</span>}
            </li>
          ))}
        </ol>
        {expiresAt && st === "pending" && <p className="text-11 text-tx3 mt-2">簽署期限：{expiresAt}</p>}
      </section>

      {/* 本人簽署 */}
      {st === "pending" && isMine && (
        <section className="rounded-lg border border-line bg-panel p-4 grid gap-3">
          {done || signers.some((s) => s.isMe && s.status === "signed") ? (
            <p className="text-sm text-ok font-bold">已完成你的簽署，等其他簽署人完成。</p>
          ) : !myTurn ? (
            <p className="text-sm text-tx2">還沒輪到你——前一順位的簽署人完成後，這裡就會開放。</p>
          ) : (
            <>
              <h2 className="font-bold">本人確認簽署</h2>
              {asks.length > 0 && (
                <div className="grid gap-1.5 rounded-md border border-line p-2.5">
                  <p className="text-xs text-tx2">請逐項確認（文件上對應的格子會依你的選擇打勾）</p>
                  {asks.map((a) => (
                    <label key={a.key} className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="checkbox" className="mt-1" checked={answers[a.key] === true} onChange={(e) => setAnswers({ ...answers, [a.key]: e.target.checked })} />
                      <span>
                        {a.label}
                        <span className={`ml-1.5 text-10 rounded px-1 ${a.kind === "must" ? "bg-danger/15 text-danger" : "bg-panel2 text-tx3"}`}>{a.kind === "must" ? "必勾" : "可選"}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-tx2 leading-relaxed rounded-md bg-panel2 p-2">{E_SIGN_CLAUSE}</p>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{CONSENT_LABEL}</span>
              </label>
              <div>
                <p className="text-xs text-tx2 mb-1">簽名</p>
                <SignaturePad value={img} onChange={setImg} saved={saved} disabled={busy} />
              </div>
              <label className="flex items-center gap-2 text-xs text-tx2">
                <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                {saved ? "用這一筆更新我存的簽名檔" : "存成我的簽名檔，下次可以直接選用"}
              </label>
              {err && <p className="text-sm text-danger">{err}</p>}
              <SubmitButton state={busy ? "pending" : "idle"} disabled={!canSubmit} onClick={submit} className="w-full">
                確認簽署
              </SubmitButton>
              {!declining ? (
                <button type="button" className="text-xs text-tx3 underline justify-self-start" onClick={() => setDeclining(true)}>內容有問題，我要拒簽</button>
              ) : (
                <div className="grid gap-2">
                  <textarea className="w-full rounded-md border border-line bg-field text-sm p-2 min-h-20" placeholder="請說明原因（負責人會看到）" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <button type="button" className="text-sm rounded-md border border-danger text-danger px-3 py-1.5" disabled={busy || !reason.trim()} onClick={decline}>送出拒簽</button>
                    <button type="button" className="text-sm text-tx2 px-2" onClick={() => setDeclining(false)}>取消</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {st === "completed" && (
        <section className="rounded-lg border border-line bg-panel p-4 text-sm grid gap-2">
          <p className="font-bold text-ok">文件已完成簽署</p>
          <p className="text-tx2 text-xs">雙方看到的是同一份：右上角「列印／PDF」可以存成 PDF。</p>
        </section>
      )}
      {(st === "declined" || st === "expired" || st === "void") && (
        <section className="rounded-lg border border-line bg-panel p-4 text-sm text-tx2">
          {st === "declined" ? "這份文件已被拒簽，負責人會重新確認內容後再發一份。" : st === "expired" ? "簽署期限已過，請聯絡負責人重新開放。" : "這份文件已作廢，不需要再簽；若有新版本會另外通知你。"}
          {st === "declined" && signers.filter((s) => s.status === "declined").map((s) => (
            <div key={s.id} className="mt-3 rounded-md border border-danger/40 bg-danger/5 p-2.5 grid gap-1">
              <div className="text-xs text-danger font-bold">{s.displayName || s.label}{s.isMe ? "（你）" : ""} 拒簽{s.signedAt ? `・${s.signedAt.slice(0, 10)}` : ""}</div>
              <div className="text-sm text-tx whitespace-pre-wrap break-words">{s.declineReason || "（沒有填原因）"}</div>
            </div>
          ))}
        </section>
      )}
      {admin && !isMine && <p className="text-11 text-tx3">你以後台身分唯讀檢視這份文件。</p>}
    </aside>
  );
}
