// 規劃意圖：關注議題 + 人生目標與優先序（純資料＋純函式，勿 import db，client/server 共用）。
//
// 模型（2026-08-16 Ray 拍板）：
// - 關注議題 purposes：沒有時間軸的財務課題（節稅／信用／保障評估…），客戶填寫、教練可代填。
// - 人生目標 targets：有時間軸、要花錢的事件。**選了＝必須達成，沒選＝不列入規劃**。
// - 優先序 mustHave：已選目標的「有序」清單，＝資源不足時的取捨依據。
//   mustHave 恆等於 targets 的排序版本（同一組集合，兩個欄位並存純為向下相容）。
// - 「人生模擬，了解一生金流」＝全選捷徑，不是一個目標。
//
// ⚠️ public/lantu-app.html 是獨立 HTML 無法 import 本檔，另有一份同內容的常數；
//    src/lib/intent.test.ts 會正則比對兩邊，改這裡務必同步改那裡（測試會擋）。

// 關注議題（無時間軸的財務課題）。
export const PURPOSES = [
  "想增加收入",
  "想進行儲蓄，替未來準備",
  "想進行投資、活化資產",
  "想優化個人的信用評分",
  "想進行風險的保障評估",
  "有節稅需求，想進行節稅",
  "人生模擬，了解一生金流",
] as const;

// 勾這個議題＝目標全選（人生模擬要跑完整一生金流，就是把所有目標打開）。
export const ALL_SIM = "人生模擬，了解一生金流";

// 新客戶預設必達（退休幾乎必然發生；可取消，但 UI 會跳提示）。
export const DEFAULT_TARGET = "退休生活規劃";

export type TargetMeta = {
  name: string;
  tab: string;      // 對應 lantu-app.html 的 dataTab id
  tabName: string;  // 分頁顯示名
  hint: string;     // 卡片副標
  goalType?: string; // 有的話＝勾選時自動於 goals 表帶出一列該類型
};

export const TARGET_META: TargetMeta[] = [
  { name: "職涯規劃", tab: "intent", tabName: "意圖/生涯", hint: "轉職・創業" },
  { name: "購車規劃", tab: "goals", tabName: "目標/置產", hint: "車價・貸款", goalType: "購車" },
  { name: "購屋規劃", tab: "goals", tabName: "目標/置產", hint: "房價・成數", goalType: "購屋" },
  { name: "子女教養規劃", tab: "education", tabName: "子女教育", hint: "學程・學費" },
  { name: "孝親規劃", tab: "goals", tabName: "目標/置產", hint: "奉養・醫療", goalType: "孝親" },
  { name: "婚姻規劃", tab: "intent", tabName: "意圖/生涯", hint: "年齡・預算" },
  { name: "旅遊規劃", tab: "goals", tabName: "目標/置產", hint: "頻率・預算", goalType: "旅遊" },
  { name: "休閒興趣規劃", tab: "goals", tabName: "目標/置產", hint: "年度預算", goalType: "休閒" },
  { name: "奢侈品購買規劃", tab: "goals", tabName: "目標/置產", hint: "品項・金額", goalType: "奢侈品" },
  { name: "退休生活規劃", tab: "retire", tabName: "退休", hint: "年齡・月費" },
  { name: "傳承規劃", tab: "intent", tabName: "意圖/生涯", hint: "繼承人・金額", goalType: "傳承" },
];

export const TARGETS = TARGET_META.map((t) => t.name);

// 地基層：不受目標勾選影響，一律要填，缺一塊人生模擬就失真。
export const BASE_TABS: { tab: string; tabName: string }[] = [
  { tab: "family", tabName: "家庭 / 參數" },
  { tab: "finance", tabName: "收支資債" },
  { tab: "coverage", tabName: "保障中心" },
  { tab: "credit", tabName: "信用/海外" },
  { tab: "tax", tabName: "稅賦" },
];

