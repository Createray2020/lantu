// 模組開關（全平台，後台維護）。2026/09/09 Ray：「先關閉學習區，架設完成後再打開，
// 確保未來維修功能。」——重點在「未來」：做成一張表 ＋ 一份程式端清單，
// 之後任何模組要進維修，只要在 MODULES 加一行、在入口處呼叫 isModuleOn()。
//
// ⚠️⚠️ 合併語意與 clientDashStore 刻意相反：**沒有列 ＝ 回到 defaultEnabled**，不是「開啟」。
//    學習區的 defaultEnabled 是 false，所以這包一部署上去學習區就是關的，
//    不需要先跑 seed、也不會有「部署完成到後台去關掉」之間學習區短暫開著的空窗。
// ⚠️ 讀取一律走 getModuleStates()（unstable_cache + tag）：這是每一次頁面渲染都會問的東西，
//    每頁打一次 DB 是白花的。後台一存就 updateTag，下一次渲染即生效。
import { unstable_cache, updateTag } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { platformModules } from "@/Shared/db/schema";

export const PLATFORM_MODULES_TAG = "platform-modules";

export type ModuleKey = "learn";

export type ModuleDef = {
  key: ModuleKey;
  label: string;
  /** 這個模組住在哪一端，後台列表分群用。 */
  area: string;
  /** 關掉之後實際會發生什麼事，寫給按開關的人看。 */
  effect: string;
  /** 沒有任何設定時的狀態。 */
  defaultEnabled: boolean;
  /** 關閉時顯示給使用者的預設文案（後台可覆寫）。 */
  defaultNotice: string;
};

export const MODULES: ModuleDef[] = [
  {
    key: "learn",
    label: "學習區",
    area: "教練端",
    effect:
      "關閉時，教練端頂欄的「學習區」入口不出現，直接打網址進來的人看到建置中說明頁，"
      + "標記單元完成也會被擋下。後台「學習區管理」不受影響，course 與教材照樣可以先建好。",
    defaultEnabled: false,
    defaultNotice: "學習區正在建置中，課程與教材準備好之後會開放。",
  },
];

export const MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

export function moduleDef(key: ModuleKey): ModuleDef | null {
  return MODULES.find((m) => m.key === key) ?? null;
}

export type ModuleState = { enabled: boolean; notice: string; configured: boolean };
export type ModuleStates = Record<string, ModuleState>;

export type ModuleRow = { key: string; enabled: boolean; notice: string | null };

/**
 * DB 的列 ＋ 程式端清單 → 每個模組的實際狀態。
 * 純函式，測試釘的就是這裡的合併語意。
 */
export function mergeModules(rows: ModuleRow[]): ModuleStates {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: ModuleStates = {};
  for (const m of MODULES) {
    const row = byKey.get(m.key);
    out[m.key] = {
      enabled: row ? row.enabled : m.defaultEnabled,
      // 後台把說明清空 → 回到預設文案，而不是給使用者一片空白。
      notice: (row?.notice ?? "").trim() || m.defaultNotice,
      configured: !!row,
    };
  }
  return out;
}

export async function listModuleRows(): Promise<ModuleRow[]> {
  const rows = await db.select().from(platformModules);
  return rows.map((r) => ({ key: r.key, enabled: r.enabled, notice: r.notice }));
}

export const getModuleStates = unstable_cache(
  async (): Promise<ModuleStates> => {
    let rows: ModuleRow[] = [];
    // ⚠️ DB 讀不到時一律退回程式端預設，不要讓一次連線抖動把整個教練端的入口
    //    變成「全部開啟」（學習區會突然冒出來）或整站噴錯。
    try { rows = await listModuleRows(); } catch { rows = []; }
    return mergeModules(rows);
  },
  ["lantu-platform-modules"],
  { tags: [PLATFORM_MODULES_TAG] },
);

/** 入口處的一行閘。 */
export async function isModuleOn(key: ModuleKey): Promise<boolean> {
  const states = await getModuleStates();
  return states[key]?.enabled ?? moduleDef(key)?.defaultEnabled ?? true;
}

/** 關閉時要顯示的說明文字。 */
export async function moduleNotice(key: ModuleKey): Promise<string> {
  const states = await getModuleStates();
  return states[key]?.notice || moduleDef(key)?.defaultNotice || "此功能維修中。";
}

/**
 * 後台切換單一模組。清單裡沒有的 key 直接忽略（不讓 UI 或舊網址寫進一列死資料）。
 * neon-http 沒有交易 → 單一 insert…on conflict do update。
 */
export async function saveModule(
  key: string,
  enabled: boolean,
  notice: string | null,
  updatedBy: string | null,
): Promise<void> {
  if (!MODULE_KEYS.includes(key as ModuleKey)) return;
  const clean = (notice ?? "").trim();
  await db.insert(platformModules)
    .values({ key, enabled, notice: clean || null, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({
      target: platformModules.key,
      set: {
        enabled: sql`excluded.enabled`,
        notice: sql`excluded.notice`,
        updatedAt: sql`excluded.updated_at`,
        updatedBy: sql`excluded.updated_by`,
      },
    });
  updateTag(PLATFORM_MODULES_TAG);
}
