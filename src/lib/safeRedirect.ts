// 登入後要回去的站內路徑（2026/10/25 資安盤點 #6）。
//
// 舊判斷是 startsWith("/")，但 "//evil.com" 也以 "/" 開頭——瀏覽器把它當 protocol-relative URL，
// redirect("//evil.com/x") 會直接跳到外站。"/\\evil.com" 在部分瀏覽器也會被正規化成同樣效果。
// 這裡只放行「以單一 / 開頭、第二個字元不是 / 也不是 \」的路徑；其他一律當沒帶。
export function safeBackPath(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!/^\/(?![\/\\])/.test(s)) return undefined;
  // 控制字元或空白會讓 Location 標頭被截斷／被某些瀏覽器當成第二個 URL，一律擋。
  if (/[\s\x00-\x1f]/.test(s)) return undefined;
  return s;
}
