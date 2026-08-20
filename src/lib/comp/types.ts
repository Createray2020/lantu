// 業務制度：型別定義。
//
// 核心語意（整套系統一致）：
//   數字欄位 undefined / null ＝「未設定」＝ 該門檻不檢查、該規則不計算，**不是 0**。
//   開關（boolean）則永遠有值，預設見 DEFAULT_FLAGS。
//
// 對應辦法：docs/業務制度_V4.md

/** 職級（一版制度一組，可增刪、可排序）。seq 小＝低階。 */
export type RankRow = {
  code: string;
  seq: number;
  /** 屬於哪個服務模塊的職級表；空字串／未設定＝預設表（所有模塊的 fallback） */
  moduleCode?: string | null;
  groupName?: string | null;
  tierLabel?: string | null;
  /** 推廣端分潤率（%），null＝未設定 */
  promoPct?: number | null;
  /** 執案端分潤率（%），null＝未設定 */
  execPct?: number | null;
};

/**
 * 服務模塊：一種可銷售的服務內容，各自帶自己的分潤結構。
 *
 * 「留空＝沿用預設」在這裡再延伸一層：
 *   模塊的比例欄留空 → 用全域 settings 的 splitPromoPct／splitExecPct；
 *   模塊沒有自訂職級表 → 用預設那組職級分潤率。
 * 所以只想改「單點諮詢的執案端拉到 70%」時，填那一格就好，其餘照舊。
 *
 * splitMode:
 *   chain — 差％逐層（辦法本文那套）
 *   flat  — 不走差％：執行者／推廣者各拿固定 %，其餘歸公司，不沿輔導鏈、不發平階獎金
 */
export type ModuleRow = {
  code: string;
  seq: number;
  name: string;
  splitMode?: "chain" | "flat";
  /** chain 模式的區塊比例；留空＝沿用全域 */
  splitPromoPct?: number | null;
  splitExecPct?: number | null;
  /** flat 模式：執行者／推廣者各自的固定 %。自推自執時兩者相加。 */
  flatExecPct?: number | null;
  flatPromoPct?: number | null;
  /** 定價；留空＝每案自行輸入實收（如完整財務規劃） */
  price?: number | null;
  /** 業績是否計入晉升指標（辦法 §2：培訓費等不適用本制度） */
  countPromotion?: boolean;
  /** 是否計入維持資格的執案門檻 */
  countMaintenance?: boolean;
  enabled?: boolean;
  note?: string | null;
};

export type ThresholdKind = "promotion_a" | "promotion_b" | "tenure";

/** 門檻列：晉升 A 軌／B 軌／真除共用。 */
export type ThresholdRow = {
  kind: ThresholdKind;
  seq?: number;
  /** 起始職級；tenure 為 null */
  fromCode?: string | null;
  /** 目標職級；tenure 為「核定職級」 */
  toCode: string;
  cases?: number | null;
  fees?: number | null;
  teamCases?: number | null;
  mentorCount?: number | null;
  mentorRankCode?: string | null;
  extraNote?: string | null;
  enabled?: boolean;
};

/**
 * 單值參數與開關。全部 optional —— 沒有 key ＝ 未設定。
 * 後台頁 1–9 的每個欄位都對應這裡的一個 key。
 */
