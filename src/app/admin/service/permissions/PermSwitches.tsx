"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CasePerms } from "@/lib/caseScope";
import { saveCasePermsAction } from "../actions";

export default function PermSwitches({ perms }: { perms: CasePerms }) {
  const router = useRouter();
  const [v, setV] = useState(perms);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const row = (k: "adminEdit" | "s3Edit" | "relationsEdit" | "collabView", label: string, hint: string) => (
    <label key={k} className="flex items-start gap-3 py-2 border-t border-line first:border-0">
      <input type="checkbox" className="mt-1" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
      <span><span className="text-sm font-bold">{label}</span><span className="block text-xs text-tx2">{hint}</span></span>
    </label>
  );
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h2 className="text-base font-bold mb-1">可調的開關</h2>
      <p className="text-xs text-tx2 mb-2">只開放這幾個判斷；其餘（客戶只看自己、主責才能改、行政財法改合約付款）寫死不開。</p>
      {row("adminEdit", "系統管理可直接改任何案件的進度", "關掉＝管理員只看不改（仍看得到全部）。預設開。")}
      {row("s3Edit", "S3 可改所屬教練的案件", "開＝S3 可以替所屬教練按本階段完成、改承諾日、暫停／結案。預設關：S3 只看、只了解原因。")}
      {row("relationsEdit", "客戶關係可改案件狀態與進度", "開＝客戶關係接到轉交後可直接暫停／結案／改進度。預設關：只處理標記（客訴／低分／待轉交）。")}
      <label className="flex items-start gap-3 py-2 border-t border-line">
        <input type="checkbox" className="mt-1" checked={v.financeScope === "commission"} onChange={(e) => setV({ ...v, financeScope: e.target.checked ? "commission" : "all" })} />
        <span><span className="text-sm font-bold">行政財法只看「正式委託」階段的案件</span><span className="block text-xs text-tx2">開＝案件總表只列第 1 階段的案（簽約、收款）。預設關：看全部案件的階段與狀態。</span></span>
      </label>
      {row("collabView", "共同執案的協作教練看得到服務進度", "協作教練本來就能看客戶資料（唯讀）；關掉＝客戶頁不顯示服務進度區塊。預設開。")}
      <div className="flex items-center gap-2 mt-3 text-xs">{msg && <span className="text-tx3">{msg}</span>}<button className="ml-auto text-xs rounded-md bg-brand text-onbrand px-3 py-1.5 disabled:opacity-40" disabled={pending} onClick={() => start(async () => { const r = await saveCasePermsAction(v); setMsg(r.ok ? "已儲存" : r.error); if (r.ok) router.refresh(); })}>儲存</button></div>
    </div>
  );
}
