// 業務制度後台的欄位規格（宣告式）。
//
// 為什麼用一份 spec 而不是手刻兩百個 input：制度會被改。
// 條文加一項參數時，這裡加一列就長出欄位＋存檔＋「載入 V4」對照，不必動 UI 程式。
//
// hint 一律寫「V4＝…」，讓使用者知道留空時辦法原本的數字是多少。

import type { CompSettings } from "@/lib/comp/types";

export type FieldType = "num" | "money" | "pct" | "text" | "bool" | "select" | "rank" | "list" | "mmdd";

export type Field = {
  key: keyof CompSettings;
  label: string;
  type: FieldType;
  unit?: string;
  hint?: string;
  options?: { v: string; l: string }[];
};

export type Section = { title: string; note?: string; fields: Field[] };

export type TabSpec = {
  id: string;
  label: string;
  law: string;
  intro?: string;
  /** 需要動態表格的分頁（職級／門檻／版本），由 SystemEditor 另外渲染 */
  custom?: "ranks" | "promotion" | "tenure" | "versions";
  sections: Section[];
};

export const TABS: TabSpec[] = [
  {
    id: "split",
    label: "分潤架構",
    law: "第二、三條",
    intro: "每筆顧問費 100% 怎麼切三塊。三者相加必須等於 100%，否則存檔會被擋下。",
    sections: [
      {
        title: "收入分配",
        fields: [
          { key: "splitPromoPct", label: "推廣端", type: "pct", hint: "V4＝30" },
          { key: "splitExecPct", label: "執案端", type: "pct", hint: "V4＝60" },
          { key: "taxPct", label: "營業稅（公司營運內含）", type: "pct", hint: "V4＝5" },
          { key: "adminPct", label: "行政成本（公司營運內含）", type: "pct", hint: "V4＝5" },
        ],
      },
      {
        title: "適用範圍",
        note: "培訓費、會員費、講座等另依相關辦法辦理，預設不套用本制度。",
        fields: [
          { key: "scopeFull", label: "完整財務規劃服務", type: "bool" },
          { key: "scopeSpot", label: "單點諮詢服務", type: "bool" },
          { key: "scopeTraining", label: "培訓／會員／講座／課程", type: "bool", hint: "V4＝不套用" },
        ],
      },
      {
        title: "服務定價",
        note: "單點諮詢定價會被「維持資格」的最低顧問費門檻引用。",
        fields: [
          { key: "priceSpot", label: "單點諮詢服務定價", type: "money" },
          { key: "priceFull", label: "完整財務規劃定價", type: "money" },
        ],
      },
    ],
  },
  {
    id: "ranks",
    label: "職級與分潤率",
    law: "第四、五條",
    custom: "ranks",
    intro:
      "整套制度的骨架：差％引擎、晉升表、真除表都以這裡的職級代號查表。職級可增刪、可排序，序號小＝低階。",
    sections: [],
  },
  {
    id: "rules",
    label: "差％與平階代管",
    law: "第六～九條",
    intro: "分潤引擎的行為開關。任一項改動都會即時反映在下方的辦法範例驗算。",
    sections: [
      {
        title: "差％計算（第六條）",
        fields: [
          { key: "ruleIndependentSides", label: "推廣端與執案端獨立計算", type: "bool" },
          { key: "ruleChainDiff", label: "輔導鏈逐層取「自身% − 下層已計%」", type: "bool" },
          { key: "ruleInvertedSkip", label: "倒掛／平階該層不計差％，由更上層續算", type: "bool" },
          { key: "ruleIncompleteToCompany", label: "輔導鏈不完整時未分配差額歸公司", type: "bool" },
          { key: "ruleCompanyLeadTakesPromo", label: "公司派案：推廣端全數歸公司", type: "bool" },
          { key: "chainMaxLevels", label: "差％向上追溯層數上限", type: "num", unit: "層", hint: "留空＝追到頂" },
        ],
      },
      {
        title: "平階輔導獎金（第七條）",
        note: "平階時直屬主管差％為 0，改由其上一層實際取得差％者讓出一部分作為輔導獎金。",
        fields: [
          { key: "peerBonusPct", label: "自上層差％分得比例", type: "pct", hint: "V4＝50；留空＝不發放" },
          { key: "peerBonusOneLevelOnly", label: "僅自上一層取一層，不向上遞延", type: "bool" },
          { key: "peerBonusNoDuplicate", label: "同一案件不因多層平階重複發放", type: "bool" },
          { key: "peerBonusSkipIfNoDiff", label: "上層無差％可分者不發放", type: "bool" },
          { key: "peerBonusNoExtraOps", label: "公司營運不因平階另行提撥", type: "bool" },
        ],
      },
      {
        title: "團隊輔導業績認列（第八、十三條）",
        fields: [
          { key: "teamCreditPeerInverted", label: "平階／倒掛案件業績計入直屬主管", type: "bool" },
          { key: "teamCreditEachLevel", label: "沿輔導鏈逐層向上，鏈上各層皆計入", type: "bool" },
          { key: "teamCreditExecChain", label: "推廣／執案分屬不同鏈時歸執案者的鏈", type: "bool" },
          { key: "teamCreditPeerRecruit", label: "同業招募顧問業績計入推薦人", type: "bool" },
          { key: "teamCreditChainOnly", label: "非該鏈之協助／轉介不得計入", type: "bool" },
        ],
      },
      {
        title: "代管（第九條）",
        note: "認證顧問招募到平階或更高階顧問時，由其上層（達門檻職級者）暫代輔導。",
        fields: [
          { key: "custodyMinRankCode", label: "推薦人未達此職級即由上層代管", type: "rank", hint: "V4＝S1" },
          { key: "custodyUseCustodian", label: "代管期間差％與平階獎金依代管者計算", type: "bool" },
          { key: "custodyAutoTransfer", label: "推薦人達標後輔導關係自動移轉回推薦人", type: "bool" },
          { key: "custodyNoBackfill", label: "移轉前業績不回溯計入推薦人", type: "bool" },
        ],
      },
    ],
  },
  {
    id: "promotion",
    label: "晉升門檻",
    law: "第十～十三條",
    custom: "promotion",
    intro: "A 軌（個人）與 B 軌（個人＋團隊）擇一達成即可晉升。門檻列依職級表自動長出。",
    sections: [
      {
        title: "晉升原則（第十條）",
        fields: [
          { key: "promoDualIndex", label: "雙指標制（個案數＋顧問費）須同時達標", type: "bool" },
          { key: "promoLifetime", label: "累計採終身制、不歸零", type: "bool" },
          { key: "promoInvoiceBased", label: "顧問費以公司實收發票紀錄為準", type: "bool" },
          { key: "promoRequireSurvey", label: "個案須回饋問卷回收結案才計入", type: "bool" },
          { key: "promoEffectiveDay", label: "達標後晉升生效日", type: "num", unit: "日（次月）", hint: "V4＝1" },
          { key: "promoManualReview", label: "晉升需人工複核（關＝全自動）", type: "bool" },
        ],
      },
      {
        title: "B 軌配套（第十三條）",
        fields: [
          { key: "trackBMinRankCode", label: "B 軌開放的最低起始職級", type: "rank", hint: "V4＝S1" },
          { key: "selfExecFirstN", label: "認證顧問階段須親自執案案數", type: "num", unit: "案", hint: "V4＝5" },
        ],
      },
    ],
  },
  {
    id: "tenure",
    label: "同業招募與真除",
    law: "第十四、十五、二十四、二十六條",
    custom: "tenure",
    intro: "同業招募依過往實績核定職級；S1 以上核定者須於真除期間達標，未達則認階轉正。",
    sections: [
      {
        title: "職級核定（第十四、二十四條）",
        fields: [
          { key: "recruitByThreshold", label: "依過往實績對照 A 軌門檻表核定", type: "bool" },
          { key: "recruitAllowHigher", label: "核定得高於推薦人職級（允許倒掛）", type: "bool" },
          { key: "recruitEvidence", label: "應檢附佐證資料", type: "list" },
          { key: "entryRankCode", label: "一般培訓進入之初任職級", type: "rank", hint: "V4＝C1" },
        ],
      },
      {
        title: "真除制度（第十五條）",
        fields: [
          { key: "tenureMinRankCode", label: "適用真除的最低核定職級", type: "rank", hint: "V4＝S1，以下不需真除" },
          { key: "tenureMonths", label: "真除期間（自到職日起）", type: "num", unit: "個月", hint: "V4＝12" },
          { key: "tenureFullRate", label: "真除期間分潤按核定職級全額計算", type: "bool" },
          { key: "tenureCountLifetime", label: "真除期間業績計入本人終身累計", type: "bool" },
          { key: "tenureStepDown", label: "未達標時認階轉正（往下對照最高達成階）", type: "bool" },
          { key: "tenureStepDownMax", label: "認階次數上限", type: "num", unit: "次", hint: "V4＝1" },
          { key: "tenureFloorRankCode", label: "全未達標時之保底職級", type: "rank", hint: "V4＝C3" },
          { key: "tenureShowPublic", label: "真除狀態對外顯示", type: "bool", hint: "V4＝僅內部註記" },
        ],
      },
      {
        title: "離職與回任（第二十六條）",
        fields: [
          { key: "rejoinAsRecruit", label: "回任比照同業招募程序（含真除）", type: "bool" },
          { key: "leaveKeepMetrics", label: "離職者已累計個人業績予以保留", type: "bool", hint: "V4＝不保留" },
        ],
      },
    ],
  },
  {
    id: "maintain",
    label: "維持資格",
    law: "第十六～十九條",
    intro: "年度制。執案與訓練兩個門檻都達成，才算達成當年度維持門檻。任一留空＝該門檻不檢查。",
    sections: [
      {
        title: "執案門檻（第十六條一）",
        fields: [
          { key: "maintainCases", label: "年度最低完成收費個案數", type: "num", unit: "案", hint: "V4＝1" },
          { key: "maintainUseSpotPrice", label: "最低顧問費引用單點諮詢定價", type: "bool" },
          { key: "maintainMinFee", label: "自訂最低顧問費（未引用定價時）", type: "money" },
          { key: "maintainYearStart", label: "年度起算日", type: "mmdd", hint: "V4＝01-01" },
        ],
      },
      {
        title: "訓練門檻（第十六條二）",
        fields: [
          { key: "trainHours", label: "年度最低訓練時數", type: "num", unit: "小時", hint: "V4＝8" },
          { key: "trainPerSession", label: "內部研討會每場認列", type: "num", unit: "小時", hint: "V4＝2" },
          { key: "trainSpeakerMultiplier", label: "擔任講師之倍率", type: "num", unit: "倍", hint: "V4＝2" },
          { key: "trainExternalCap", label: "外部課程年度認列上限", type: "num", unit: "小時", hint: "V4＝3" },
          { key: "trainExternalPreApprove", label: "外部課程須事前認可", type: "bool" },
          { key: "trainInternalFirst", label: "內部研討會優先認列", type: "bool" },
          { key: "trainOnlineCounts", label: "線上同步參與視同出席", type: "bool" },
        ],
      },
      {
        title: "未達門檻之處理（第十七、十八條）",
        fields: [
          { key: "penaltySuspendRecruit", label: "暫停「招募直轄顧問」資格", type: "bool" },
          { key: "penaltySuspendLead", label: "暫停「公司派案」受派資格", type: "bool" },
          { key: "penaltyNoDemote", label: "職級不因未達門檻而降級", type: "bool" },
          { key: "penaltyKeepDiff", label: "既有直轄團隊差％照常領取", type: "bool" },
          { key: "penaltyEffective", label: "暫停生效日（次年度）", type: "mmdd", hint: "V4＝01-01" },
          { key: "restoreDay", label: "補足後恢復日", type: "num", unit: "日（次月）", hint: "V4＝1" },
          { key: "restoreManualReview", label: "恢復需公司審核", type: "bool" },
        ],
      },
      {
        title: "豁免與新人保護（第十九條）",
        fields: [
          { key: "exemptReasons", label: "豁免事由（需公司核准）", type: "list" },
          { key: "exemptFirstYear", label: "到職未滿一完整年度之首年度豁免", type: "bool" },
        ],
      },
    ],
  },
  {
    id: "case",
    label: "個案認定與結案",
    law: "第二十、二十一、二十五條",
    intro: "定義「一個案子」怎麼算，以及結案要件。晉升指標全部建立在這套認定之上。",
    sections: [
      {
        title: "個案計數（第二十條）",
        fields: [
          { key: "caseMergeSameYear", label: "同一自然人同年度所有服務合併為一個案", type: "bool" },
          { key: "caseFeeAccumulate", label: "該年度顧問費累積計入", type: "bool" },
          { key: "caseAcrossYears", label: "跨年度續約各年各計一案", type: "bool" },
          { key: "caseNoWeight", label: "個案數不依金額加權", type: "bool" },
          {
            key: "promoterBasis", label: "推廣者認定基準", type: "select",
            options: [{ v: "closer", l: "最終促成簽約者" }, { v: "first", l: "首次接觸者" }],
            hint: "V4＝最終促成簽約者",
          },
          { key: "disputeByRecord", label: "爭議以公司簽約及收費紀錄裁決", type: "bool" },
        ],
      },
      {
        title: "回饋問卷結案制（第二十一條）",
        fields: [
          { key: "surveyRequired", label: "問卷回收為結案要件（未回收不計晉升指標）", type: "bool" },
          { key: "surveyQuestions", label: "問卷題目", type: "list" },
          { key: "surveyMarketingOptIn", label: "問卷末端設置行銷授權勾選欄", type: "bool" },
        ],
      },
      {
        title: "公司派案（第二十五條）",
        fields: [
          { key: "leadCriteria", label: "派案指派依據", type: "list" },
          { key: "leadSkipSuspended", label: "受暫停受派資格者不予指派", type: "bool" },
          { key: "specialties", label: "專長領域清單", type: "list" },
        ],
      },
    ],
  },
  {
    id: "payout",
    label: "發放與退費",
    law: "第二十二、二十三、二十六～二十八條",
    intro: "分潤何時發、退費怎麼追、離職與違規怎麼處理。",
    sections: [
      {
        title: "分潤發放（第二十二條）",
        fields: [
          { key: "payoutDay", label: "發放日", type: "num", unit: "日（次月）", hint: "V4＝5" },
          { key: "payoutAfterReceipt", label: "以公司實際收訖為發放前提", type: "bool" },
          { key: "refundWatchDays", label: "退費／解約觀察期", type: "num", unit: "天" },
          { key: "payoutEarlyAllowed", label: "得由公司核定提前發放", type: "bool" },
          { key: "payoutInstalment", label: "分期收款按各期實收計算", type: "bool" },
        ],
      },
      {
        title: "退費與解約（第二十三條）",
        fields: [
          { key: "refundUnpaidVoid", label: "未發放分潤不予發放", type: "bool" },
          { key: "refundProrate", label: "部分退費按實收比例重算", type: "bool" },
          { key: "refundDeductMetrics", label: "退費案件自累計指標扣除", type: "bool" },
          {
            key: "refundDemote", label: "扣除後低於現職級門檻時", type: "select",
            options: [{ v: "none", l: "不降級" }, { v: "demote", l: "降級" }],
            hint: "辦法未明定，請自行決定；留空＝不處理",
          },
        ],
      },
      {
        title: "離職與退出（第二十六條）",
        fields: [
          { key: "leaveTeamToUpline", label: "直轄團隊自動歸屬直屬主管", type: "bool" },
          {
            key: "leaveClientsTo", label: "既有客戶與在途案件歸屬", type: "select",
            options: [{ v: "upline", l: "直屬主管" }, { v: "assign", l: "由主管指派承接" }],
          },
        ],
      },
      {
        title: "重大違規與合作關係（第二十七、二十八條）",
        fields: [
          { key: "violations", label: "得終止合作之事由", type: "list" },
          { key: "relationStatement", label: "合作關係定位說明", type: "text" },
        ],
      },
    ],
  },
  {
    id: "versions",
    label: "版本管理",
    law: "第三十一條",
    custom: "versions",
    intro:
      "案件永遠指向簽約當下的版本。改制度不回頭改舊分潤——這是整套系統最重要的防呆。",
    sections: [
      {
        title: "版本規則",
        fields: [
          { key: "versionNoRetro", label: "制度修訂不溯及已結案件之分潤", type: "bool" },
          { key: "freezePaid", label: "已發放案件永久凍結在當時版本", type: "bool" },
          { key: "draftSimulate", label: "草稿版可先試算、不影響正式", type: "bool" },
        ],
      },
    ],
  },
];
