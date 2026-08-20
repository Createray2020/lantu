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

const BTN = "rounded-lg px-3 py-1.5 text-sm border border-white/15 text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-40";

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

  const td = "px-3 py-2 border-t border-white/8";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-[#a9bccf]">官網上架中 <b className="text-[#e0bd8b]">{live}</b> 位</span>
        {missing.length > 0 && (
          <span className="text-[#c99a5b]">
            {missing.length} 位已開通但尚未填檔案（不會出現在官網）
          </span>
        )}
        <div className="flex-1" />
        <Link href="/coaches" className={BTN}>看官網教練頁 →</Link>
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-[#7fb894]" : "text-[#e08b7a]"}`}>
            {msg.ok ? `${msg.text} ✓` : `失敗：${msg.text}`}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
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
                  <div className="text-[11px] text-[#6f869c]">{r.email}</div>
                </td>
                <td className={`${td} text-[#a9bccf] max-w-[260px] truncate`}>
                  {r.headline ?? <span className="text-[#6f869c]">—</span>}
                </td>
                <td className={`${td} text-[11px] text-[#a9bccf]`}>
                  {r.specialties.length ? r.specialties.join("、") : "—"}
                </td>
                <td className={td}>{r.hasPhoto ? "✓" : "—"}</td>
                <td className={`${td} text-[11px] text-[#6f869c]`}>{r.updatedAt ?? "—"}</td>
                <td className={td}>
                  {r.status !== "active" ? (
                    <span className="text-[#6f869c] text-xs">帳號未開通</span>
                  ) : !r.hasProfile ? (
                    <span className="text-[#c99a5b] text-xs">尚未填寫</span>
                  ) : r.published ? (
                    <span className="text-[#7fb894] text-xs">官網顯示中</span>
                  ) : (
                    <span className="text-[#e08b7a] text-xs">已下架</span>
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
              <tr><td colSpan={7} className="px-3 py-8 text-center text-[#6f869c]">尚無教練。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
