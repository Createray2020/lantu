"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FIELD_SM, SELECT_SM } from "@/components/ui/Field";
import { STATUS_LABEL, type DocInstanceStatus } from "@/lib/docs";
import { createDocTaskAction } from "../actions";

export type TemplateOpt = { key: string; name: string; version: number; category: string };
export type CoachOpt = { id: string; name: string; rankCode: string | null };
export type TaskView = { id: string; title: string; version: number; deadline: string | null; note: string; createdAt: string; total: number; done: number; rows: { coachId: string; name: string; instanceId: string | null; status: string }[] };

export default function TasksBoard({ templates, people, tasks }: { templates: TemplateOpt[]; people: CoachOpt[]; tasks: TaskView[] }) {
  const router = useRouter();
  const [key, setKey] = useState(templates[0]?.key ?? "");
  const [sel, setSel] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const create = () => start(async () => {
    const r = await createDocTaskAction({ templateKey: key, coachIds: sel, deadline: deadline || null, note });
    if (!r.ok) return setMsg(r.error);
    setMsg(`已建立：產生 ${r.created} 份${r.skipped?.length ? `，${r.skipped.length} 位缺簽署人（${r.skipped.join("、")}）` : ""}`);
    setSel([]);
    router.refresh();
  });
  return (
    <div className="grid gap-5">
      <section className="border border-line rounded-lg p-4 grid gap-3">
        <h2 className="font-bold">新增補簽任務</h2>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1 text-xs text-tx3">文件（最新啟用版）
            <select className={SELECT_SM} value={key} onChange={(e) => setKey(e.target.value)}>
              {templates.map((t) => <option key={t.key} value={t.key}>{t.name} v{t.version}</option>)}
            </select></label>
          <label className="grid gap-1 text-xs text-tx3">簽署期限
            <input type="date" className={`${FIELD_SM} w-40`} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          <label className="grid gap-1 text-xs text-tx3 flex-1 min-w-40">備註
            <input className={`${FIELD_SM} w-full`} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        <div>
          <div className="flex items-center gap-3 text-xs mb-2">
            <span className="text-tx3">對象（已開通教練）</span>
            <button type="button" className="underline text-tx2" onClick={() => setSel(people.map((p) => p.id))}>全選</button>
            <button type="button" className="underline text-tx2" onClick={() => setSel([])}>清空</button>
            <span className="text-tx3">已選 {sel.length} 位</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <label key={p.id} className={`text-xs rounded border px-2 py-1 cursor-pointer ${sel.includes(p.id) ? "border-brand2 text-brand2" : "border-line"}`}>
                <input type="checkbox" className="mr-1" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} />{p.name}{p.rankCode ? `（${p.rankCode}）` : ""}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="rounded-md bg-brand text-onbrand font-bold text-sm px-4 py-2 disabled:opacity-40" disabled={busy || !key || !sel.length} onClick={create}>建立並發出</button>
          {msg && <span className="text-xs text-tx2">{msg}</span>}
        </div>
      </section>

      <section className="grid gap-3">
        {tasks.length === 0 && <p className="text-sm text-tx3">還沒有補簽任務。</p>}
        {tasks.map((t) => <TaskCard key={t.id} t={t} />)}
      </section>
    </div>
  );
}

function TaskCard({ t }: { t: TaskView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-bold">{t.title}</span>
        <span className="text-11 text-tx3">v{t.version}・{t.createdAt} 建立{t.deadline ? `・期限 ${t.deadline}` : ""}</span>
        <span className={`text-xs rounded px-2 py-0.5 ${t.done === t.total ? "bg-ok/15 text-ok" : "bg-panel2 text-tx2"}`}>{t.done}／{t.total} 完成</span>
        <button type="button" className="ml-auto text-xs rounded-md border border-line px-2.5 py-1" onClick={() => setOpen((o) => !o)}>{open ? "收合" : "看對象"}</button>
      </div>
      {t.note && <p className="text-xs text-tx2">{t.note}</p>}
      {open && (
        <ul className="grid sm:grid-cols-2 gap-1 text-xs">
          {t.rows.map((r) => (
            <li key={r.coachId} className="flex items-center gap-2 rounded bg-panel2 px-2 py-1">
              <span className={`w-2 h-2 rounded-full ${r.status === "completed" ? "bg-ok" : r.status === "declined" || r.status === "expired" ? "bg-danger" : "bg-line2"}`} />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="text-tx3">{r.status === "none" ? "未產生" : STATUS_LABEL[r.status as DocInstanceStatus] ?? r.status}</span>
              {r.instanceId && <Link href={`/sign/${r.instanceId}`} className="underline">查看</Link>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
