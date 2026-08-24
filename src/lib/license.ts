// 教練使用期限與客戶數上限（純函式層，不碰 DB —— 方便測試，也讓 server 與 client 共用）。
//
// 2026/08/22 Ray 拍板：
//   · 教練分四個級別：實習教練（固定半年學習期）／認證教練 C1–C3／資深教練 S1–S3／首席教練。
//     實習教練的權限與 C1 完全相同，差別只在期限固定半年。
//   · 除實習外，期限可按「月」或「年」為單位設定，連動定價（見 comp_ranks.priceMonth/priceYear）。
//   · 到期又沒延長 → **唯讀鎖定**：還能登入、還看得到客戶與既有規劃，但不能新增／編輯／刪除任何資料。
//   · 客戶資料庫上限：實習與 C1–C3 為 20 位、S1–S2 為 50 位、S3 與首席為 100 位。
//
// ⚠️ 地基語意（與業務制度一致，別破壞）：
//   licenseUntil 為 null ＝「尚未設定期限」＝ **不檢查、不鎖定**，不是「已過期」。
//   舊帳號、內部帳號、以及正式收費上線前的所有人都落在這一格；把 null 當過期會在
//   上線那天把全公司鎖死。要鎖一個人請用 status='suspended'，那是另一條線。

/** 級別的內建客戶上限。comp_ranks.clientCap 留空時的 fallback。 */
export const RANK_CLIENT_CAPS: Record<string, number> = {
  INTERN: 20,
  C1: 20,
  C2: 20,
  C3: 20,
  S1: 50,
  S2: 50,
  S3: 100,
  CHIEF: 100,
};

/** 實習教練的固定期間（月）。UI 不給選，直接鎖死。 */
export const INTERN_MONTHS = 6;

/**
 * 級別的內建順序（seq 小＝低階）。
 *
 * 為什麼要有這份：生效中的制度版本是 2026/08 之前建的，職級表裡只有 C1–CHIEF 七列，
 * 沒有實習教練。後台的「載入 V4 辦法數值」只在職級表**完全空白**時才帶入，
 * 所以那一列不會自己長出來。程式端一律以這份為準做 fallback，
 * 後台再補上那一列時也不會衝突（DB 有就用 DB 的）。
 */
export const RANK_ORDER = ["INTERN", "C1", "C2", "C3", "S1", "S2", "S3", "CHIEF"] as const;

export const BUILTIN_RANK_SEQ: Record<string, number> = {
  INTERN: 0, C1: 1, C2: 2, C3: 3, S1: 4, S2: 5, S3: 6, CHIEF: 7,
};

/**
 * **對外**的職級名稱：只有群組名，不帶階數。
 *
 * 官網教練卡片顯示的就是這個（2026/08/24 Ray 拍板）——客戶要知道的是「這位到哪個層級」，
 * 不是「C2 還是 C3」，更不是教練自填的職稱（「執行長」那種頭銜一律不進官網，
 * 那是對內的稱謂，印在客戶面前只會讓人以為在賣頭銜）。
 *
 * ⚠️ 用詞是「教練」不是「顧問」（Ray 2026/08/22 拍板，2026/08/24 再次確認）。
 *    業務制度辦法原文寫「顧問」，但全系統對外一律用教練。
 * ⚠️ 這份必須跟 comp/preset.ts 的 V4_RANKS[].groupName 逐字一致，
 *    由 license.test.ts 的 drift 測試守著——職級表改了群組名這裡沒跟上，
 *    官網會顯示一組公司內部早就不用的名稱。
 */
export const RANK_PUBLIC_LABEL: Record<string, string> = {
  INTERN: "實習教練",
  C1: "認證教練",
  C2: "認證教練",
  C3: "認證教練",
  S1: "資深教練",
  S2: "資深教練",
  S3: "資深教練",
  CHIEF: "首席教練",
};

/**
 * 官網卡片上要印的職級。
 * 未定級回 null —— 而且未定級的教練根本不會出現在官網（見 coachProfile.listPublicCoaches），
 * 所以這個 null 在公開頁上只是型別層的保險。
 */
export function publicRankLabel(rankCode: string | null | undefined): string | null {
  if (!rankCode) return null;
  return RANK_PUBLIC_LABEL[rankCode] ?? null;
}

/** 內部用（後台職級表、期限設定）：帶階數，分得出 C2 與 C3。 */
export const RANK_GROUP_LABEL: Record<string, string> = {
  INTERN: "實習教練",
  C1: "認證教練 C1",
  C2: "認證教練 C2",
  C3: "認證教練 C3",
  S1: "資深教練 S1",
  S2: "資深教練 S2",
  S3: "資深教練 S3",
  CHIEF: "首席教練",
};

// ── 派案資格（2026/08/24 Ray 拍板）─────────────────────────────
// C 階（實習／C1–C3）不派案：官網教練頁**照常呈現**他們，但卡片上不給「選擇這位教練」，
// 自動建議清單也不出現他們。客戶只要拿到完整教練編號，仍然可以指定 C 階教練
// （C 階自己開發來的客戶要進得來，只是不吃系統派案）。
export const PICK_MIN_RANK = "S1";

export const PICK_BLOCKED_MESSAGE =
  "這位教練不開放在教練頁直接指定，請向他索取教練編號後於下方輸入。";

