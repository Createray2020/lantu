// 《財務顧問業務制度辦法 V4.0》的數值預設包。
//
// 這是後台「載入 V4 辦法數值」按鈕的資料來源，也是引擎測試的基準。
// 系統本身**不預填**任何數字：資料庫初始為空，這包只有在按下按鈕時才寫入，
// 且只填「目前空白」的欄位，不覆蓋已填的值（見 mergePreset）。
//
// 出處逐條對應 docs/業務制度_V4.md。

import type { CompParams, CompSettings, ModuleRow, RankRow, ThresholdRow } from "./types";

// 職級表。seq 小＝低階。
//
// 2026/08/22 Ray 拍板：教練分四個階段的級別 —— 實習教練（半年學習期）／認證教練 C1–C3／
// 資深教練 S1–S3／首席教練。實習教練的**權限與 C1 完全相同**（含客戶上限 20 位），
// 差別只在「使用期限固定半年」，所以分潤率直接比照 C1，不另外開一組數字。
// clientCap 是各級的客戶資料庫上限；留空＝不限制（見 lib/license.ts）。
export const V4_RANKS: RankRow[] = [
  { code: "INTERN", seq: 0, groupName: "實習教練", tierLabel: "—", promoPct: 15, execPct: 30, clientCap: 20 },
  { code: "C1", seq: 1, groupName: "認證教練", tierLabel: "一階", promoPct: 15, execPct: 30, clientCap: 20 },
  { code: "C2", seq: 2, groupName: "認證教練", tierLabel: "二階", promoPct: 18, execPct: 33, clientCap: 20 },
  { code: "C3", seq: 3, groupName: "認證教練", tierLabel: "三階", promoPct: 21, execPct: 36, clientCap: 20 },
  { code: "S1", seq: 4, groupName: "資深教練", tierLabel: "一階", promoPct: 24, execPct: 43, clientCap: 50 },
  { code: "S2", seq: 5, groupName: "資深教練", tierLabel: "二階", promoPct: 26, execPct: 50, clientCap: 50 },
  { code: "S3", seq: 6, groupName: "資深教練", tierLabel: "三階", promoPct: 28, execPct: 57, clientCap: 100 },
  { code: "CHIEF", seq: 7, groupName: "首席教練", tierLabel: "—", promoPct: 30, execPct: 60, clientCap: 100 },
];

export const V4_THRESHOLDS: ThresholdRow[] = [
  // A 軌（第十一條）
  { kind: "promotion_a", seq: 1, fromCode: "C1", toCode: "C2", cases: 1, fees: 30_000 },
  { kind: "promotion_a", seq: 2, fromCode: "C2", toCode: "C3", cases: 3, fees: 90_000 },
  { kind: "promotion_a", seq: 3, fromCode: "C3", toCode: "S1", cases: 5, fees: 150_000 },
  { kind: "promotion_a", seq: 4, fromCode: "S1", toCode: "S2", cases: 15, fees: 450_000 },
  { kind: "promotion_a", seq: 5, fromCode: "S2", toCode: "S3", cases: 25, fees: 750_000 },
  { kind: "promotion_a", seq: 6, fromCode: "S3", toCode: "CHIEF", cases: 35, fees: 1_050_000 },
  // B 軌（第十二條）—— 認證顧問階段不適用，故只有 S1 以上三列
  { kind: "promotion_b", seq: 1, fromCode: "S1", toCode: "S2", cases: 10, fees: 300_000, teamCases: 20 },
  { kind: "promotion_b", seq: 2, fromCode: "S2", toCode: "S3", cases: 18, fees: 540_000, teamCases: 40 },
  {
    kind: "promotion_b", seq: 3, fromCode: "S3", toCode: "CHIEF",
    cases: 25, fees: 750_000, teamCases: 70, mentorCount: 2, mentorRankCode: "S1",
  },
  // 真除（第十五條）
  { kind: "tenure", seq: 1, toCode: "S1", cases: 3, fees: 90_000 },
  { kind: "tenure", seq: 2, toCode: "S2", cases: 4, fees: 120_000 },
  { kind: "tenure", seq: 3, toCode: "S3", cases: 5, fees: 150_000 },
  {
    kind: "tenure", seq: 4, toCode: "CHIEF", cases: 6, fees: 180_000,
    mentorCount: 1, extraNote: "育成或帶領至少 1 位直轄顧問完成首案",
  },
];

/**
 * 辦法本文只規範顧問費（§2），所以預設只有兩個模塊，且都不填比例
 * —— 留空＝沿用全域的 30／60／10，改一處就全改。
 * 定價也留空：完整財務規劃看實際收入，單點諮詢的價由公司自己填。
 * 培訓費、講座那類另訂辦法的收入，由公司自己新增模塊（多半會選 flat）。
 */
export const V4_MODULES: ModuleRow[] = [
  {
    code: "FULL", seq: 1, name: "完整財務規劃服務", splitMode: "chain",
    price: null, countPromotion: true, countMaintenance: true, enabled: true,
    note: "顧問費依實際收入認列（§2-1）",
  },
  {
    code: "SPOT", seq: 2, name: "單點諮詢服務", splitMode: "chain",
    price: null, countPromotion: true, countMaintenance: true, enabled: true,
    note: "定價由公司自訂；維持資格的最低顧問費會引用它（§16-1）",
  },
];

