"use client";

import { useMemo, useState } from "react";

/**
 * 教練名單的狀態列＋篩選。
 *
 * 為什麼要有它：「未定級」與「未設期限」都是**帳號被開通了卻沒設定完**的半成品——
 * 前者拿不到客戶數上限、後者永遠不會到期，兩種都是無聲的漏洞。
 * 原本這兩件事只印在每一列的角落，二十列以後就沒有人看得出來「還有幾個沒設定」。
 * 「30 天內到期」同理：期限到了才發現，教練已經被鎖成唯讀了。
 *
 * 資料都在 props 裡（/admin 本來就撈了全部教練），不需要新的查詢；
 * 列本身仍由伺服器算好整串傳進來，這裡只決定「哪些列要顯示」。
 */
export type RosterRow = {
  key: string;
  /** 沒有職級：拿不到客戶數上限，制度上也還不算正式在編。 */
  unranked: boolean;
  /** 沒有使用期限：不受唯讀鎖限制，等於永久開通。 */
  noLicense: boolean;
  /** 30 天內到期（已到期的不算在內，那是另一種狀態）。 */
  expiring: boolean;
  node: React.ReactNode;
};

type Filter = "all" | "unranked" | "noLicense" | "expiring";

const LABEL: Record<Exclude<Filter, "all">, string> = {
  unranked: "未定級",
  noLicense: "未設期限",
  expiring: "30 天內到期",
};

export default function CoachRoster({
  rows,
  total,
  pending,
  colSpan,
  head,
  footer,
}: {
  rows: RosterRow[];
  total: number;
  pending: number;
  colSpan: number;
  head: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      unranked: rows.filter((r) => r.unranked).length,
      noLicense: rows.filter((r) => r.noLicense).length,
      expiring: rows.filter((r) => r.expiring).length,
    }),
    [rows],
  );

  const shown = filter === "all" ? rows : rows.filter((r) => r[filter]);

  const chip = (k: Exclude<Filter, "all">, tone: string) => (
    <button
      type="button"
      onClick={() => setFilter((f) => (f === k ? "all" : k))}
      aria-pressed={filter === k}
      className={
        "rounded-md px-2 py-0.5 border transition " +
        (filter === k
          ? "bg-[#c99a5b] text-[#08202a] border-[#c99a5b] font-bold"
          : "border-white/12 hover:bg-[#17406a] hover:text-white")
      }
      title={filter === k ? "再按一次取消篩選" : `只看${LABEL[k]}的帳號`}
    >
      {LABEL[k]} <b className={filter === k ? "" : tone}>{counts[k]}</b> 位
    </button>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-sm text-[#a9bccf]">
        <span>共 {total} 位</span>
        <span className="text-[#6b7d8f]">·</span>
        <span>
          待審核 <b className="text-[#e0bd8b]">{pending}</b> 位
        </span>
        <span className="text-[#6b7d8f]">·</span>
        {chip("unranked", "text-[#e0bd8b]")}
        {chip("noLicense", "text-[#e0bd8b]")}
        {chip("expiring", "text-[#ff9d9f]")}
        {filter !== "all" && (
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="text-xs text-[#a9bccf] underline underline-offset-2 hover:text-white"
          >
            顯示全部
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          {head}
          <tbody>
            {shown.map((r) => r.node)}
            {shown.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-3 py-8 text-center text-[#6f869c]">
                  {rows.length === 0 ? "尚無教練註冊。" : `沒有${LABEL[filter as Exclude<Filter, "all">]}的帳號。`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </>
  );
}
