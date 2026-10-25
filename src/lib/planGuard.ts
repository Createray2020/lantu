// plan.data 伺服器端清洗（2026/10/25 資安盤點 #19）。
//
// 規劃器 public/lantu-app.html 是 innerHTML 拼字串的世界，esc() 漏一處就是 stored XSS，
// 而且受害者是「看這份規劃的另一個人」（協作教練、客戶、看範本的管理員）。
// 前端六處已補 esc；這裡是第二道：不做白名單（plan.data 的形狀幾百個欄位、常改），
// 只擋「明顯是攻擊 payload」的字串，正常輸入（含 < 符號的備註）完全不受影響：
//   · 任一字串欄位超過 MAX_STR 字（註記 MAX_BODY 也是 4000；規劃器沒有任何欄位需要更長）
//   · 含 <script／<iframe／<object／<embed 標籤，或 on*= 事件屬性＋javascript: 協定
// 巢狀深度超過 MAX_DEPTH 也擋——正常 case 深度約 6 層，深到 64 層只會是刻意灌的。
const MAX_STR = 4000;
const MAX_DEPTH = 64;
const BAD = /<\s*\/?\s*(script|iframe|object|embed|svg|math|link|meta|base)\b|<[^>]*\bon[a-z]+\s*=|javascript\s*:|data\s*:\s*text\/html/i;

export class PlanDataRejected extends Error {
  constructor(public readonly path: string, public readonly reason: "too-long" | "bad-markup" | "too-deep") {
    super(`bad-plan-data:${reason}@${path}`);
  }
}

/** 掃整份 plan.data；有問題就丟 PlanDataRejected（message 以 bad-plan-data 開頭，呼叫端照舊可認）。 */
export function assertPlanDataSafe(data: unknown): void {
  walk(data, "$", 0);
}

function walk(v: unknown, path: string, depth: number): void {
  if (depth > MAX_DEPTH) throw new PlanDataRejected(path, "too-deep");
  if (typeof v === "string") {
    if (v.length > MAX_STR) throw new PlanDataRejected(path, "too-long");
    if (BAD.test(v)) throw new PlanDataRejected(path, "bad-markup");
    return;
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) walk(v[i], `${path}[${i}]`, depth + 1);
    return;
  }
  if (v && typeof v === "object") {
    for (const k of Object.keys(v as object)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") throw new PlanDataRejected(`${path}.${k}`, "bad-markup");
      walk((v as Record<string, unknown>)[k], `${path}.${k}`, depth + 1);
    }
  }
}