export const V4_SETTINGS: CompSettings = {
  // 頁 1（第二、三條）
  splitPromoPct: 30,
  splitExecPct: 60,
  taxPct: 5,
  adminPct: 5,
  scopeFull: true,
  scopeSpot: true,
  scopeTraining: false,

  // 頁 3（第六～九條）
  ruleIndependentSides: true,
  ruleChainDiff: true,
  ruleInvertedSkip: true,
  ruleIncompleteToCompany: true,
  ruleCompanyLeadTakesPromo: true,
  peerBonusPct: 50,
  peerBonusOneLevelOnly: true,
  peerBonusNoDuplicate: true,
  peerBonusSkipIfNoDiff: true,
  peerBonusNoExtraOps: true,
  teamCreditPeerInverted: true,
  teamCreditEachLevel: true,
  teamCreditExecChain: true,
  teamCreditPeerRecruit: true,
  custodyMinRankCode: "S1",
  custodyUseCustodian: true,
  custodyAutoTransfer: true,
  custodyNoBackfill: true,

  // 頁 4（第十、十三條）
  promoDualIndex: true,
  promoLifetime: true,
  promoInvoiceBased: true,
  promoRequireSurvey: true,
  promoEffectiveDay: 1,
  promoManualReview: false,
  trackBMinRankCode: "S1",
  selfExecFirstN: 5,
  teamCreditChainOnly: true,

  // 頁 5（第十四、十五、二十四、二十六條）
  recruitByThreshold: true,
  recruitAllowHigher: true,
  recruitEvidence: ["服務合約", "收費紀錄", "客戶見證"],
  entryRankCode: "C1",
  tenureMinRankCode: "S1",
  tenureMonths: 12,
  tenureFullRate: true,
  tenureCountLifetime: true,
  tenureStepDown: true,
  tenureStepDownMax: 1,
  tenureFloorRankCode: "C3",
  tenureShowPublic: false,
  rejoinAsRecruit: true,
  leaveKeepMetrics: false,

  // 頁 6（第十六～十九條）
  maintainCases: 1,
  maintainUseSpotPrice: true,
  maintainYearStart: "01-01",
  trainHours: 8,
  trainPerSession: 2,
  trainSpeakerMultiplier: 2,
  trainExternalCap: 3,
  trainExternalPreApprove: true,
  trainInternalFirst: true,
  trainOnlineCounts: true,
  penaltySuspendRecruit: true,
  penaltySuspendLead: true,
  penaltyNoDemote: true,
  penaltyKeepDiff: true,
  penaltyEffective: "01-01",
  restoreDay: 1,
  restoreManualReview: true,
  exemptReasons: ["育嬰", "重大傷病", "兵役"],
  exemptFirstYear: true,

  // 頁 7（第二十、二十一、二十五條）
  caseMergeSameYear: true,
  caseFeeAccumulate: true,
  caseAcrossYears: true,
  caseNoWeight: true,
  promoterBasis: "closer",
  disputeByRecord: true,
  surveyRequired: true,
  surveyQuestions: [
    "諮詢前的困擾與期待",
    "諮詢過程中印象最深的環節",
    "諮詢後的具體改變或決定",
  ],
  surveyMarketingOptIn: true,
  leadCriteria: ["職級", "專長領域", "維持資格狀態"],
  leadSkipSuspended: true,
  // 預設專長清單，對齊系統既有的規劃模組（退休／教育／購房／保障／稅賦／傳承／
  // 信用債務／企業主／投資／現金流）。教練在自己的公開檔案裡從這份清單勾選，
  // 客戶選教練與公司派案的候選排序都吃它。公司可自由增刪。
  specialties: [
    "退休規劃",
    "子女教育金",
    "購房與房貸",
    "保障規劃（壽險／醫療／長照）",
    "稅務規劃",
    "資產傳承",
    "債務整合與信用",
    "企業主財務",
    "投資配置",
    "家庭現金流管理",
  ],

  // 頁 8（第二十二、二十三、二十六～二十八條）
  payoutDay: 5,
  payoutAfterReceipt: true,
  payoutEarlyAllowed: true,
  payoutInstalment: true,
  refundUnpaidVoid: true,
  refundProrate: true,
  refundDeductMetrics: true,
  // 辦法未明定「扣除後低於現職級門檻是否降級」，故留空由公司自行決定。
  leaveTeamToUpline: true,
  leaveClientsTo: "upline",
  violations: [
    "挪用或侵占客戶款項",
    "偽造業績、佐證資料或回饋問卷",
    "重大客戶投訴查證屬實",
    "洩漏客戶個人資料",
    "其他重大違反誠信原則之行為",
  ],
  relationStatement: "顧問與公司為獨立承攬合作關係，非僱傭關係。",

  // 頁 9（第三十一條）
  versionNoRetro: true,
  freezePaid: true,
  draftSimulate: true,
};

export const V4_PRESET: CompParams = {
  version: "V4.0",
  settings: V4_SETTINGS,
  ranks: V4_RANKS,
  thresholds: V4_THRESHOLDS,
  modules: V4_MODULES,
};

/**
 * 「載入 V4 辦法數值」的合併規則：**只填空白，不覆蓋已填**。
 * - settings：現有 key（含 null）視為已設定，跳過。
 * - ranks / thresholds：只有在現況完全沒有資料時才整批帶入
 *   （半套合併會讓自訂職級表被塞進不存在的階級，比留白更難收拾）。
 */
export function mergePreset(current: CompParams): CompParams {
  const settings: CompSettings = { ...V4_SETTINGS };
  for (const [k, v] of Object.entries(current.settings)) {
    if (v !== undefined) (settings as Record<string, unknown>)[k] = v;
  }
  return {
    ...current,
    settings,
    ranks: current.ranks.length ? current.ranks : V4_RANKS.map((r) => ({ ...r })),
    thresholds: current.thresholds.length
      ? current.thresholds
      : V4_THRESHOLDS.map((t) => ({ ...t })),
    modules: current.modules?.length ? current.modules : V4_MODULES.map((m) => ({ ...m })),
  };
}
