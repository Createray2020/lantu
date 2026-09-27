/**
 * 願景處理流程：客戶端「我的行動清單」要看的列（純函式，沒有 DB）。
 * 只有進了流程（c.flow）且到執行期之後（S7／S8）才給客戶看；lane 沒填就依類別推。
 */
export type FlowActionRow = { id: string; name: string; lane: string; laneLabel: string; amount: string; state: string };
const LANE_LABEL: Record<string, string> = { "income-work": "收入·工作", "income-invest": "收入·理財", expense: "支出", guard: "護欄", surplus: "餘裕" };
const CAT_LABEL: Record<string, string> = { income: "增加工作收入", expense: "刪減支出", regular: "定期定額", lump: "單筆投入", liquidate: "資產變現", loan: "貸款取得資金", insure: "購買保障" };
function laneOfAction(a: Record<string, unknown>): string {
  if (typeof a.lane === "string" && a.lane) return a.lane;
  const k = String(a.cat ?? "");
  return k === "income" ? "income-work" : k === "expense" ? "expense" : k === "insure" ? "guard" : "income-invest";
}
function fmtTw(v: unknown): string { const x = Math.round(Number(v) || 0); return x.toLocaleString("en-US"); }
/** 客戶端要看的行動清單：只有進了願景處理流程（c.flow）且到執行期之後才有。 */
export function flowActionsOf(data: unknown): FlowActionRow[] {
  const c = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const flow = c.flow as { step?: string } | undefined;
  if (!flow || typeof flow !== "object") return [];
  if (!["S7", "S8"].includes(String(flow.step ?? ""))) return [];
  const acts = Array.isArray(c.actions) ? (c.actions as Record<string, unknown>[]) : [];
  return acts.filter((a) => a && a.on !== false && typeof a.id === "string").map((a) => {
    const cat = String(a.cat ?? "");
    const gm = Number(a.getMonthly) || 0, pm = Number(a.payMonthly) || 0, pl = Number(a.payLump) || 0, gl = Number(a.getLump) || 0;
    const amount = cat === "income" || cat === "expense" ? `${cat === "expense" ? "−" : "+"}${fmtTw(gm)}／月` : pm ? `${fmtTw(pm)}／月` : pl ? `${fmtTw(pl)} 單筆` : gl ? `+${fmtTw(gl)}` : "";
    const lane = laneOfAction(a);
    const st = (a.status && typeof a.status === "object" ? (a.status as { state?: string }).state : "") || "planned";
    return { id: String(a.id), name: String(a.name ?? "").trim() || CAT_LABEL[cat] || cat, lane, laneLabel: LANE_LABEL[lane] ?? lane, amount, state: st };
  });
}
