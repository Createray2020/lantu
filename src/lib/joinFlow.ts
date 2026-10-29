// 教練邀請／客戶專用登入連結的「跨過註冊流程」機制（2026/10/29 徐醫師事故）。
//
// 事故：客戶從 LINE 點專用連結 → 用 Google 註冊 → 回來時沒兌換到邀請碼，帳號沒接上教練建好的那一筆，
// 落在空白的人生護照。兩個弱點疊在一起：
//   ① /portal(.*) 是公開路由——Clerk 開發金鑰的 dev-browser handshake 不一定跑得到，
//      剛從 Google 回來的人在公開頁上可能被判成「沒登入」，於是根本不會去兌換。
//   ② 邀請碼只活在網址的 redirect_url 裡，OAuth／瀏覽器跳轉中間掉了就再也找不回來。
// 對策（兩層，缺一不可）：
//   · 註冊／登入回來一律走 /portal/redeem（**非公開**，proxy 用 auth.protect 先完成 handshake 才兌換）。
//   · 打開 /portal/join?code=… 時 proxy 順手把碼寫進 cookie；之後只要客戶登入後進到首頁／護照／setup，
//     看到 cookie 就導去 /portal/redeem 補兌換。/portal/redeem 一律清掉 cookie（成功失敗都清），不會繞圈。
// 救不了的：在 LINE 開連結、卻在另一個瀏覽器完成登入（cookie 不跟過去）——那種只能教練端或後台手動接。
//
// 這支只放純函式與常數，proxy（edge）、頁面、route handler、測試都 import 它。

export const JOIN_COOKIE = "lantu_join";
export const JOIN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 天：傳了連結、隔幾天才註冊也接得上

/** 邀請碼格式（coachLink 產的是小寫英數；放寬到大小寫英數 6–40 字，其餘一律當沒有）。 */
export function isJoinCode(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9]{6,40}$/.test(v);
}

/**
 * 給教練複製、貼到 LINE 的完整連結。openExternalBrowser=1 是 LINE 認得的參數：點了直接用手機預設瀏覽器
 * （Safari／Chrome）開，不留在 LINE 內建瀏覽器——那裡 Google 登入常被擋，登入狀態也跟客戶之後自己回來用的瀏覽器不同。
 * 其他 App 不認得這個參數，會原樣忽略。
 */
export const shareJoinUrl = (origin: string, code: string) => `${origin}/portal/join?code=${encodeURIComponent(code)}&openExternalBrowser=1`;

/**
 * 認領頁（2026/10/29 第二版）：連結、cookie 補兌換、手動輸入開通碼，三條路都匯到這一頁——先讓客戶看到
 * 「哪位教練為誰準備的規劃」、按確認才綁。非公開路由（proxy 先完成登入確認）。
 */
export const claimPath = (code?: string) => (code ? `/portal/claim?code=${encodeURIComponent(code)}` : "/portal/claim");
/** 舊名：已經在半路上的人（forceRedirectUrl 指到 /portal/redeem）仍接得上——route 會轉去 claimPath。 */
export const redeemPath = (code: string) => claimPath(code);
export const joinPath = (code: string, done = false) => `/portal/join?code=${encodeURIComponent(code)}${done ? "&done=1" : ""}`;

/** 從站內 back 路徑（/portal/join?code=…）取出邀請碼；不是邀請連結回 null。 */
export function joinCodeFrom(back: string | undefined | null): string | null {
  if (!back || !back.startsWith("/portal/join")) return null;
  const code = new URLSearchParams(back.split("?")[1] ?? "").get("code");
  return isJoinCode(code) ? code : null;
}

/**
 * 註冊／登入完成後要去哪裡：邀請連結 → 改去 /portal/redeem（非公開、會先完成登入確認）；
 * 其他站內路徑照舊；沒有就交給 fallback。
 */
export function afterAuthPath(back: string | undefined): string | undefined {
  const code = joinCodeFrom(back);
  return code ? claimPath(code) : back;
}

// ── 開通碼：客戶編號-6 位數（2610008-483921）──────────────────────────────
export const PIN_LEN = 6;
export const CLAIM_MAX_FAILS = 5;
export const CLAIM_WINDOW_MIN = 30;

export const formatClaimCode = (clientCode: string, pin: string) => `${clientCode}-${pin}`;

/**
 * 客戶輸入的開通碼 → { clientCode, pin }。容錯：全形數字、空白、各種連字號、沒打連字號（13 位連打）都收。
 * 客戶編號＝YYMM＋三碼以上（2610008、26101000）；開通碼固定 6 位數字。
 */
export function parseClaimCode(raw: unknown): { clientCode: string; pin: string } | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s]/g, "")
    .replace(/[－—–‐ー_]/g, "-");
  let m = /^(\d{7,9})-(\d{6})$/.exec(s);
  if (!m) m = /^(\d{7,9})(\d{6})$/.exec(s);
  if (!m) return null;
  const mm = +m[1].slice(2, 4);
  if (mm < 1 || mm > 12) return null;
  return { clientCode: m[1], pin: m[2] };
}

/** 確認頁上的名字：只露頭尾（徐浩恩 → 徐○恩、王明 → 王○、Amy → A○y）。拿到正確碼的人才看得到，但也不必整個印出來。 */
export function maskName(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  const chars = [...s];
  if (chars.length <= 1) return s;
  if (chars.length === 2) return `${chars[0]}○`;
  return `${chars[0]}${"○".repeat(Math.min(chars.length - 2, 3))}${chars[chars.length - 1]}`;
}
