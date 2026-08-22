"use client";

import type { LicenseState } from "@/lib/license";

// 頂欄的「剩餘天數」。三態：
//   充裕（>30 天）→ 低調的灰字；即將到期（≤30 天）→ 橘；已到期 → 紅。
// 未設定期限（managed=false）就完全不顯示 —— 那代表「還沒開始管期限」，
// 給一個空的或 0 天的徽章只會讓人以為出事了。
export default function LicenseBadge({ license }: { license: LicenseState }) {
  if (!license.managed || license.daysLeft == null) return null;

  const d = license.daysLeft;
  const tone = license.expired
    ? "border-[#e5484d]/60 text-[#ff9d9f] bg-[#e5484d]/10"
    : license.warn
      ? "border-[#c99a5b]/60 text-[#e0bd8b] bg-[#c99a5b]/10"
      : "border-white/15 text-[#a9bccf]";

  const text = license.expired
    ? "使用期限已到期"
    : d === 0
      ? "今天是使用期限最後一天"
      : `剩餘 ${d} 天`;

  return (
    <span
      className={`text-xs font-bold px-2.5 py-1.5 rounded-md border whitespace-nowrap ${tone}`}
      title={`使用期限至 ${license.until}${license.expired ? "（目前為唯讀狀態）" : ""}`}
    >
      {text}
    </span>
  );
}
