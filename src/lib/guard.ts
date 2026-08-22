// 教練端寫入閘。所有會改資料的 server action 都要先過這裡。
//
// 兩道：
//   1. 身分與狀態 —— 必須是 active 的教練（既有規則）。
//   2. 使用期限 —— 到期未延長就唯讀鎖定：讀得到、改不了（2026/08/22 Ray 拍板）。
//
// 為什麼要有這個檔：舊寫法是每個 action 各自寫 `if (!me || me.status !== 'active') throw`，
// 加第二道檢查時只要漏掉一個檔案，那條路徑就變成「到期還能寫」的破口，而且從畫面上看不出來。
// 一律走這裡，新的 action 只要記得 requireWritableCoach() 就自動吃到往後所有的閘。
//
// 範圍：只管教練端（/dashboard、/coaches）。後台（/admin）走 isAdmin()，
// 那是核心成員與管理員的權限，不受個人使用期限影響。

import { ensureCoach, type Coach } from "./coach";
import { licenseState, LICENSE_LOCKED_MESSAGE, QUOTA_FULL_MESSAGE } from "./license";
import { clientQuota } from "./quota";

export class LicenseLockedError extends Error {
  constructor() {
    super(LICENSE_LOCKED_MESSAGE);
    this.name = "LicenseLockedError";
  }
}

export class QuotaFullError extends Error {
  constructor(cap: number) {
    super(QUOTA_FULL_MESSAGE(cap));
    this.name = "QuotaFullError";
  }
}

/** 只驗身分與狀態（讀取用）。 */
export async function requireCoach(): Promise<Coach> {
  const me = await ensureCoach();
  if (!me || me.status !== "active") throw new Error("forbidden");
  return me;
}

/** 驗身分＋使用期限。任何寫入都用這個。 */
export async function requireWritableCoach(): Promise<Coach> {
  const me = await requireCoach();
  if (licenseState(me).expired) throw new LicenseLockedError();
  return me;
}

/** 新增客戶前的額度檢查。已達上限就擋下，錯誤訊息直接給人看。 */
export async function requireClientQuota(me: Coach): Promise<void> {
  const q = await clientQuota(me);
  if (q.full && q.cap != null) throw new QuotaFullError(q.cap);
}
