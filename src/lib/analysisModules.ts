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
  /** 有條件才出現的模組（html 端的 when），後台照列但標註出來 */
  cond?: string;
};

export const AN_MODULES: AnModuleDef[] = [
  { k: "biz", t: "企業主診斷", cond: "只在客戶開啟「企業」主體時出現" },
  { k: "tables", t: "財務三表與資產布局" },
  { k: "health", t: "財務健康度與財務階段" },
  { k: "ratio_flow", t: "現況財務指標 · 收支流量" },
  { k: "ratio_bs", t: "現況財務指標 · 資產負債" },
  { k: "retire", t: "退休需求" },
  { k: "coverage", t: "保障準備度" },
  { k: "gap", t: "保障缺口（毛需求 − 已備）" },
  { k: "respgap", t: "責任遞減缺口圖" },
  { k: "lifeneed", t: "壽險需求圖" },
  { k: "property", t: "置產缺口", cond: "只在有置產目標時出現" },
  { k: "cross", t: "財務十字表" },
  { k: "timeline", t: "財務目標歷程" },
  { k: "tax", t: "稅賦分析" },
  { k: "alloc", t: "建議資產配置" },
  { k: "gapledger", t: "缺口帳與該解什麼" },
  { k: "beforeafter", t: "規劃前 / 後對照" },
  { k: "shortterm", t: "短期目標與緊急預備" },
  { k: "retireflow", t: "退休三段式金流" },
  { k: "mc", t: "蒙地卡羅機率模擬" },
  { k: "cashflow", t: "一生現金流投影" },
];

export const AN_MODULE_KEYS: string[] = AN_MODULES.map((m) => m.k);

export function anModuleTitle(k: string): string {
  return AN_MODULES.find((m) => m.k === k)?.t ?? k;
}
