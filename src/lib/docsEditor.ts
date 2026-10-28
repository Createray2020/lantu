// 所見即所得範本編輯器的純轉換層（2026/10/28 Ray：「不要讓我看到 HTML 碼」）。
//
// 儲存格式不變：HTML 裡用 {{member.name}}／{{sign:coach:1}}／{{seal}} 當佔位。
// 編輯器裡這些佔位顯示成「不可編輯的標籤（chip）」，存檔時再換回佔位。
// 這一支只做字串轉換，不碰 DOM——client 元件與測試都 import 它。
import { ROLE_LABEL, slotLabel, isCheckVar, type DocAsk, type DocSignerSlot } from "./docs";
import { VAR_CATALOG } from "./docsVars";

export const CHIP_CLASS = "tpl-chip";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function varLabel(key: string): string {
  return VAR_CATALOG.find((v) => v.key === key)?.label ?? key;
}

/** 佔位 → 標籤（編輯器顯示用）。簽名位的顯示名跟範本簽署人設定走；確認項的顯示名跟 asks 走。 */
export function tokensToChips(html: string, signers: DocSignerSlot[] = [], asks: DocAsk[] = []): string {
  const label = (role: string, seq: number) => {
    const s = signers.find((x) => x.role === role && x.seq === seq);
    return s ? slotLabel(s) : `${ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role}簽名`;
  };
  const askLabel = (key: string) => asks.find((a) => a.key === key)?.label ?? key;
  return html
    .replace(/\{\{\s*seal\s*\}\}/g, () => chipHtml("seal"))
    .replace(/\{\{\s*sign:([a-z_]+):(\d+)\s*\}\}/g, (_m, role: string, seq: string) => chipHtml("slot", `${role}:${Number(seq)}`, label(role, Number(seq))))
    .replace(/\{\{\s*ask:([a-z0-9_]+)\s*\}\}/g, (_m, key: string) => chipHtml("ask", key, askLabel(key)))
    .replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => chipHtml("var", key));
}

/** 標籤 → 佔位（存檔用）。只認我們自己產的 span（有 data-var／data-slot／data-seal／data-ask）；其他內容原樣留下。 */
export function chipsToTokens(html: string): string {
  return html.replace(/<span\b[^>]*\bdata-(var|slot|seal|ask)="([^"]*)"[^>]*>[\s\S]*?<\/span>/g, (_m, kind: string, val: string) => {
    if (kind === "seal") return "{{seal}}";
    if (kind === "slot") return `{{sign:${val}}}`;
    if (kind === "ask") return `{{ask:${val}}}`;
    return `{{${val}}}`;
  });
}

/** 一顆標籤的 HTML（工具列「插入」用）。勾選欄（xxx.is_yyy）與確認項前面帶 ☐，讓人一眼看出它會印成格子。 */
export function chipHtml(kind: "var" | "slot" | "seal" | "ask", value = "", label = ""): string {
  if (kind === "seal") return `<span class="${CHIP_CLASS} chip-seal" contenteditable="false" data-seal="1">公司印鑑</span>`;
  if (kind === "slot") return `<span class="${CHIP_CLASS} chip-sign" contenteditable="false" data-slot="${esc(value)}">✍ ${esc(label || value)}</span>`;
  if (kind === "ask") return `<span class="${CHIP_CLASS} chip-ask" contenteditable="false" data-ask="${esc(value)}">☐ ${esc(label || value)}</span>`;
  const check = isCheckVar(value);
  return `<span class="${CHIP_CLASS} chip-var${check ? " chip-check" : ""}" contenteditable="false" data-var="${esc(value)}">${check ? "☐ " : ""}${esc(label || varLabel(value))}</span>`;
}

/** 貼上時保留的結構標籤；其餘拆掉只留文字。屬性一律丟（Word 貼來的 style／class／mso 全部不要）。 */
export const PASTE_KEEP = new Set(["P", "H1", "H2", "H3", "H4", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "BR", "BLOCKQUOTE"]);

/** 編輯器裡的樣式：文件本體沿用 DOC_CSS，這裡只補標籤外觀。 */
export const EDITOR_CSS = `
.tpl-chip{display:inline-block;border-radius:6px;padding:0 6px;margin:0 1px;font-size:12px;line-height:1.7;vertical-align:baseline;user-select:all;cursor:default;white-space:nowrap}
.chip-var{background:#e8f0fe;color:#1a4fa3;border:1px solid #b6cdf5}
.chip-sign{background:#fff4e0;color:#8a5200;border:1px dashed #e0a94a}
.chip-seal{background:#fde8e8;color:#9b1c1c;border:1px solid #f1b3b3}
.chip-check{background:#eef7ee;color:#1f6b2f;border-color:#a8d5ae}
.chip-ask{background:#f3e8ff;color:#5b21b6;border:1px dashed #b08ae6}
.tpl-editor:focus{outline:2px solid var(--brand);outline-offset:2px}
.tpl-editor:empty:before{content:attr(data-placeholder);color:#999}
`;
