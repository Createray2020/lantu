// 官網頂欄（後台可編輯）的資料形狀與把關。純函式——後台編輯器（client）、官網頂欄（server）、
// 存檔 action 都 import 這一份，規則只有一處。
//
// 2026/09/26 Ray：「官網後台要有一個模塊可以讓我們做前端設計，可以放上連結網址出去，還有自己編輯字」，
// 他要的是官網最上面那一欄。樣式定案＝原型 E「細框＋滑過填色」。
//
// ⚠️ 外部網址只收 https://：頂欄的連結會直接進 <a href>，放行 javascript: 之類的協定
//    就是一條讓後台帳號對所有訪客執行程式碼的路。前端檢查一次、存檔時 sanitize 再擋一次、
//    讀出來渲染前還會再過一次（DB 裡的東西不信任）。
// ⚠️ 「登入」鎖定：一定存在、一定顯示、一定連到 /login，只能改文字——誤刪了老客戶就進不來。

export type NavStyle = "text" | "outline" | "primary";
export type NavKind = "int" | "ext";

export type NavItem = {
  id: string;
  text: string;
  kind: NavKind;
  href: string;
  newTab: boolean;
  style: NavStyle;
  on: boolean;
  /** 手機也留在頂欄（否則收進 ☰）。 */
  mobile: boolean;
  locked?: boolean;
};

/** 站內可以連的頁。刻意是白名單：自由輸入站內路徑，打錯一個字就是 404。 */
export const INTERNAL_PAGES: { href: string; label: string }[] = [
  { href: "/home", label: "官網首頁" },
  { href: "/passport", label: "免費試算（人生護照）" },
  { href: "/coaches", label: "認識教練" },
  { href: "/join", label: "加入嵐途" },
  { href: "/bizcheck", label: "企業財務健檢" },
];

export const LOGIN_ID = "login";
export const TEXT_MAX = 10;
export const MAX_ITEMS = 8;

/** 還沒在後台存過時的頂欄——與改版前的官網一模一樣。 */
export const DEFAULT_NAV: NavItem[] = [
  { id: "coaches", text: "認識教練", kind: "int", href: "/coaches", newTab: false, style: "text", on: true, mobile: false },
  { id: LOGIN_ID, text: "登入", kind: "int", href: "/login", newTab: false, style: "outline", on: true, mobile: true, locked: true },
  { id: "passport", text: "免費試算", kind: "int", href: "/passport", newTab: false, style: "primary", on: true, mobile: true },
];

export function isSafeExternalUrl(raw: string): boolean {
  const s = String(raw ?? "").trim();
  if (!/^https:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname.includes(".") && !/\s/.test(s);
  } catch {
    return false;
  }
}

/** 單一項目有沒有填好（給編輯器即時提示，也給存檔前檢查）。回傳問題描述，沒問題回 null。 */
export function itemProblem(it: NavItem): string | null {
  if (it.locked) return it.text.trim() ? null : "「登入」的文字不能空白";
  if (!it.text.trim()) return "顯示文字還沒填";
  if (it.kind === "ext" && !isSafeExternalUrl(it.href)) return "網址要以 https:// 開頭，例如 https://www.accupass.com/event/…";
  if (it.kind === "int" && !INTERNAL_PAGES.some((p) => p.href === it.href)) return "請從下拉選一個站內頁面";
  return null;
}

const STYLES: NavStyle[] = ["text", "outline", "primary"];

/**
 * 任何來源（DB、表單、舊資料）→ 一份一定能安全渲染的頂欄。
 * 丟掉壞掉的項目而不是整份作廢：一個填錯的網址不該讓整條頂欄消失。
 */
export function sanitizeNav(input: unknown): NavItem[] {
  // 不是陣列（沒存過、資料壞掉）＝預設頂欄；空陣列是「後台刻意全刪」，只留登入。
  if (!Array.isArray(input)) return DEFAULT_NAV.map((i) => ({ ...i }));
  const arr = input;
  const out: NavItem[] = [];
  const seen = new Set<string>();
  let loginText = "登入";
  let loginPos = -1;
  let loginStyle: NavStyle = "outline";
  let loginMobile = true;

  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = String(r.id ?? "").slice(0, 40);
    if (id === LOGIN_ID) {
      const t = String(r.text ?? "").trim().slice(0, TEXT_MAX);
      if (t) loginText = t;
      if (STYLES.includes(r.style as NavStyle)) loginStyle = r.style as NavStyle;
      loginMobile = r.mobile !== false;
      loginPos = out.length;
      continue;
    }
    if (!id || seen.has(id)) continue;
    const kind: NavKind = r.kind === "ext" ? "ext" : "int";
    const it: NavItem = {
      id,
      text: String(r.text ?? "").trim().slice(0, TEXT_MAX),
      kind,
      href: String(r.href ?? "").trim().slice(0, 500),
      newTab: kind === "ext" ? r.newTab !== false : false,
      style: STYLES.includes(r.style as NavStyle) ? (r.style as NavStyle) : "text",
      on: r.on !== false,
      mobile: r.mobile === true,
    };
    if (itemProblem(it)) continue;
    seen.add(id);
    out.push(it);
    if (out.length >= MAX_ITEMS - 1) break;
  }
  const login: NavItem = { id: LOGIN_ID, text: loginText, kind: "int", href: "/login", newTab: false, style: loginStyle, on: true, mobile: loginMobile, locked: true };
  if (loginPos < 0 || loginPos > out.length) out.push(login);
  else out.splice(loginPos, 0, login);
  return out;
}

/** 官網實際要畫的項目。 */
export function visibleNav(items: NavItem[]): NavItem[] {
  return items.filter((i) => i.on && i.text.trim());
}