export type CompSettings = Partial<{
  // ── 頁 1 分潤架構（第三條） ──
  splitPromoPct: number;
  splitExecPct: number;
  taxPct: number;
  adminPct: number;
  scopeFull: boolean;
  scopeSpot: boolean;
  scopeTraining: boolean;
  priceSpot: number;
  priceFull: number;

  // ── 頁 3 差％規則（第六條） ──
  ruleIndependentSides: boolean;
  ruleChainDiff: boolean;
  ruleInvertedSkip: boolean;
  ruleIncompleteToCompany: boolean;
  ruleCompanyLeadTakesPromo: boolean;
  chainMaxLevels: number;

  // ── 頁 3 平階輔導獎金（第七條） ──
  peerBonusPct: number;
  peerBonusOneLevelOnly: boolean;
  peerBonusNoDuplicate: boolean;
  peerBonusSkipIfNoDiff: boolean;
  peerBonusNoExtraOps: boolean;

  // ── 頁 3 團隊輔導業績（第八、十三條） ──
  teamCreditPeerInverted: boolean;
  teamCreditEachLevel: boolean;
  teamCreditExecChain: boolean;
  teamCreditPeerRecruit: boolean;

  // ── 頁 3 代管（第九條） ──
  custodyMinRankCode: string;
  custodyUseCustodian: boolean;
  custodyAutoTransfer: boolean;
  custodyNoBackfill: boolean;

  // ── 頁 4 晉升原則（第十條） ──
  promoDualIndex: boolean;
  promoLifetime: boolean;
  promoInvoiceBased: boolean;
  promoRequireSurvey: boolean;
  promoEffectiveDay: number;
  promoManualReview: boolean;

  // ── 頁 4 B 軌配套（第十三條） ──
  trackBMinRankCode: string;
  selfExecFirstN: number;
  teamCreditChainOnly: boolean;

  // ── 頁 5 同業招募與真除（第十四、十五、二十四條） ──
  recruitByThreshold: boolean;
  recruitAllowHigher: boolean;
  recruitEvidence: string[];
  entryRankCode: string;
  tenureMinRankCode: string;
  tenureMonths: number;
  tenureFullRate: boolean;
  tenureCountLifetime: boolean;
  tenureStepDown: boolean;
  tenureStepDownMax: number;
  tenureFloorRankCode: string;
  tenureShowPublic: boolean;
  rejoinAsRecruit: boolean;
  leaveKeepMetrics: boolean;

  // ── 頁 6 維持資格（第十六～十九條） ──
  maintainCases: number;
  maintainMinFee: number;
  maintainUseSpotPrice: boolean;
  maintainYearStart: string; // 'MM-DD'
  trainHours: number;
  trainPerSession: number;
  trainSpeakerMultiplier: number;
  trainExternalCap: number;
  trainExternalPreApprove: boolean;
  trainInternalFirst: boolean;
  trainOnlineCounts: boolean;
  penaltySuspendRecruit: boolean;
  penaltySuspendLead: boolean;
  penaltyNoDemote: boolean;
  penaltyKeepDiff: boolean;
  penaltyEffective: string; // 'MM-DD'
  restoreDay: number;
  restoreManualReview: boolean;
  exemptReasons: string[];
  exemptFirstYear: boolean;

  // ── 頁 7 個案認定與結案（第二十、二十一、二十五條） ──
  caseMergeSameYear: boolean;
  caseFeeAccumulate: boolean;
  caseAcrossYears: boolean;
  caseNoWeight: boolean;
  promoterBasis: "closer" | "first";
  disputeByRecord: boolean;
  surveyRequired: boolean;
  surveyQuestions: string[];
  surveyMarketingOptIn: boolean;
  leadCriteria: string[];
  leadSkipSuspended: boolean;
  specialties: string[];

  // ── 頁 8 發放與退費（第二十二、二十三、二十六～二十八條） ──
  payoutDay: number;
  payoutAfterReceipt: boolean;
  refundWatchDays: number;
  payoutEarlyAllowed: boolean;
  payoutInstalment: boolean;
  refundUnpaidVoid: boolean;
  refundProrate: boolean;
  refundDeductMetrics: boolean;
  refundDemote: "none" | "demote";
  leaveTeamToUpline: boolean;
  leaveClientsTo: "upline" | "assign";
  violations: string[];
  relationStatement: string;

  // ── 頁 9 版本規則（第三十一條） ──
  versionNoRetro: boolean;
  freezePaid: boolean;
  draftSimulate: boolean;
}>;

/** 一個制度版本的完整參數（引擎唯一輸入來源）。 */
export type CompParams = {
  versionId?: string;
  version?: string;
  settings: CompSettings;
  ranks: RankRow[];
  thresholds: ThresholdRow[];
  modules?: ModuleRow[];
};

/**
 * 開關的預設值。
 * 開關不像數字有「留空」的概念（勾選框不存在第三態），所以一律有預設；
 * 資料庫沒存過的 key 會落到這裡。核心差％機制預設為開，否則新裝的系統算不出東西。
 */
export const DEFAULT_FLAGS = {
  ruleIndependentSides: true,
  ruleChainDiff: true,
  ruleInvertedSkip: true,
  ruleIncompleteToCompany: true,
  ruleCompanyLeadTakesPromo: true,
  peerBonusOneLevelOnly: true,
  peerBonusNoDuplicate: true,
  peerBonusSkipIfNoDiff: true,
  peerBonusNoExtraOps: true,
} as const;

export function flag(s: CompSettings, key: keyof typeof DEFAULT_FLAGS): boolean {
  const v = s[key];
  return typeof v === "boolean" ? v : DEFAULT_FLAGS[key];
}

/** 空制度：後台「全部清空」與新版本的起點。數字全部不存在＝未設定。 */
export function emptyParams(): CompParams {
  return { settings: {}, ranks: [], thresholds: [], modules: [] };
}
