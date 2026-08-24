"use client";

// 官網公開教練列表。未登入可看；已登入的客戶可以直接在這裡選教練送出連結申請。
// 篩選只做專長——客戶心裡想的是「誰能幫我處理退休這件事」，不是職級。
//
// 2026/08/24 Ray 拍板的派案規則，三件事一起看才不會覺得矛盾：
//   ① 所有教練都呈現在這一頁（C 階也在，卡片一模一樣）。
//   ② 只有 S1 以上（pickable）的卡片給「選擇這位教練」按鈕。
//   ③ 下方的「輸入教練編號」對所有已開通教練都有效，但**自動建議清單只列 S1 以上**——
//      C 階要被指定，客戶得從教練本人那裡拿到完整編號。這是刻意的：編號是 C 階的私下入場券，
//      不是公開目錄。所以千萬不要為了「方便」把 C 階也加進建議清單。

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CoachCard } from "@/app/dashboard/profile/ProfileEditor";
import { pickCoachAction, pickCoachByCodeAction } from "./actions";
import { normalizeCode } from "@/lib/codes";
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
                {c.code && (
                  <span className="font-mono text-[10px] tracking-wider text-[#6f869c]" title="教練編號">
                    {c.code}
                  </span>
                )}
                {/* C 階教練照常呈現，只是不給直接指定的按鈕（見檔頭的派案規則）。 */}
                {!c.pickable ? (
                  <span className="text-[11px] text-[#6f869c] border border-white/10 rounded-lg px-2.5 py-1.5">
                    需教練編號指定
                  </span>
                ) : link.state === "none" ? (
                  <button type="button" disabled={pending}
                    onClick={() => pick(c.id, c.name)}
                    className="rounded-lg bg-[#c99a5b] text-[#08202a] font-bold px-3 py-1.5 text-xs hover:bg-[#e0bd8b] disabled:opacity-40">
                    {pending ? "送出中…" : "選擇這位教練"}
                  </button>
                ) : link.state === "guest" ? (
                  <Link href="/client/sign-up"
                    className="rounded-lg bg-[#c99a5b] text-[#08202a] font-bold px-3 py-1.5 text-xs hover:bg-[#e0bd8b]">
                    註冊後選擇
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <CodeEntry coaches={coaches} link={link} />
    </div>
  );
}

/**
 * 用教練編號指定。
 * 自動建議只吃 pickable（S1 以上）；C 階教練查得到、但要打完整編號。
 */
function CodeEntry({ coaches, link }: { coaches: PublicCoach[]; link: LinkState }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const key = normalizeCode(raw);
  const suggestions = useMemo(() => {
    if (!key) return [];
    return coaches
      .filter((c) => c.pickable && c.code)
      .filter((c) => c.code!.includes(key) || c.name.includes(raw.trim()))
      .slice(0, 6);
  }, [coaches, key, raw]);

  function submit(code: string) {
    setMsg(null);
    start(async () => {
      const r = await pickCoachByCodeAction(code);
      if (r.ok) {
        setRaw("");
        setMsg({ ok: true, text: `已送出連結申請給 ${r.coachName ?? "該教練"}，等待對方接受` });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  }

  if (link.state === "linked" || link.state === "pending") return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <div className="text-sm font-bold mb-1">已經有指定的教練了？輸入教練編號</div>
      <p className="text-[12px] text-[#8ea3b6] leading-relaxed mb-3">
        每位嵐途教練都有一組專屬編號（格式如 <span className="font-mono text-[#c99a5b]">FC2609002</span>）。
        向你的教練索取後輸入，就會直接把連結申請送給他。
      </p>

      {link.state === "guest" ? (
        <Link href="/client/sign-up"
          className="inline-block rounded-lg bg-[#c99a5b] text-[#08202a] font-bold px-3 py-1.5 text-xs hover:bg-[#e0bd8b]">
          註冊後用編號指定
        </Link>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); if (key) submit(key); }}
          className="relative flex flex-wrap items-center gap-2"
        >
          <input
            value={raw}
            onChange={(e) => { setRaw(e.target.value); setMsg(null); }}
            placeholder="FC2609002"
            autoComplete="off"
            spellCheck={false}
            className="font-mono tracking-wider rounded-lg bg-[#0c2135] border border-white/15 px-3 py-2 text-sm w-48 focus:border-[#c99a5b] outline-none"
          />
          <button type="submit" disabled={pending || !key}
            className="rounded-lg bg-[#c99a5b] text-[#08202a] font-bold px-3 py-2 text-xs hover:bg-[#e0bd8b] disabled:opacity-40">
            {pending ? "送出中…" : "指定這位教練"}
          </button>

          {suggestions.length > 0 && (
            <ul className="absolute top-full left-0 mt-1 z-10 w-64 rounded-lg border border-white/15 bg-[#0c2135] shadow-lg overflow-hidden">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setRaw(c.code!)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#123049] flex items-center gap-2">
                    <span className="font-mono text-[#c99a5b]">{c.code}</span>
                    <span className="text-[#eef2f7]">{c.name}</span>
                    {c.rankLabel && <span className="text-[10px] text-[#6f869c]">{c.rankLabel}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}

      {msg && (
        <div className={`text-sm mt-2 ${msg.ok ? "text-[#7fb894]" : "text-[#ff9b9b]"}`}>
          {msg.ok ? `${msg.text} ✓` : `⚠ ${msg.text}`}
        </div>
      )}
    </div>
  );
}
