"use client";

// 官網公開教練列表。未登入可看；已登入的客戶可以直接在這裡選教練送出連結申請。
// 篩選只做專長——客戶心裡想的是「誰能幫我處理退休這件事」，不是職級。

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CoachCard } from "@/app/dashboard/profile/ProfileEditor";
import { pickCoachAction } from "./actions";
import type { PublicCoach } from "@/lib/coachProfile";

export type LinkState =
  | { state: "guest" }
  | { state: "none" }
  | { state: "pending"; coachName: string | null }
  | { state: "linked"; coachName: string | null };

export default function CoachList({
  coaches, link,
}: {
  coaches: PublicCoach[];
  link: LinkState;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const allSpecialties = useMemo(
    () => [...new Set(coaches.flatMap((c) => c.specialties))],
    [coaches],
  );
  const shown = filter ? coaches.filter((c) => c.specialties.includes(filter)) : coaches;

  function pick(coachId: string, name: string) {
    setMsg(null);
    start(async () => {
      const r = await pickCoachAction(coachId);
      setMsg(r.ok
        ? { ok: true, text: `已送出連結申請給 ${name}，等待對方接受` }
        : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {link.state === "linked" && (
        <div className="rounded-xl border border-[#7bd88f]/30 bg-[#7bd88f]/10 px-4 py-3 text-sm text-[#7bd88f]">
          你已經連結教練{link.coachName ? `：${link.coachName}` : ""}。
          <Link href="/portal" className="underline underline-offset-4 ml-2">回我的規劃</Link>
        </div>
      )}
      {link.state === "pending" && (
        <div className="rounded-xl border border-[#c99a5b]/40 bg-[#c99a5b]/10 px-4 py-3 text-sm text-[#e0bd8b]">
          已送出連結申請{link.coachName ? `給 ${link.coachName}` : ""}，等待對方接受。
        </div>
      )}

      {allSpecialties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFilter(null)}
            className={`rounded-full px-3 py-1.5 text-xs border ${
              filter === null ? "bg-[#c99a5b] text-[#08202a] border-[#c99a5b] font-bold"
                              : "border-white/15 text-[#a7bacb] hover:border-white/35"
            }`}>
            全部（{coaches.length}）
          </button>
          {allSpecialties.map((s) => (
            <button key={s} type="button" onClick={() => setFilter(s === filter ? null : s)}
              className={`rounded-full px-3 py-1.5 text-xs border ${
                filter === s ? "bg-[#c99a5b] text-[#08202a] border-[#c99a5b] font-bold"
                             : "border-white/15 text-[#a7bacb] hover:border-white/35"
              }`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {msg && (
        <div className={`text-sm ${msg.ok ? "text-[#7fb894]" : "text-[#ff9b9b]"}`}>
          {msg.ok ? `${msg.text} ✓` : `⚠ ${msg.text}`}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-[#a7bacb] text-sm">
          {coaches.length === 0
            ? "教練們正在準備自我介紹，很快就會在這裡與你見面。"
            : "這個專長目前沒有教練，換一個看看。"}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((c) => (
            <div key={c.id} className="flex flex-col">
              <CoachCard {...c} compact />
              <div className="flex items-center gap-2 mt-2">
                <Link href={`/coaches/${c.id}`}
                  className="text-xs text-[#a7bacb] hover:text-white underline underline-offset-4">
                  看完整介紹
                </Link>
                <div className="flex-1" />
                {link.state === "none" && (
                  <button type="button" disabled={pending}
                    onClick={() => pick(c.id, c.name)}
                    className="rounded-lg bg-[#c99a5b] text-[#08202a] font-bold px-3 py-1.5 text-xs hover:bg-[#e0bd8b] disabled:opacity-40">
                    {pending ? "送出中…" : "選擇這位教練"}
                  </button>
                )}
                {link.state === "guest" && (
                  <Link href="/client/sign-up"
                    className="rounded-lg bg-[#c99a5b] text-[#08202a] font-bold px-3 py-1.5 text-xs hover:bg-[#e0bd8b]">
                    註冊後選擇
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
