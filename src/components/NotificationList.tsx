"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { KIND_LABEL, type NotifyKind } from "@/lib/notify";

export type NotificationRow = { id: string; kind: string; title: string; body: string; href: string; read: boolean; at: string };

// 教練端與客戶端共用的通知清單。標已讀走各自的 action（side 決定）。
export default function NotificationList({ side, rows }: { side: "coach" | "client"; rows: NotificationRow[] }) {
  const [list, setList] = useState(rows);
  const [pending, start] = useTransition();
  const mark = (ids: string[] | "all") => start(async () => {
    const mod = side === "coach" ? await import("@/app/dashboard/caseActions") : await import("@/app/portal/caseActions");
    const r = await mod.markNotificationsReadAction(ids);
    if (r.ok) setList((l) => l.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, read: true } : n)));
  });
  const unread = list.filter((n) => !n.read).length;
  const fmt = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  return (
    <div className="bg-panel border border-line rounded-xl shadow-e1">
      <div className="flex items-center justify-between p-3 border-b border-line text-xs">
        <span className="text-tx2">未讀 {unread}</span>
        {unread > 0 && <button className="text-brand2" disabled={pending} onClick={() => mark("all")}>全部標為已讀</button>}
      </div>
      <ul>
        {list.map((n) => (
          <li key={n.id} className={`flex gap-3 px-3 py-2.5 border-b border-line last:border-0 ${n.read ? "" : "bg-brand/5"}`}>
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-transparent" : "bg-brand"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-tx3"><span>{KIND_LABEL[n.kind as NotifyKind] ?? n.kind}</span><span>{fmt(n.at)}</span></div>
              <div className="text-sm font-bold">{n.href ? <Link href={n.href} className="hover:underline" onClick={() => !n.read && mark([n.id])}>{n.title}</Link> : n.title}</div>
              {n.body && <div className="text-xs text-tx2 mt-0.5 whitespace-pre-line">{n.body}</div>}
            </div>
            {!n.read && <button className="text-10 text-tx3 self-start" disabled={pending} onClick={() => mark([n.id])}>已讀</button>}
          </li>
        ))}
        {!list.length && <li className="px-3 py-6 text-center text-xs text-tx3">目前沒有通知。</li>}
      </ul>
    </div>
  );
}
