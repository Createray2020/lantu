// 購屋模組的程式端預設（seed 與 fallback）。純資料、無 import——public/lantu-app.html 有一份逐字對拍。
//
// ⚠️⚠️ 每坪均價是「起手值」，不是查證過的官方數字：2026/09 依公開行情（實價登錄／房仲月報）的縣市級
//    新成屋大約數抓的，預售≈新成屋×1.1、中古≈新成屋×0.72。Ray 之後會用爬蟲把行政區級的真數字餵進
//    house_price_params（同鍵 upsert），這一份只在 DB 沒那一列時墊底。卡上一律標「起手值，跟客戶對過再用」。
// 單位：萬／權狀坪（含公設）；車位：萬／位。
export const HOUSE_PRICE_BASIS = "2026-09";
export const HOUSE_CONDITIONS = ["預售", "新成屋", "中古"] as const;
export type HouseCondition = (typeof HOUSE_CONDITIONS)[number];

/** 縣市層起手值 [新成屋 萬/坪, 車位 萬/位]；預售與中古由倍率推出。 */
export const HOUSE_CITY_BASE: Record<string, [number, number]> = {
  "台北市": [95, 300], "新北市": [55, 200], "桃園市": [36, 150], "台中市": [42, 160], "台南市": [30, 120],
  "高雄市": [33, 130], "基隆市": [28, 100], "新竹市": [48, 160], "新竹縣": [42, 150], "苗栗縣": [24, 90],
  "彰化縣": [23, 90], "南投縣": [20, 80], "雲林縣": [19, 80], "嘉義市": [24, 90], "嘉義縣": [18, 80],
  "屏東縣": [19, 80], "宜蘭縣": [27, 100], "花蓮縣": [22, 90], "台東縣": [20, 80], "澎湖縣": [22, 80],
  "金門縣": [20, 80], "連江縣": [16, 60],
};
export const HOUSE_COND_RATIO: Record<HouseCondition, number> = { "預售": 1.1, "新成屋": 1.0, "中古": 0.72 };

/** 屋型倍率（相對電梯大樓） */
export const HOUSE_TYPES = ["電梯大樓", "華廈", "公寓", "透天"] as const;
export const HOUSE_TYPE_RATIO_DEFAULT: Record<string, number> = { "電梯大樓": 1.0, "華廈": 0.9, "公寓": 0.7, "透天": 1.15 };

/** 中古屋屋齡帶倍率（預售／新成屋不套）：[屋齡上限（含）, 倍率]；最後一段用 Infinity。 */
export const HOUSE_AGE_RATIO_DEFAULT: [number, number][] = [[5, 1.0], [15, 0.9], [30, 0.8], [Infinity, 0.7]];

/** 三種屋況的付款範本（Ray 2026/09/27：先用預設，每一筆購屋目標可覆寫，因為每個建案不一樣）。
 *  比例都是「占總價 %」；貸款＝總價 − 已付的期款（頭期／訂簽開／工程期款）。 */
export type HousePayTemplate = {
  deposit: number;        // 訂簽開（預售）／頭期以外一次付的比例 %；新成屋與中古＝0（頭期＝總價−貸款）
  progress: number;       // 工程期款合計 %（預售）；其他＝0
  progressYears: number;  // 工程期款分幾年（預售）；也是交屋延後年數
  agentFee: number;       // 仲介費 %（中古）
  closingFee: number;     // 代書／契稅／印花／規費等雜費 %（總價）
  decoRatio: number;      // 裝修起手值 %（總價）
  loanRatio: number;      // 貸款成數起手值 %
  loanYears: number;      // 貸款年期起手值
  graceYears: number;     // 寬限期（年）起手值：只繳息、本金不動；之後本金攤在剩餘年期
};
export const HOUSE_PAY_DEFAULT: Record<HouseCondition, HousePayTemplate> = {
  "預售":   { deposit: 15, progress: 10, progressYears: 3, agentFee: 0, closingFee: 1.0, decoRatio: 5, loanRatio: 75, loanYears: 30, graceYears: 3 },
  "新成屋": { deposit: 0,  progress: 0,  progressYears: 0, agentFee: 0, closingFee: 1.0, decoRatio: 5, loanRatio: 80, loanYears: 30, graceYears: 2 },
  "中古":   { deposit: 0,  progress: 0,  progressYears: 0, agentFee: 2, closingFee: 1.5, decoRatio: 10, loanRatio: 75, loanYears: 30, graceYears: 0 },
};

/** 問卷的「最低標準」起手：電梯大樓・3 房・30 坪・5–10 年 */
export const HOUSE_MIN_SPEC_DEFAULT = { type: "電梯大樓", rooms: 3, ping: 30, parking: 0, age: 10 };
