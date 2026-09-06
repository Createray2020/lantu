"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteCollaboratorAction, revokeCollaboratorAction } from "./collabActions";

export type CollaboratorLite = {
  id: string;
  coachName: string | null;
  coachCode: string | null;
  status: string;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待對方接受",
  accepted: "共同執案中",
};

// 共同執案面板（只有主責教練看得到）。
// 邀請用「教練編號」而不是下拉全站教練名單：編號是教練自己給出去的東西，
// 名單則等於把全公司的人事表攤在每一位教練面前。
export default function Collaborators({
  clientId,
  collaborators,
  readOnly = false,
}: {
  clientId: string;
  collaborators: CollaboratorLite[];
  /** 使用期限到期：還看得到名單、還能移除，但不能再邀人。 */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function invite() {
    setMsg(null);
    start(async () => {
      const r = await inviteCollaboratorAction(clientId, code);
      if (r.ok) {
        setMsg({ ok: true, text: `已邀請 ${r.coachName ?? "該教練"}，等待對方接受。` });
        setCode("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  }

  function revoke(id: string, name: string | null) {
    if (!confirm(`移除 ${name ?? "這位教練"}？對方會立刻看不到這位客戶的資料。`)) return;
    setMsg(null);
    start(async () => {
      const r = await revokeCollaboratorAction(clientId, id);
      if (r.ok) router.refresh();
      else setMsg({ ok: false, text: r.error });
    });
  }

  const active = collaborators.length;

  return (
    <section className="mt-3 bg-panel border border-line rounded-xl shadow-e1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
      >
        <span className="text-sm font-bold text-tx">共同執案</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-panel text-tx2 border border-line shadow-e1">
          {active === 0 ? "未邀請" : `${active} 位協作教練`}
        </span>
        <div className="flex-1" />
        <span className="text-tx3 text-xs">{open ? "收合 ▲" : "展開 ▼"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 grid gap-3 border-t border-line pt-3">
          <p className="text-[12px] text-tx2">
            輸入對方的教練編號邀請他一起看這位客戶。協作教練看得到客戶資料、諮詢紀錄與所有報告書，
            但<b className="text-brand2">只能看不能改</b>；你隨時可以移除。
          </p>

          <div className="flex flex-wrap gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="教練編號（例 FC2608012）"
              disabled={readOnly || pending}
              className="flex-1 min-w-[180px] bg-field border border-line2 rounded-md text-sm px-3 py-2 text-tx disabled:opacity-50"
            />
            <button
              onClick={invite}
              disabled={readOnly || pending || !code.trim()}
              className="px-3 py-1.5 text-sm font-bold rounded-md bg-brand text-onbrand disabled:opacity-40 disabled:cursor-not-allowed"
            >
              邀請
            </button>
          </div>

          {msg && (
            <div className={"text-sm " + (msg.ok ? "text-ok" : "text-danger")}>{msg.text}</div>
          )}

          {collaborators.length === 0 ? (
            <p className="text-[12px] text-tx3">目前沒有協作教練。</p>
          ) : (
            <ul className="grid gap-1.5">
              {collaborators.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
                  <span className="text-sm text-tx">{c.coachName ?? "（未命名教練）"}</span>
                  {c.coachCode && <span className="text-[11px] text-tx3 tabular-nums">{c.coachCode}</span>}
                  <span
                    className={
                      "text-[10px] px-1.5 py-0.5 rounded border " +
                      (c.status === "accepted"
                        ? "border-ok/50 text-ok bg-ok/10"
                        : "border-brand/50 text-brand2 bg-brand/10")
                    }
                  >
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => revoke(c.id, c.coachName)}
                    disabled={pending}
                    className="text-tx3 hover:text-danger text-xs disabled:opacity-50"
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