// 舊值 → 新值遷移對照（2026-08-16 三區塊整併前存下的資料）。
const PURPOSE_MIGRATE: Record<string, string[]> = {
  // 置產屬於有時間軸的人生目標，移進 targets。
  "想買車、買房，進行置產": [],
};
const PURPOSE_TO_TARGETS: Record<string, string[]> = {
  "想買車、買房，進行置產": ["購車規劃", "購屋規劃"],
};
const TARGET_MIGRATE: Record<string, string[]> = {
  // 「人生模擬」不是目標，是全選捷徑；轉成議題。
  人生模擬: [],
};
const TARGET_TO_PURPOSES: Record<string, string[]> = {
  人生模擬: [ALL_SIM],
};

export type Intent = { purposes: string[]; targets: string[]; mustHave: string[] };

const uniq = (a: string[]) => Array.from(new Set(a));

/**
 * 冪等地把 intent 正規化到新模型：
 * - 遷移舊字串（置產 → 購車/購屋目標；人生模擬 → 議題）
 * - 丟掉已不存在的選項
 * - mustHave 與 targets 同步成同一組集合，mustHave 保序、targets 跟隨
 * 就地修改並回傳同一個物件（給 lantu-app.html 那種 mutable case 用）。
 */
export function normalizeIntent(raw: Partial<Intent> | null | undefined): Intent {
  const it = (raw || {}) as Intent;
  let purposes = uniq(Array.isArray(it.purposes) ? it.purposes : []);
  let targets = uniq(Array.isArray(it.targets) ? it.targets : []);
  let must = uniq(Array.isArray(it.mustHave) ? it.mustHave : []);

  // 1. 舊議題 → 新議題 ＋ 帶出目標
  const addTargets: string[] = [];
  purposes = purposes.flatMap((p) => {
    if (p in PURPOSE_TO_TARGETS) addTargets.push(...PURPOSE_TO_TARGETS[p]);
    return p in PURPOSE_MIGRATE ? PURPOSE_MIGRATE[p] : [p];
  });
  targets = targets.concat(addTargets);
  must = must.concat(addTargets);

  // 2. 舊目標 → 新目標 ＋ 帶出議題
  const addPurposes: string[] = [];
  const mapTarget = (t: string) => {
    if (t in TARGET_TO_PURPOSES) addPurposes.push(...TARGET_TO_PURPOSES[t]);
    return t in TARGET_MIGRATE ? TARGET_MIGRATE[t] : [t];
  };
  targets = targets.flatMap(mapTarget);
  must = must.flatMap(mapTarget);
  purposes = purposes.concat(addPurposes);

  // 3. 丟掉已不存在的選項
  purposes = uniq(purposes).filter((p) => (PURPOSES as readonly string[]).includes(p));
  targets = uniq(targets).filter((t) => TARGETS.includes(t));
  must = uniq(must).filter((t) => TARGETS.includes(t));

  // 4. 選了＝必達：兩個集合合一，mustHave 保序（原本沒排到的接在後面，依 TARGETS 順序）
  const union = uniq(must.concat(targets));
  const ordered = must.filter((t) => union.includes(t));
  const rest = union.filter((t) => !ordered.includes(t)).sort((a, b) => TARGETS.indexOf(a) - TARGETS.indexOf(b));
  const finalMust = ordered.concat(rest);

  it.purposes = purposes;
  it.mustHave = finalMust;
  it.targets = finalMust.slice();
  return it;
}

// 新客戶的起手式：退休預設必達。
export function defaultIntent(): Intent {
  return { purposes: [], targets: [DEFAULT_TARGET], mustHave: [DEFAULT_TARGET] };
}

// 已選目標帶出哪些分頁（去重、排除地基層）。
export function goalTabs(mustHave: string[]): { tab: string; tabName: string }[] {
  const baseIds = new Set(BASE_TABS.map((b) => b.tab));
  const seen = new Set<string>();
  const out: { tab: string; tabName: string }[] = [];
  for (const name of mustHave) {
    const m = TARGET_META.find((x) => x.name === name);
    if (!m || baseIds.has(m.tab) || seen.has(m.tab)) continue;
    seen.add(m.tab);
    out.push({ tab: m.tab, tabName: m.tabName });
  }
  return out;
}
