"use client";

// 官網首頁的教練臉孔牆。
//
// 改版前這裡是六個連結：點下去離開首頁、跳到 /coaches/[id]。問題不是少了一頁，
// 是**首頁把教練自己填的東西幾乎全丟掉了**——照片、名字、第一個專長，就這樣。
// 標語、自我介紹、年資、背景、證照、服務方式、服務地區全部看不到（Ray 2026/09/07 回報）。
//
// 所以改成點出浮層、就地看完整檔案：訪客在首頁往下滑到「陪你走的人」時還在比較階段，
// 每看一位就跳走一次，等於每次都要重新找回原本的位置。看完整檔案不該有這個代價。
// 想繼續往下走的人，浮層底下才給「看完整介紹頁 →」與「選擇這位教練 →」兩個出口。

import { useState } from "react";
import Link from "next/link";
import Modal from "./ui/Modal";
import CoachCard from "./CoachCard";
import SpecialtyChip from "./SpecialtyChip";
import type { PublicCoach } from "@/lib/coachProfile";

export default function CoachSpotlight({ coaches }: { coaches: PublicCoach[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = coaches.find((c) => c.id === openId) ?? null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {coaches.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setOpenId(c.id)}
            aria-haspopup="dialog"
            className="group text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-xl"
          >
            {c.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.photoUrl}
                alt={c.name}
                loading="lazy"
                decoding="async"
                className="w-full aspect-square rounded-xl object-cover border border-line2 group-hover:border-brand transition"
              />
            ) : (
              <div className="w-full aspect-square rounded-xl bg-panel2 border border-line group-hover:border-brand transition grid place-items-center text-3xl text-brand shadow-e1">
                {c.name.slice(0, 1)}
              </div>
            )}
            <div className="text-sm mt-2 group-hover:text-brand2">{c.name}</div>
            {/* 主專長＝specialties[0]，順序由教練自己在「我的檔案」拖曳決定。 */}
            {c.specialties[0] && (
              <SpecialtyChip name={c.specialties[0]} primary className="mt-1 px-2 py-0.5 text-10 max-w-full truncate" />
            )}
            <div className="text-10 text-tx3 mt-1 group-hover:text-tx2">點開看全部</div>
          </button>
        ))}
      </div>

      {open && (
        <Modal onClose={() => setOpenId(null)} label={`${open.name} 的完整檔案`} width="max-w-xl">
          <div className="p-4 sm:p-5">
            {/* compact 不傳＝false：自我介紹在這裡是全文。
                浮層存在的唯一理由就是「看全部」，再截斷一次等於白開。 */}
            <CoachCard {...open} />
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <Link href={`/coaches/${open.id}`}
                className="rounded-lg bg-brand text-onbrand font-bold px-4 py-2 text-sm hover:bg-brand2">
                看完整介紹頁 →
              </Link>
              <Link href="/coaches"
                className="text-sm text-tx2 hover:text-tx underline underline-offset-4">
                比較所有教練
              </Link>
              <div className="flex-1" />
              {open.code && (
                <span className="font-mono text-10 tracking-wider text-tx3" title="教練編號">
                  {open.code}
                </span>
              )}
              <button type="button" onClick={() => setOpenId(null)}
                className="rounded-lg px-3 py-1.5 text-sm border border-line2 text-tx2 hover:bg-panel3">
                關閉
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
