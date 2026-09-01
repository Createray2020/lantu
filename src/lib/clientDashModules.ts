// 客戶財務儀表板的模組登錄表（伺服器端鏡像）。
//
// Ray 2026/09/01：「客戶的財務儀表板要顯示什麼，可以開放後台勾選哪些模塊可以顯示在客戶那邊。」
//
// 真正畫這些模組的是 public/lantu-app.html 的 clientView()，但後台要能勾就得在 React 端
// 知道有哪些模組、叫什麼名字——iframe 那份是 <script> 裡的閉包，伺服器端 import 不到，
// 只能鏡像一份。同步靠 clientDashModules.drift.test.ts 逐字比對。
// 這跟 analysisModules.ts 是同一套慣例。
//
// ⚠️ 這一層是**全平台**設定（Ray 拍板）：後台勾了就是全公司的客戶都一樣，
//    教練不能為個別客戶再調——跟分析頁模組順序那三層語意刻意不同。
// ⚠️ 沒設定過＝全部顯示。後台把某一塊取消勾選才會關掉。
// ⚠️ 「規劃報告書」關掉的是整個分頁，客戶端連那顆分頁鈕都不會出現。

export type ClientDashModuleDef = {
  /** 模組鍵，與 html 的 CLIENT_DASH_MODULES 一致；也是 client_dash_defaults 的主鍵 */
  k: string;
  /** 後台顯示的模組名稱 */
  t: string;
  /** 後台顯示的一句說明：關掉之後客戶會少看到什麼 */
  d: string;
};

export const CLIENT_DASH_MODULES: ClientDashModuleDef[] = [
  { k: "hero", t: "問候與財務階段", d: "客戶姓名、目前在哪一個旅程階段、判定成因與階段說明" },
  { k: "kpi", t: "三個關鍵數字", d: "淨資產、財務階段、退休缺口" },
  { k: "blueprint", t: "生涯資產模擬藍圖", d: "一生的資產走勢與逐年收支結餘（含紅色缺口標示）" },
  { k: "gauges", t: "財務健康度三儀表", d: "財務安全度、財務自由度、願景達成度" },
  { k: "ratios", t: "財務指標明細", d: "協會標準 25 項診斷細項（預設收合）" },
  { k: "report", t: "規劃報告書分頁", d: "關掉之後客戶端連「我的規劃報告」那顆分頁都不會出現" },
];

export const CLIENT_DASH_KEYS = CLIENT_DASH_MODULES.map((m) => m.k);

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