/**
 * 這位教練能不能在官網被「直接點選 / 自動建議」。
 *
 * ⚠️ 這裡的 null 語意跟 licenseUntil **刻意相反**：未定級＝不可被指定（Ray 2026/08/24 拍板）。
 *    理由是這條閘的預設值方向不同——期限沒設是「還沒開始收費」，職級沒設是「還沒被認可到能收派案」。
 *    後果是後台職級表沒填的教練在官網一律只能靠編號指定，這是預期行為，不是 bug。
 */
export function canBePicked(
  rankCode: string | null | undefined,
  rankSeq?: Record<string, number | null | undefined>,
): boolean {
  if (!rankCode) return false;
  const min = rankSeq?.[PICK_MIN_RANK] ?? BUILTIN_RANK_SEQ[PICK_MIN_RANK];
  const seq = rankSeq?.[rankCode] ?? BUILTIN_RANK_SEQ[rankCode];
  if (seq == null || min == null) return false;
  return seq >= min;
}

export type LicenseUnit = "month" | "year";

export type LicenseInput = {
  rankCode?: string | null;
  licenseFrom?: string | null;   // YYYY-MM-DD
  licenseUntil?: string | null;  // YYYY-MM-DD（含當日仍可用）
  licenseUnit?: string | null;
  licenseQty?: number | null;
  status?: string | null;
  clientCapOverride?: number | null;
};

export type LicenseState = {
  /** 有沒有設定期限。false＝未開通期限＝不鎖。 */
  managed: boolean;
  /** 已過期（只有 managed 時才可能為 true）。 */
  expired: boolean;
  /** 距到期還剩幾天（到期當天＝0；已過期為負數）。未設定期限＝null。 */
  daysLeft: number | null;
  until: string | null;
  /** 能不能寫入資料。停權或到期都不行。 */
  canWrite: boolean;
  /** 是否該在畫面上提醒（剩 30 天內或已到期）。 */
  warn: boolean;
};

// 以「台北時區的今天」為基準做日期比較。
// 直接用 new Date() 在 Vercel（UTC）上會讓台灣時間 08/23 早上七點的人被當成 08/22，
// 到期當天整整早八小時就被鎖住。
export function todayISO(now: Date = new Date(), timeZone = "Asia/Taipei"): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return p; // en-CA 就是 YYYY-MM-DD
}

/** 兩個 YYYY-MM-DD 相差幾天（b - a）。純日期運算，不受時區影響。 */
export function diffDays(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
    - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/** 起日 + N 個月／年 − 1 天＝到期日（含當日）。月底溢位往前收（1/31 + 1 月＝2/28）。 */
export function addPeriod(fromISO: string, unit: LicenseUnit, qty: number): string {
  const y = +fromISO.slice(0, 4), m = +fromISO.slice(5, 7), d = +fromISO.slice(8, 10);
  const addMonths = unit === "year" ? qty * 12 : qty;
  const total = (y * 12 + (m - 1)) + addMonths;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  // 該月最後一天（Date.UTC 的 day=0 ＝ 上個月最後一天）
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, last);
  // 「到 8/22 開通、買一個月」＝ 用到 9/21 為止（9/22 就是下一期的第一天）。
  const end = new Date(Date.UTC(ny, nm, nd));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export function licenseState(c: LicenseInput | null, now: Date = new Date()): LicenseState {
  const suspended = c?.status === "suspended" || c?.status === "pending";
  if (!c?.licenseUntil) {
    return { managed: false, expired: false, daysLeft: null, until: null, canWrite: !suspended, warn: false };
  }
  const today = todayISO(now);
  const daysLeft = diffDays(today, c.licenseUntil);
  const expired = daysLeft < 0;
  return {
    managed: true,
    expired,
    daysLeft,
    until: c.licenseUntil,
    canWrite: !expired && !suspended,
    warn: daysLeft <= 30,
  };
}

/** 這位教練的客戶數上限。個人覆寫 > 職級表設定 > 內建級距；都沒有＝不限制（null）。 */
export function clientCapOf(
  c: { rankCode?: string | null; clientCapOverride?: number | null } | null,
  rankCaps?: Record<string, number | null | undefined>,
): number | null {
  if (c?.clientCapOverride != null) return c.clientCapOverride;
  const code = c?.rankCode;
  if (!code) return null; // 還沒定級＝不擋（定級是後台的動作，不該由系統擅自給人一個上限）
  const fromRank = rankCaps?.[code];
  if (fromRank != null) return fromRank;
  const builtin = RANK_CLIENT_CAPS[code];
  return builtin ?? null;
}

export type QuotaState = { cap: number | null; used: number; left: number | null; full: boolean };

export function quotaState(cap: number | null, used: number): QuotaState {
  if (cap == null) return { cap: null, used, left: null, full: false };
  return { cap, used, left: Math.max(0, cap - used), full: used >= cap };
}

export const LICENSE_LOCKED_MESSAGE =
  "使用期限已到期，目前為唯讀狀態（資料都在，可以繼續檢視）。請聯繫管理員延長期限後即可恢復編輯。";

export const QUOTA_FULL_MESSAGE = (cap: number) =>
  `客戶數已達目前級別的上限 ${cap} 位。可以先封存不再服務的客戶，或聯繫管理員升級級別。`;
