"use client";

import { useRouter } from "next/navigation";
import type { OrgRank } from "@/lib/org";

// 首頁視角切換（顧問／主管／老闆）＋ 團隊/成員預覽選擇。
// 用網址查詢參數驅動（?as=&focus=），伺服器端重新彙總對應視角。
const LABEL: Record<OrgRank, string> = { member: "顧問", manager: "主管", owner: "老闆" };

export default function HomeSwitcher({
  rank, views, focusId, teamOptions, memberOptions,
}: {
  rank: OrgRank;
  views: OrgRank[];
  focusId: string;
  teamOptions: { id: string; name: string }[];
  memberOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const go = (as: OrgRank, focus?: string) => {
    const q = new URLSearchParams();
    q.set("as", as);
    if (focus) q.set("focus", focus);
    router.push(`/dashboard?${q.toString()}`);
  };

  if (views.length <= 1) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap mb-4">
      <div className="inline-flex bg-[#12334f] border border-white/10 rounded-full p-1">
        {views.map((v) => (
          <button
            key={v}
            onClick={() => go(v)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition ${
              rank === v ? "bg-[#c99a5b] text-[#08202a]" : "text-[#a7bacb] hover:text-[#eef2f7]"
            }`}
          >
            {LABEL[v]}
          </button>
        ))}
      </div>

      {rank === "manager" && teamOptions.length > 0 && (
        <select
          value={focusId}
          onChange={(e) => go("manager", e.target.value)}
          className="bg-[#12334f] border border-white/10 text-[#eef2f7] text-[13px] rounded-lg px-3 py-1.5"
        >
          {teamOptions.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
      )}
      {rank === "member" && memberOptions.length > 0 && (
        <select
          value={focusId}
          onChange={(e) => go("member", e.target.value)}
          className="bg-[#12334f] border border-white/10 text-[#eef2f7] text-[13px] rounded-lg px-3 py-1.5"
        >
          {memberOptions.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
        </select>
      )}
      <span className="text-[11px] text-[#6f869c]">預覽視角 · 業績/活動/增員為可編輯模擬資料</span>
    </div>
  );
}
