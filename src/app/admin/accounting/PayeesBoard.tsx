"use client";

import { useMemo, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { TAX_MODE_LABEL, type AcctState, type PayeeRec, type TaxMode } from "@/lib/acctEngine";
import { savePayeeAction, deletePayeeAction } from "./actions";
import { useAcct, card, h2, hint, btn, xbtn } from "./AcctParts";

// 帳務 › 受款人（2026/10/08）：教練一人一列（沒填的也列出來，標「未設定」）＋外部受款人。
// 欄位就地改、離開欄位就存。教練端「我的檔案 › 收款設定」寫的是同一列。
type Row = PayeeRec & { isNew?: boolean };
const BLANK = (coachId: string | null, name: string): Row => ({ id: "", coachId, name, bankCode: "", bankName: "", branch: "", accountName: "", accountNo: "", taxMode: "", note: "" });
const filled = (r: PayeeRec) => !!(r.accountNo || r.bankName || r.bankCode);

type Save = (r: Row, patch: Partial<PayeeRec>) => void;
function Cell({ r, k, w, ph, mode, save }: { r: Row; k: keyof PayeeRec; w: string; ph?: string; mode?: string; save: Save }) {
return (
  <input key={`${r.id || r.coachId}-${k}`} className={`${FIELD_SM} ${w}`} defaultValue={String(r[k] ?? "")} placeholder={ph} inputMode={mode as "numeric" | undefined}
    onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(r[k] ?? "")) save(r, { [k]: v } as Partial<PayeeRec>); }} />
);
}
function Tax({ r, save }: { r: Row; save: Save }) {
return (
  <select className={SELECT_SM} value={r.taxMode} onChange={(e) => save(r, { taxMode: e.target.value as TaxMode })}>
    {(Object.keys(TAX_MODE_LABEL) as TaxMode[]).map((m) => <option key={m} value={m}>{TAX_MODE_LABEL[m]}</option>)}
  </select>
);
}
function Table({ list, external, save, remove }: { list: Row[]; external: boolean; save: Save; remove: (r: PayeeRec) => void }) {
return (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead><tr className="text-xs text-tx3"><th className="text-left py-1">{external ? "名稱" : "教練"}</th><th className="text-left">銀行代碼</th><th className="text-left">銀行</th><th className="text-left">分行</th><th className="text-left">戶名</th><th className="text-left">帳號</th><th className="text-left">稅務方式</th><th className="text-left">備註</th><th /></tr></thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.id || r.coachId || r.name} className="border-t border-line align-middle">
            <td className="py-1.5 whitespace-nowrap">{external ? <Cell r={r} k="name" w="w-32" save={save} /> : <>{r.name}{!filled(r) && <span className="text-10 text-tx3 ml-1">未設定</span>}</>}</td>
            <td><Cell r={r} k="bankCode" w="w-16" ph="808" mode="numeric" save={save} /></td>
            <td><Cell r={r} k="bankName" w="w-24" ph="玉山" save={save} /></td>
            <td><Cell r={r} k="branch" w="w-24" save={save} /></td>
            <td><Cell r={r} k="accountName" w="w-28" save={save} /></td>
            <td><Cell r={r} k="accountNo" w="w-40" mode="numeric" save={save} /></td>
            <td><Tax r={r} save={save} /></td>
            <td><Cell r={r} k="note" w="w-32" save={save} /></td>
            <td className="text-right">{external && <button className={xbtn} onClick={() => remove(r)}>✕</button>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
}


export default function PayeesBoard({ initial }: { initial: AcctState }) {
  const { S, setS, run, status } = useAcct(initial);
  // 教練列：有列用列、沒列用空白；外部列：coachId 為空
  const rows = useMemo<Row[]>(() => {
    const book = S.payeeBook ?? [], coaches = S.coachList ?? [];
    return [
      ...coaches.map((c) => book.find((p) => p.coachId === c.id) ?? BLANK(c.id, c.name)),
      ...book.filter((p) => !p.coachId),
    ];
  }, [S.payeeBook, S.coachList]);
  const [adding, setAdding] = useState<Row | null>(null);

  const putLocal = (r: PayeeRec) => setS((s) => {
    const b = [...(s.payeeBook ?? [])];
    const i = b.findIndex((p) => (r.id && p.id === r.id) || (r.coachId && p.coachId === r.coachId));
    if (i >= 0) b[i] = r; else b.push(r);
    return { ...s, payeeBook: b };
  });
  const save = (r: Row, patch: Partial<PayeeRec>) => {
    const next: PayeeRec = { ...r, ...patch };
    const local = { ...next, id: next.id || `tmp-${next.coachId ?? Math.random().toString(36).slice(2, 8)}` };
    putLocal(local);
    run(async () => {
      const res = await savePayeeAction(next.id || null, next);
      if (res.ok && res.info && res.info !== local.id) putLocal({ ...local, id: res.info });
      return res;
    }, "已存");
  };
  const remove = async (r: PayeeRec) => {
    if (!r.id || !await confirmDialog(`刪除受款人「${r.name}」？分潤裡的名字還在，只是對不到帳號。`, { danger: true })) return;
    setS((s) => ({ ...s, payeeBook: (s.payeeBook ?? []).filter((p) => p.id !== r.id) }));
    run(() => deletePayeeAction(r.id), "已刪");
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-tx3 text-right h-4">{status}</div>
      <div className={card}>
        <h2 className={h2}>教練</h2>
        <p className={`${hint} mb-2`}>每位教練一列。教練在「我的檔案 › 收款設定」填的就是這裡；這裡改了教練那邊也會變。</p>
        <Table list={rows.filter((r) => r.coachId)} external={false} save={save} remove={remove} />
      </div>
      <div className={card}>
        <h2 className={h2}>外部受款人</h2>
        <p className={`${hint} mb-2`}>系統商、講師、場地這類不是教練的對象。名稱要跟拆分列（參數設定）或每筆收款上填的名字一樣，分潤才對得上。</p>
        <Table list={rows.filter((r) => !r.coachId)} external save={save} remove={remove} />
        {adding ? (
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
            <input className={`${FIELD_SM} w-40`} autoFocus placeholder="名稱（例：創造共好）" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
            <button className={`${btn} border-brand2 text-brand2`} disabled={!adding.name.trim()} onClick={() => { save(adding, {}); setAdding(null); }}>新增</button>
            <button className={btn} onClick={() => setAdding(null)}>取消</button>
          </div>
        ) : <button className={`${btn} mt-2`} onClick={() => setAdding(BLANK(null, ""))}>＋ 外部受款人</button>}
      </div>
    </div>
  );
}
