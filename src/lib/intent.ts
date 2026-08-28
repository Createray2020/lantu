// 規劃意圖：關注議題 + 人生目標與優先序（純資料＋純函式，勿 import db，client/server 共用）。
//
// 模型（2026-08-16 Ray 拍板）：
// - 關注議題 purposes：沒有時間軸的財務課題（節稅／信用／保障評估…），客戶填寫、教練可代填。
// - 人生目標 targets：有時間軸、要花錢的事件。**選了＝必須達成，沒選＝不列入規劃**。
// - 優先序 mustHave：已選目標的「有序」清單，＝資源不足時的取捨依據。
//   mustHave 恆等於 targets 的排序版本（同一組集合，兩個欄位並存純為向下相容）。
// - 「人生模擬，了解一生金流」＝全選捷徑，不是一個目標。
//
// 主體（2026-08-22 Ray 拍板）：
// - entities.company：企業主體開關。企業財務不是第 12 個人生目標，是「第二個主體」——
//   企業主有兩張資產負債表且互相勾稽，開了才解鎖第 ④ 群「企業」分頁與三個企業目標。
// - 帶 entity 的 TARGET_META 只在該主體開啟時可選；關掉不刪資料（沿用「取消勾選不刪資料」語意），
//   只是不再顯示、也不列入資料完整度分母。
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
  "想處理公司與個人的財務界線",
  "想評估稅務合規風險",
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
  entity?: EntityKey; // 有的話＝只在該主體開啟時可選（目前只有 'company'）
};

// 可開啟的額外主體。家庭主體永遠存在，不列在這裡。
export const ENTITY_KEYS = ["company"] as const;
export type EntityKey = (typeof ENTITY_KEYS)[number];
export type Entities = { company?: boolean };

// ⚠️ 這個順序不是隨便排的，是照教練實際用了很久的 SurveyCake 訪談問卷抄過來的
//    （見 docs/客戶入場問卷_規格拆解.md）。順序本身就是 know-how：
//    先問職涯與置產這種「講得出口」的，再問婚姻子女這種私領域，最後才到退休與傳承。
//    要動順序之前，先確認問卷那邊也改了——不然教練照著系統問會跟他的口條對不上。
export const TARGET_META: TargetMeta[] = [
  { name: "職涯規劃", tab: "intent", tabName: "意圖/生涯", hint: "轉職・創業" },
  { name: "購屋規劃", tab: "goals", tabName: "目標/置產", hint: "房價・成數", goalType: "購屋" },
  { name: "購車規劃", tab: "goals", tabName: "目標/置產", hint: "車價・貸款", goalType: "購車" },
  { name: "婚姻規劃", tab: "intent", tabName: "意圖/生涯", hint: "年齡・預算" },
  { name: "子女教養規劃", tab: "education", tabName: "子女教育", hint: "學程・學費" },
  { name: "孝親規劃", tab: "goals", tabName: "目標/置產", hint: "奉養・醫療", goalType: "孝親" },
  // ⚠️⚠️ 2026/08/28：這三類整併到生活願望（見 lantu-app.html 的 TARGET_META 註解）。
  // 兩張表都進引擎，留兩個家＝同一筆旅遊被算兩次。
  { name: "旅遊規劃", tab: "lifestyle", tabName: "生活願望", hint: "國內外・頻率・單次預算" },
  { name: "休閒興趣規劃", tab: "lifestyle", tabName: "生活願望", hint: "類型・頻率・每次花費" },
  { name: "奢侈品購買規劃", tab: "lifestyle", tabName: "生活願望", hint: "品項・金額・年齡" },
  { name: "退休生活規劃", tab: "retire", tabName: "退休", hint: "年齡・月費" },
  { name: "傳承規劃", tab: "intent", tabName: "意圖/生涯", hint: "繼承人・金額", goalType: "傳承" },
  { name: "報酬結構優化", tab: "bizcomp", tabName: "報酬結構", hint: "薪資・股利・租金", entity: "company" },
  { name: "企業風險保障", tab: "bizrisk", tabName: "企業保障", hint: "關鍵人・股東", entity: "company" },
  { name: "事業退場規劃", tab: "bizexit", tabName: "退場傳承", hint: "接班・出售・清算", entity: "company" },
];

export const TARGETS = TARGET_META.map((t) => t.name);

