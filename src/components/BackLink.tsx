"use client";

import { useRouter } from "next/navigation";

// 「← 返回」（LT05，2026/10/29）：從站內清單點進來就回上一頁（清單的篩選、分頁跟著回來）；
// 直接開連結進來（沒有站內上一頁）就回 fallback 指定的清單。
export default function BackLink({ fallback, label = "返回", className = "" }: { fallback: string; label?: string; className?: string }) {
  const router = useRouter();
  function go(e: React.MouseEvent) {
    e.preventDefault();
    let sameOrigin = false;
    try { sameOrigin = !!document.referrer && new URL(document.referrer).origin === window.location.origin; } catch { sameOrigin = false; }
    if (sameOrigin && window.history.length > 1) router.back();
    else router.push(fallback);
  }
  return (
    <a href={fallback} onClick={go} className={className || "text-sm rounded-md border border-line px-3 py-1.5 hover:bg-panel2 shrink-0"} aria-label={label}>
      ← {label}
    </a>
  );
}
