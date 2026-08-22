// 頂欄要的三樣東西（後台權限／字級／使用期限）算在一起。
// 六個頁面各自算一次的話，之後多一個欄位就要記得六個地方都補 —— 收在這裡只改一處。

import { isAdmin as checkAdmin, type Coach } from "@/lib/coach";
import { licenseState, type LicenseState } from "@/lib/license";
import { DEFAULT_UI_SCALE } from "@/lib/uiScale";

export type HeaderProps = { isAdmin: boolean; uiScale: number; license: LicenseState };

export async function headerProps(coach: Coach): Promise<HeaderProps> {
  return {
    isAdmin: await checkAdmin(coach),
    uiScale: coach.uiScale ?? DEFAULT_UI_SCALE,
    license: licenseState(coach),
  };
}
