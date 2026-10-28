import Link from "next/link";
import { canSignNow, isSigner, ROLE_LABEL, STATUS_LABEL, CASE_TYPE_LABEL, type DocCaseType, type DocInstanceStatus, type DocRole } from "@/lib/docs";
import type { Identity, InstanceWithSigners } from "@/lib/docsStore";

// 「我的文件」清單：教練端、客戶 portal、申請人進度頁、後台總覽共用。
// 一列＝一份文件實例：標題、狀態、簽署人進度、輪到我就亮「去簽署」。
export default function DocList({ list, me, empty = "目前沒有需要你處理的文件。", showCase = false }: { list: InstanceWithSigners[]; me: Identity; empty?: string; showCase?: boolean }) {
  if (!list.length) return <p className="text-sm text-tx3">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {list.map((i) => {
        const mine = i.signers.find((s) => isSigner(s, me));
        const myTurn = !!mine && i.status === "pending" && canSignNow(mine, i.signers);
        const st = i.status as DocInstanceStatus;
        const signed = i.signers.filter((s) => s.status === "signed").length;
        return (
          <li key={i.id} className={`rounded-lg border ${myTurn ? "border-brand2" : "border-line"} bg-panel px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1`}>
            <div className="min-w-0">
              <p className="font-bold truncate">{i.title} <span className="text-11 text-tx3 font-normal">v{i.version}{i.docNo ? `・${i.docNo}` : ""}</span></p>
              <p className="text-11 text-tx3">
                {showCase && <span className="mr-2">{CASE_TYPE_LABEL[i.caseType as DocCaseType] ?? i.caseType}</span>}
                {i.signers.map((s) => `${ROLE_LABEL[s.role as DocRole] ?? s.role}${s.displayName ? `・${s.displayName}` : ""}${s.status === "signed" ? " ✓" : ""}`).join("　")}
                {i.expiresAt && st === "pending" ? `　期限 ${i.expiresAt}` : ""}
              </p>
            </div>
            <span className={`text-xs rounded px-2 py-0.5 ${st === "completed" ? "bg-ok/15 text-ok" : st === "pending" ? "bg-panel2 text-tx2" : "bg-danger/15 text-danger"}`}>
              {STATUS_LABEL[st] ?? st}{st === "pending" ? `（${signed}/${i.signers.length}）` : ""}
            </span>
            <span className="ml-auto flex gap-2">
              {myTurn && <Link href={`/sign/${i.id}`} className="text-xs font-bold rounded-md bg-brand text-onbrand px-3 py-1.5">去簽署</Link>}
              {!myTurn && <Link href={`/sign/${i.id}`} className="text-xs rounded-md border border-line px-3 py-1.5 hover:bg-panel2">{st === "completed" ? "查看／下載" : "查看"}</Link>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
