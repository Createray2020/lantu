"use client";

// 測試帳號勾選（2026/09/29 Ray：核准時要有個勾選，測試的不進帳務、其他照算才有行政財務紀律）。
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCoachTestAction } from "./actions";

export default function TestToggle({ id, isTest }: { id: string; isTest: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(isTest);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-1 text-xs text-tx2 cursor-pointer select-none" title="勾了＝帳務不記這個帳號的報聘與培訓帳號">
      <input type="checkbox" checked={on} disabled={pending} onChange={(e) => {
        const v = e.target.checked; setOn(v); setErr(null);
        start(async () => { const r = await setCoachTestAction(id, v); if (r.ok) router.refresh(); else { setErr(r.error); setOn(!v); } });
      }} />
      測試帳號{err && <span className="text-danger">（{err}）</span>}
    </label>
  );
}
