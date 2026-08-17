"use client";

// 後台帳號狀態動作（核准開通／停權／重設待審）。
// 改成 client component 的理由同 OrgCell：原本直接把 Server Action 綁在 <form> 上，
// 途中失敗（例如伺服器暫時 5xx）不會有任何提示，使用者只看到「按了沒反應」。
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveCoach, resetCoach, suspendCoach } from "./actions";

export default function StatusActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn(id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2 justify-end">
        {status !== "active" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(approveCoach)}
            className="rounded-md bg-[#6f8f74] text-[#08202a] font-bold px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {pending ? "處理中…" : "核准開通"}
          </button>
        )}
        {status === "active" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(suspendCoach)}
            className="rounded-md bg-[#b05a4a] text-white font-bold px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {pending ? "處理中…" : "停權"}
          </button>
        )}
        {status === "suspended" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(resetCoach)}
            className="rounded-md border border-white/20 text-[#a9bccf] px-3 py-1.5 text-xs disabled:opacity-50"
          >
            重設待審
          </button>
        )}
      </div>
      {error && <span className="text-[10px] text-[#e08b7a]">失敗：{error}</span>}
    </div>
  );
}
