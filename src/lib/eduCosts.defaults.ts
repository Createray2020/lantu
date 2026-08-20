// 台灣各就學階段教育費用預設參數（2026/08 查證，民國 115 年）。
// 全部＝「每學年（1 年）新台幣元」的**今日現值**；學費上漲率由引擎另外套（params.tuitionGrowth）。
// 這份只是 seed —— 上線後改數字請走後台 /admin/edu-costs，不要回來改程式。
//
// 政策前提（會影響數字，改動前先確認法規現況）：
//  - 幼兒園：111 學年起「0-6 歲國家一起養」，公幼每月繳費上限 1,000 元、準公共 3,000 元；
//    讀私幼改領育兒津貼 5,000 元/月（第 2 胎 6,000、第 3 胎以上 7,000）。
//  - 高中職：112 學年第 2 學期起公私立**學費全免**（不含雜費、代收代辦、餐費）——
//    所以這裡的高中職數字是「免學費之後家長還要付的錢」。
//  - 私立大專：112 學年第 2 學期起每年補助 35,000 元，**只給學士/專科班，碩博士與延修生不適用**。
//  - 公立大專**沒有**普及性減免，勿比照私立扣 3.5 萬。
//  - 115 學年學雜費核定調幅 0.62%，且逾百校三年內不得調漲 → tuitionGrowth 預設 0.7% 已足夠。
export type EduCostSeed = {
  stage: string;
  startAge: number;
  years: number;
  publicTuition: number;
  privateTuition: number;
  overseasTuition: number;
  extraFee: number;
  careFee: number;
  source: string;
};

// 學制對照：用來由「孩子現在幾歲」反推所在學段與剩餘年數。
// 幼兒園以前（0-2 歲）視為「學齡前」，不列入教育金學段但仍有撫養費。
export const EDU_COST_DEFAULTS: readonly EduCostSeed[] = [
  {
    stage: "幼兒園", startAge: 3, years: 3,
    publicTuition: 12000, privateTuition: 180000, overseasTuition: 0,
    extraFee: 10000, careFee: 190000,
    source: "教育部 0-6 歲國家一起養（公幼月繳上限 1,000）；私幼月費市場中位推估；補習才藝＝教育部統計處 106 學年幼兒園教育消費支出調查",
  },
  {
    stage: "國小", startAge: 6, years: 6,
    publicTuition: 12000, privateTuition: 115000, overseasTuition: 1200000,
    extraFee: 60000, careFee: 190000,
    source: "教育部 114 學年公私立國中小學雜費及代收代辦費收取基準；教育部統計處 108 學年國小教育消費支出調查",
  },
  {
    stage: "國中", startAge: 12, years: 3,
    publicTuition: 13000, privateTuition: 114000, overseasTuition: 1200000,
    extraFee: 45000, careFee: 190000,
    source: "教育部 114 學年公私立國中小收費基準；教育部統計處 109 學年國中教育消費支出調查",
  },
  {
    stage: "高中職", startAge: 15, years: 3,
    publicTuition: 20000, privateTuition: 54000, overseasTuition: 1400000,
    extraFee: 21000, careFee: 200000,
    source: "112 學年第 2 學期起公私立高中職學費全免（雜費/代收代辦/餐費自付）；教育部 114 學年高級中等學校學費收費數額表；教育部統計處 107 學年高中職教育消費支出調查",
  },
  {
    stage: "大學", startAge: 18, years: 4,
    publicTuition: 55000, privateTuition: 65000, overseasTuition: 1500000,
    extraFee: 15000, careFee: 260000,
    source: "教育部 114 學年大專學雜費收費基準（公立約 5.1-7.2 萬、私立約 9.4-11 萬，私立已扣 3.5 萬補助）；海外＝美英日澳留學年支出中位",
  },
  {
    stage: "研究所", startAge: 22, years: 2,
    publicTuition: 60000, privateTuition: 100000, overseasTuition: 1500000,
    extraFee: 0, careFee: 260000,
    source: "114 學年公私立碩士班學雜費（3.5 萬補助不適用研究所）",
  },
  {
    stage: "博士班", startAge: 24, years: 4,
    publicTuition: 58000, privateTuition: 100000, overseasTuition: 1500000,
    extraFee: 0, careFee: 260000,
    source: "114 學年公私立博士班學雜費",
  },
];

// 期望最高學歷 → 供給到哪一個學段為止（協會問卷 G14）
export const EDU_TOP_LEVELS = ["高中職", "大學", "研究所", "博士班"] as const;

export const EDU_SCHOOL_TYPES = ["公立", "私立", "海外"] as const;
