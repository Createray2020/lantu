import type { LicenseState } from "@/lib/license";
import { LICENSE_LOCKED_MESSAGE } from "@/lib/license";

// 到期唯讀橫幅。掛在每一頁的頂欄下方 —— 只在頂欄放一顆紅徽章，
// 使用者會在按下「儲存」失敗之後才知道發生什麼事，那太晚了。
export default function ReadOnlyBanner({ license }: { license: LicenseState }) {
  if (!license.expired) return null;
  return (
    <div className="bg-[#e5484d]/15 border-b border-[#e5484d]/40 text-[#ffd7d8] px-4 sm:px-6 py-2 text-sm">
      <b className="text-[#ff9d9f]">唯讀模式</b>
      <span className="ml-2">{LICENSE_LOCKED_MESSAGE}</span>
    </div>
  );
}
