// 範本 HTML 的白名單消毒（伺服端）。管理員寫的 HTML 會被直接嵌進簽署頁與列印頁，
// 2026/10/28 稽核：純 regex 的 stripActiveHtml 擋不住帶引號的 javascript: 連結、`<svg/onload>`、
// `formaction`、`<base>`、實體編碼等寫法——所以存範本與產文件前都先過這一層，regex 只當最後保險。
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "small", "sup", "sub", "span", "div", "section", "article",
  "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "blockquote", "pre", "code", "img",
];

export function sanitizeTemplateHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["class", "style", "id"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      img: ["src", "alt", "width", "height"],
      span: ["data-slot"],
    },
    // 印鑑與簽名圖是 PNG data URL；外部圖一律不收（文件不該依賴外站）。
    allowedSchemesByTag: { img: ["data"] },
    allowedSchemes: [],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^(bold|normal|[1-9]00)$/],
        "font-size": [/^\d+(\.\d+)?(px|em|rem|pt|%)$/],
        "margin": [/^[\d.\s]+(px|em|rem|pt|%)?([\s\d.]+(px|em|rem|pt|%)?)*$/],
        "margin-top": [/^\d+(\.\d+)?(px|em|rem|pt)$/],
        "margin-bottom": [/^\d+(\.\d+)?(px|em|rem|pt)$/],
        "padding": [/^[\d.\s]+(px|em|rem|pt|%)?([\s\d.]+(px|em|rem|pt|%)?)*$/],
        "text-decoration": [/^(underline|line-through|none)$/],
        "line-height": [/^\d+(\.\d+)?(px|em|rem|%)?$/],
        "width": [/^\d+(\.\d+)?(px|%)$/],
        "border": [/^[\d.]+px\s+(solid|dashed|dotted)\s+#?[a-zA-Z0-9]+$/],
      },
    },
    // 允許 data:image/png 的大小由 validSignaturePng 管；這裡只擋協定。
    transformTags: {
      a: "span", // 連結一律降成文字（合約裡不該有可點的外部連結）
    },
  });
}
