"use client";

// 管理員檢視全體教練的公開檔案並可下架。
// 這裡不提供代改內容——檔案是教練自己的話，代寫會讓「這是他本人說的」失去意義。
// 內容有問題就下架並請本人修改。

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setPublishedAction } from "@/app/dashboard/profile/actions";

export type Row = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  hasProfile: boolean;
  published: boolean;
  headline: string | null;
  specialties: string[];
  hasPhoto: boolean;
  updatedAt: string | null;
};

const BTN = "rounded-lg px-3 py-1.5 text-sm border border-line2 text-tx2 hover:bg-panel3 disabled:opacity-40";

export default function ProfilesBoard({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const live = rows.filter((r) => r.status === "active" && r.hasProfile && r.published).length;
  const missing = rows.filter((r) => r.status === "active" && !r.hasProfile);

  function toggle(r: Row) {
    setMsg(null);
    start(async () => {
      const res = await setPublishedAction(r.id, !r.published);
      setMsg(res.ok
        ? { ok: true, text: `${r.name} 已${r.published ? "下架" : "上架"}` }
        : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }

  const td = "px-3 py-2 border-t border-line";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-tx2">官網上架中 <b className="text-brand2">{live}</b> 位</span>
        {missing.length > 0 && (
          <span className="text-brand">
            {missing.length} 位已開通但尚未填檔案（不會出現在官網）
          </span>
        )}
        <div className="flex-1" />
        <Link href="/coaches" className={BTN}>看官網教練頁 →</Link>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>
            {msg.ok ? `${msg.text} ✓` : `失敗：${msg.text}`}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-panel2 text-tx2 text-left text-xs">
              <th className="px-3 py-2">教練</th>
              <th className="px-3 py-2">標語</th>
              <th className="px-3 py-2">專長</th>
              <th className="px-3 py-2">照片</th>
              <th className="px-3 py-2">更新</th>
              <th className="px-3 py-2">官網狀態</th>
              <th className="px-3 py-2 text-right">動作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[11px] text-tx3">{r.email}</div>
                </td>
                <td className={`${td} text-tx2 max-w-[260px] truncate`}>
                  {r.headline ?? <span className="text-tx3">—</span>}
                </td>
                <td className={`${td} text-[11px] text-tx2`}>
                  {r.specialties.length ? r.specialties.join("、") : "—"}
                </td>
                <td className={td}>{r.hasPhoto ? "✓" : "—"}</td>
                <td className={`${td} text-[11px] text-tx3`}>{r.updatedAt ?? "—"}</td>
                <td className={td}>
                  {r.status !== "active" ? (
                    <span className="text-tx3 text-xs">帳號未開通</span>
                  ) : !r.hasProfile ? (
                    <span className="text-brand text-xs">尚未填寫</span>
                  ) : r.published ? (
                    <span className="text-ok text-xs">官網顯示中</span>
                  ) : (
                    <span className="text-danger text-xs">已下架</span>
                  )}
                </td>
                <td className={`${td} text-right`}>
                  {r.hasProfile && r.status === "active" && (
                    <button type="button" disabled={pending} className={BTN} onClick={() => toggle(r)}>
                      {r.published ? "下架" : "上架"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-tx3">尚無教練。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
