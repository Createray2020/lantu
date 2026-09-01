// 客戶財務儀表板的模組登錄表（伺服器端鏡像）。
//
// Ray 2026/09/01：「客戶的財務儀表板要顯示什麼，可以開放後台勾選哪些模塊可以顯示在客戶那邊。」
// Ray 2026/09/01（同日追加）：「我希望預設新增進去的部分，會是『教練』那邊有關分析以及建議的
//                              這兩個模塊，全部都可以放進去。」
//
// 所以這份清單是三群：
//   總覽 —— 客戶端本來就有的六塊（問候、KPI、藍圖、儀表、指標、報告書）
//   分析 —— 教練端「分析」分頁的全部模組，鍵是 `an:` + AN_MODULES 的鍵
//   建議 —— 教練端「建議」分頁的全部模組，鍵是 `ad:` + ADVICE_MODULES 的鍵
//
// ⚠️⚠️ 分析那一群**直接由 AN_MODULES 生出來**，不另抄一份——分析頁加模組時，
//    後台的可勾清單自動跟著長，不會出現「加了模組但客戶端永遠看不到」的死角。
// ⚠️ 前綴是必要的：分析與建議都有 `biz` 這個鍵（企業主診斷 / 企業主診斷建議），
//    不加前綴會撞在一起，後台勾一個等於勾兩個。
// ⚠️ 這一層是**全平台**設定（Ray 拍板）：後台勾了就是全公司的客戶都一樣，
//    教練不能為個別客戶再調——跟分析頁模組順序那三層語意刻意不同。
// ⚠️ **沒設定過＝全部顯示。** 之後新增模組也是預設顯示，要關再回後台取消勾選。
// ⚠️ 三群的內容分別由 anModules.drift.test.ts 與 clientDashModules.drift.test.ts 守著。
import { AN_MODULES } from "./analysisModules";

export const AN_PREFIX = "an:";
export const AD_PREFIX = "ad:";

export type ClientDashGroup = "總覽" | "分析" | "建議";

export type ClientDashModuleDef = {
  /** 模組鍵，也是 client_dash_defaults 的主鍵 */
  k: string;
  /** 後台顯示的模組名稱 */
  t: string;
  /** 後台顯示的一句說明：關掉之後客戶會少看到什麼 */
  d: string;
  g: ClientDashGroup;
  /** 有條件才出現的模組（例如只在企業主體開啟時），後台照列但標註出來 */
  cond?: string;
};

/** 教練端「建議」分頁的模組。鏡像 lantu-app.html 的 adviceModules()。 */
export const ADVICE_MODULES: { k: string; t: string; d: string; cond?: string }[] = [
  // ⚠️ t 逐字對齊 html 的 adviceModules()（drift test 守著），補充說明一律寫在 d。
  { k: "biz", t: "企業主診斷建議", d: "公私財務界線與合規面的建議", cond: "只在客戶開啟「企業」主體時出現" },
  { k: "cards", t: "規劃建議", d: "依目前財務階段，現在最該做的那幾件事" },
  { k: "actions", t: "執行行動清單", d: "依 A/B/C/D 軸線逐項列出可執行的動作與說明" },
  { k: "pdca", t: "動態調整（PDCA）", d: "每年至少檢視一次的節奏，以及下次檢視日期" },
  { k: "gaptable", t: "缺口總表", d: "依「必須達成」優先序排列的各項缺口與資產轉負年齡" },
];

const OVERVIEW: ClientDashModuleDef[] = [
  { k: "hero", t: "問候與財務階段", d: "客戶姓名、目前在哪一個旅程階段、判定成因與階段說明", g: "總覽" },
  { k: "kpi", t: "三個關鍵數字", d: "淨資產、財務階段、退休缺口", g: "總覽" },
  { k: "blueprint", t: "生涯資產模擬藍圖", d: "一生的資產走勢與逐年收支結餘（含紅色缺口標示）", g: "總覽" },
  { k: "gauges", t: "財務健康度三儀表", d: "財務安全度、財務自由度、願景達成度", g: "總覽" },
  { k: "ratios", t: "財務指標明細", d: "協會標準 25 項診斷細項（預設收合）", g: "總覽" },
  { k: "report", t: "規劃報告書分頁", d: "關掉之後客戶端連「我的規劃報告」那顆分頁都不會出現", g: "總覽" },
];

export const CLIENT_DASH_MODULES: ClientDashModuleDef[] = [
  ...OVERVIEW,
  ...AN_MODULES.map((m) => ({
    k: AN_PREFIX + m.k,
    t: m.t,
    d: "教練端「分析」分頁的同一塊",
    g: "分析" as const,
    cond: m.cond,
  })),
  ...ADVICE_MODULES.map((m) => ({
    k: AD_PREFIX + m.k,
    t: m.t,
    d: m.d,
    g: "建議" as const,
    cond: m.cond,
  })),
];

export const CLIENT_DASH_KEYS = CLIENT_DASH_MODULES.map((m) => m.k);
export const CLIENT_DASH_GROUPS: ClientDashGroup[] = ["總覽", "分析", "建議"];

export function dashModulesOf(g: ClientDashGroup): ClientDashModuleDef[] {
  return CLIENT_DASH_MODULES.filter((m) => m.g === g);
}

/** 後台設定：key → 是否隱藏。沒有這個 key 就是顯示。 */
export type ClientDashPrefs = Record<string, boolean>;

/** 認得的 key 才留下——後台舊資料留著不認得的 key 時直接忽略，不要讓它變成一個看不見的開關。 */
export function normalizeDashPrefs(raw: unknown): ClientDashPrefs {
  const out: ClientDashPrefs = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const k of CLIENT_DASH_KEYS) if (src[k] === true) out[k] = true;
  return out;
}

export function dashVisible(prefs: ClientDashPrefs | null | undefined, key: string): boolean {
  return !(prefs && prefs[key] === true);
}
