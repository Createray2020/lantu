"use client";

import { useEffect, useState } from "react";

// build 時烤進的版本（見 next.config.ts）。
const LOADED = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

// 定時比對線上版本；偵測到新版部署時，頂端跳出「立即更新」按鈕。
export default function VersionWatcher() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (LOADED === "dev") return; // 本機開發不檢查
    let alive = true;

    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { version } = await r.json();
        if (alive && version && version !== "dev" && version !== LOADED) {
          setStale(true);
        }
      } catch {
        /* 離線或暫時失敗，忽略 */
      }
    };

    check();
    const id = setInterval(check, 60_000); // 每分鐘檢查
    const onVis = () => {
      if (document.visibilityState === "visible") check(); // 回到分頁時立即檢查
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!stale) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "9px 16px",
        background: "linear-gradient(90deg,#0d2b45,#12334f)",
        color: "#eef2f7",
        borderBottom: "1px solid #c99a5b",
        fontSize: 13.5,
        fontWeight: 600,
        boxShadow: "0 2px 12px rgba(0,0,0,.35)",
      }}
    >
      <span>已有新版本可用，請更新以取得最新功能。</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "#c99a5b",
          color: "#08202a",
          border: "none",
          borderRadius: 8,
          padding: "6px 16px",
          fontWeight: 800,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        立即更新
      </button>
    </div>
  );
}
