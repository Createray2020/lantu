"use client";

// 後台「組織（職級／推薦人）」編輯格。
//
// 為什麼是 client component：原本用 Server Component 內嵌 <form> ＋ <select defaultValue>，
// defaultValue 只在 mount 生效——Server Action 存檔後 revalidate 回傳新 RSC，
// React 不會把 uncontrolled select 的實際選取值同步過去，畫面永遠彈回舊值，
// 看起來像「存不進去」（其實 DB 已寫入）。這裡改成受控 state ＋ 明確的存檔狀態回饋。
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrg } from "./actions";

export const RANK_LABEL: Record<string, string> = {
  member: "教練",
  manager: "主管",
  owner: "核心成員",
};

export type Peer = { id: string; label: string };

export default function OrgCell({
  id,
  orgRank,
  uplineId,
  peers,
}: {
  id: string;
  orgRank: string;
  uplineId: string | null;
  peers: Peer[];
}) {
  const router = useRouter();
  const [rank, setRank] = useState(orgRank);
  const [upline, setUpline] = useState(uplineId ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 伺服器端值變動時（重新整理、其他操作觸發 revalidate）把顯示值拉回真實值。
  // 用「render 期間校正 state」而非 useEffect：避免多一輪 render，也符合 react-hooks 規則。
  const [serverSnap, setServerSnap] = useState({ orgRank, uplineId });
  if (serverSnap.orgRank !== orgRank || serverSnap.uplineId !== uplineId) {
    setServerSnap({ orgRank, uplineId });
    setRank(orgRank);
    setUpline(uplineId ?? "");
  }

  // 「已儲存」提示 2.5 秒後自動消失。
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  const dirty = rank !== orgRank || upline !== (uplineId ?? "");

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateOrg(id, { orgRank: rank, uplineId: upline });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const sel =
    "bg-[#0d2b45] border border-white/10 rounded px-1.5 py-1 text-xs text-[#eef2f7] disabled:opacity-50";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <select
          aria-label="職級"
          value={rank}
          disabled={pending}
          onChange={(e) => setRank(e.target.value)}
          className={sel}
        >
          {Object.entries(RANK_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="推薦人"
          value={upline}
          disabled={pending}
          onChange={(e) => setUpline(e.target.value)}
          className={`${sel} max-w-[120px]`}
        >
          <option value="">（無推薦人）</option>
          {peers
            .filter((o) => o.id !== id)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded bg-[#12334f] border border-white/15 text-[#a9bccf] px-2 py-1 text-xs hover:bg-[#17406a] disabled:opacity-40 disabled:hover:bg-[#12334f]"
        >
          {pending ? "存檔中…" : "存"}
        </button>
      </div>
      {saved && <span className="text-[10px] text-[#6f8f74]">已儲存 ✓</span>}
      {error && <span className="text-[10px] text-[#e08b7a]">儲存失敗：{error}</span>}
    </div>
  );
}
