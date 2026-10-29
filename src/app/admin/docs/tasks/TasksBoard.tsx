"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FIELD_SM } from "@/components/ui/Field";
import { STATUS_LABEL, type DocInstanceStatus } from "@/lib/docs";
import { createDocTaskAction } from "../actions";
import { confirmDialog } from "@/components/ui/confirm";

export type TemplateOpt = { key: string; name: string; version: number; category: string };
export type CoachOpt = { id: string; name: string; rankCode: string | null };
export type TaskView = { id: string; title: string; version: number; deadline: string | null; note: string; createdAt: string; total: number; done: number; rows: { coachId: string; name: string; instanceId: string | null; status: string }[] };

export default function TasksBoard({ templates, people, tasks }: { templates: TemplateOpt[]; people: CoachOpt[]; tasks: TaskView[] }) {
  const router = useRouter();
  // LT04（2026/10/29）：一次勾多份文件；每份各自一張任務、各自追蹤狀態
  const [keys, setKeys] = useState<string[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [lines, setLines] = useState<{ title: string; created: number; already: string[]; skipped: string[]; error: string | null }[]>([]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleKey = (k: string) => setKeys((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const picked = templates.filter((t) => keys.includes(t.key));
  const create = async () => {
    const names = people.filter((p) => sel.includes(p.id)).map((p) => p.name);
    const ok = await confirmDialog(
      `將發出 ${picked.length} 份文件 × ${sel.length} 位：\n\n文件：\n${picked.map((t) => `・${t.name} v${t.version}`).join("\n")}\n\n對象：${names.join("、")}\n\n期限：${deadline || "不設"}${note.trim() ? `\n備註：${note.trim()}` : ""}\n\n同一份文件同版本已簽完或還在待簽的人會自動略過。`,
      { title: "確認發出補簽", okLabel: "建立並發出" },
    );
    if (!ok) return;
    start(async () => {
      setMsg(null); setLines([]);
      const r = await createDocTaskAction({ templateKeys: keys, coachIds: sel, deadline: deadline || null, note });
      if (!r.ok) return setMsg(r.error);
      setLines(r.lines ?? []);
      const failed = (r.lines ?? []).filter((l) => l.error);
      setMsg(`共產生 ${r.created ?? 0} 份${failed.length ? `；${failed.length} 份文件失敗，可修正後重送（已成功的不會重複產生）` : ""}`);
      if (!failed.length) { setSel([]); setKeys([]); }
      router.refresh();
    });
  };
  return (
    <div className="grid gap-5">
      <section className="border border-line rounded-lg p-4 grid gap-3">
        <h2 className="font-bold">新增補簽任務</h2>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="grid gap-1 text-xs text-tx3">簽署期限
            <input type="date" className={`${FIELD_SM} w-40`} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          <label className="grid gap-1 text-xs text-tx3 flex-1 min-w-40">備註
            <input className={`${FIELD_SM} w-full`} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        <div>
          <div className="flex items-center gap-3 text-xs mb-2">
            <span className="text-tx3">文件（最新啟用版，可複選）</span>
            <button type="button" className="underline text-tx2" onClick={() => setKeys(templates.map((t) => t.key))}>全選</button>
            <button type="button" className="underline text-tx2" onClick={() => setKeys([])}>清空</button>
            <span className="text-tx3">已選 {keys.length} 份</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {templates.length === 0 && <span className="text-xs text-tx3">沒有啟用中的範本。</span>}
            {templates.map((t) => (
              <label key={t.key} className={`text-xs rounded border px-2 py-1 cursor-pointer ${keys.includes(t.key) ? "border-brand2 text-brand2" : "border-line"}`}>
                <input type="checkbox" className="mr-1" checked={keys.includes(t.key)} onChange={() => toggleKey(t.key)} />{t.name} v{t.version}
              </label>
            ))}
          </div>
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
          <button type="button" className="rounded-md bg-brand text-onbrand font-bold text-sm px-4 py-2 disabled:opacity-40" disabled={busy || !keys.length || !sel.length} onClick={create}>建立並發出{keys.length && sel.length ? `（${keys.length} 份 × ${sel.length} 位）` : ""}</button>
          {msg && <span className="text-xs text-tx2">{msg}</span>}
        </div>
        {lines.length > 0 && (
          <ul className="grid gap-1 text-xs">
            {lines.map((l, i) => (
              <li key={i} className={`rounded px-2 py-1 ${l.error ? "bg-danger/10 text-danger" : "bg-panel2 text-tx2"}`}>
                <b className="text-tx">{l.title}</b>
                {l.error ? `：失敗（${l.error}）` : `：產生 ${l.created} 份`}
                {l.already.length > 0 && `・已簽或待簽同版本略過 ${l.already.length} 位（${l.already.join("、")}）`}
                {l.skipped.length > 0 && `・缺簽署人 ${l.skipped.length} 位（${l.skipped.join("、")}）`}
              </li>
            ))}
          </ul>
        )}
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
