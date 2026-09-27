// 客戶分析頁的模組登錄表（伺服器端鏡像）。
//
// 為什麼要有這一份：真正的模組表活在 public/lantu-app.html 的 analysisModules(c) 裡，
// 但「後台要能排這些模組的預設順序」需要在 React 端知道有哪些模組、叫什麼名字。
// iframe 那份是 <script> 裡的閉包，伺服器端 import 不到，只能鏡像一份。
//
// 同步靠 anModules.drift.test.ts —— 逐字比對 html 裡 `{k:'…',t:'…'` 的出現順序與內容，
// 任何人加模組、改標題卻沒同步這一份，測試當場變紅。這跟 taiwan.ts / bizTax.ts 的鏡像慣例同一套。
//
// ⚠️ 這份的順序＝「系統內建順序」。後台沒設定過任何東西時，畫面就照這個順序走；
// 後台清空設定（回復系統內建）也是回到這個順序。

export type AnModuleDef = {
  /** 模組鍵，與 html 的 {k:'…'} 一致；也是 an_module_defaults 的主鍵 */
  k: string;
  /** 模組標題，與 html 的 {t:'…'} 一致 */
  t: string;
  /** 所屬段（html 端的 g）：分析頁依段分頁顯示，段是模組的固定屬性，不是排序 */
  g: AnGroupKey;
  /** 有條件才出現的模組（html 端的 when），後台照列但標註出來 */
  cond?: string;
};

export type AnGroupKey = "biz" | "now" | "risk" | "goal" | "future" | "rx";

/** 段的顯示名稱，與 html 的 AN_GROUPS 一致（順序＝分頁籤順序） */
export const AN_GROUPS: { k: AnGroupKey; no: string; nm: string }[] = [
  { k: "biz", no: "企業", nm: "企業主診斷" },
  { k: "now", no: "①", nm: "現況體檢" },
  { k: "risk", no: "②", nm: "保障結構" },
  { k: "goal", no: "③", nm: "人生目標" },
  { k: "future", no: "④", nm: "未來投影" },
  { k: "rx", no: "⑤", nm: "調整處方" },
];

export function anGroupName(g: AnGroupKey): string {
  const G = AN_GROUPS.find((x) => x.k === g);
  return G ? `${G.no} ${G.nm}` : g;
}

export const AN_MODULES: AnModuleDef[] = [
  { k: "biz", t: "企業主診斷", g: "biz", cond: "只在客戶開啟「企業」主體時出現" },
  { k: "tables", t: "財務三表與資產布局", g: "now" },
  { k: "health", t: "財務健康度與財務階段", g: "now" },
  { k: "ratio_flow", t: "現況財務指標 · 收支流量", g: "now" },
  { k: "ratio_bs", t: "現況財務指標 · 資產負債", g: "now" },
  { k: "retire", t: "退休需求", g: "goal" },
  { k: "coverage", t: "保障準備度", g: "risk" },
  { k: "gap", t: "保障缺口（毛需求 − 已備）", g: "risk" },
  { k: "respgap", t: "責任遞減缺口圖", g: "risk" },
  { k: "lifeneed", t: "壽險需求圖", g: "risk" },
  { k: "property", t: "購屋規劃", g: "goal", cond: "只在有置產目標時出現" },
  { k: "car", t: "購車規劃", g: "goal", cond: "只在購車目標選了取得方式時出現" },
  { k: "cross", t: "財務十字表", g: "now" },
  { k: "timeline", t: "財務目標歷程", g: "future" },
  { k: "tax", t: "稅賦分析", g: "now" },
  { k: "alloc", t: "建議資產配置", g: "rx" },
  { k: "gapledger", t: "缺口帳與該解什麼", g: "rx" },
  { k: "beforeafter", t: "規劃前 / 後對照", g: "rx" },
  { k: "shortterm", t: "短期目標與緊急預備", g: "goal" },
  { k: "retireflow", t: "退休三段式金流", g: "goal" },
  { k: "mc", t: "蒙地卡羅機率模擬", g: "future" },
  { k: "cashflow", t: "一生現金流投影", g: "future" },
];

export const AN_MODULE_KEYS: string[] = AN_MODULES.map((m) => m.k);

export function anModuleTitle(k: string): string {
  return AN_MODULES.find((m) => m.k === k)?.t ?? k;
}