// 地基層：不受目標勾選影響，一律要填，缺一塊人生模擬就失真。
// ⚠️ 順序照訪談問卷：收支資債 → 信用/海外 → 保障中心 → 稅賦。
//    保障需求排在最後不是隨意——問卷把它放在所有現況數字之後，因為那時候
//    客戶已經把家庭與負債講完了，「萬一你走了誰接手」才問得下去。
export const BASE_TABS: { tab: string; tabName: string }[] = [
  { tab: "family", tabName: "家庭 / 參數" },
  { tab: "finance", tabName: "收支資債" },
  { tab: "credit", tabName: "信用/海外" },
  { tab: "coverage", tabName: "保障中心" },
  { tab: "tax", tabName: "稅賦" },
];

// 企業主體開啟時，地基層要追加的分頁。
// 為什麼是地基層而不是目標層：不把公司拉進來看，算出來的個人資產負債表就是假的
// （股權、股東往來、連帶保證三項都跨在公私之間）。
// ⚠️ 但「填了」的門檻刻意訂得很低——E1 只要五個數字就算填了，見 lantu-app.html 的 tabFilled。
export const BIZ_BASE_TABS: { tab: string; tabName: string }[] = [
  { tab: "company", tabName: "公司概況" },
  { tab: "linkage", tabName: "公私勾稽" },
  { tab: "bizgate", tabName: "合規閘" },
];

// 依已開啟的主體算出這份規劃的地基層分頁。
export function baseTabs(intent?: Partial<Intent> | null): { tab: string; tabName: string }[] {
  const on = !!(intent && intent.entities && intent.entities.company);
  return on ? BASE_TABS.concat(BIZ_BASE_TABS) : BASE_TABS.slice();
}

// 這份規劃「可選」的人生目標：帶 entity 的只在該主體開啟時出現。
export function visibleTargetMeta(intent?: Partial<Intent> | null): TargetMeta[] {
  const ent = (intent && intent.entities) || {};
  return TARGET_META.filter((m) => !m.entity || !!ent[m.entity]);
}

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

// 勾這兩個議題＝自動開企業主體（和「人生模擬→目標全選」同一種捷徑）。
// 客戶端沒有主體開關，這是客戶自己把企業模組打開的唯一路徑。
// 反向：要關掉主體，UI 必須同時取消這些議題，否則下一次 normalize 又會被打開。
export const PURPOSE_TO_ENTITY: Record<string, EntityKey> = {
  想處理公司與個人的財務界線: "company",
  想評估稅務合規風險: "company",
};

export type Intent = { purposes: string[]; targets: string[]; mustHave: string[]; entities: Entities };

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

  // 5. 主體：只留認得的 key，值一律正規化成 boolean（舊資料沒有這個欄位 → 全關）；
  //    再讓 PURPOSE_TO_ENTITY 的議題把對應主體打開。
  const rawEnt = (it.entities || {}) as Record<string, unknown>;
  const entities: Entities = {};
  for (const k of ENTITY_KEYS) if (rawEnt[k]) entities[k] = true;
  for (const p of purposes) {
    const k = PURPOSE_TO_ENTITY[p];
    if (k) entities[k] = true;
  }

  // 主體沒開 → 它帶出的目標退出必達清單（等同「取消勾選」，已填的公司資料一律保留）。
  // 一定要在這裡剔除，否則 mustHave 裡混著看不見的項目，優先序的 index 會對不上（拖曳會排錯人）。
  const entTarget = new Map(TARGET_META.filter((m) => m.entity).map((m) => [m.name, m.entity as EntityKey]));
  const visibleMust = finalMust.filter((t) => {
    const k = entTarget.get(t);
    return !k || !!entities[k];
  });

  it.purposes = purposes;
  it.mustHave = visibleMust;
  it.targets = visibleMust.slice();
  it.entities = entities;
  return it;
}

// 新客戶的起手式：退休預設必達，不開任何額外主體。
export function defaultIntent(): Intent {
  return { purposes: [], targets: [DEFAULT_TARGET], mustHave: [DEFAULT_TARGET], entities: {} };
}

// 已選目標帶出哪些分頁（去重、排除地基層、排除主體沒開的目標）。
export function goalTabs(mustHave: string[], intent?: Partial<Intent> | null): { tab: string; tabName: string }[] {
  const baseIds = new Set(baseTabs(intent).map((b) => b.tab));
  const visible = new Set(visibleTargetMeta(intent).map((m) => m.name));
  const seen = new Set<string>();
  const out: { tab: string; tabName: string }[] = [];
  for (const name of mustHave) {
    if (!visible.has(name)) continue;
    const m = TARGET_META.find((x) => x.name === name);
    if (!m || baseIds.has(m.tab) || seen.has(m.tab)) continue;
    seen.add(m.tab);
    out.push({ tab: m.tab, tabName: m.tabName });
  }
  return out;
}
