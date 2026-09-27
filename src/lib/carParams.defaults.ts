// 購車模組的程式端預設（seed 與 fallback）。純資料、無 import——public/lantu-app.html 有一份逐字對拍（carParams.test.ts）。
//
// ⚠️⚠️ 車價與係數是「起手值」，不是查證過的官方數字：2026/09 依市場行情的大約數抓的。Ray 之後會把品牌×車型×動力
//    的真數字餵進 car_price_params（同鍵 upsert），這一份只在 DB 沒那一列時墊底。卡上一律標「起手值，跟客戶對過再用」。
// 牌照稅／燃料費級距是現行法定表（每年、自用小客車）；電動車免徵有落日（EV_TAX_FREE_UNTIL），過了改依馬力課稅。
// 單位：車價 萬／台；稅 元／年。
export const CAR_PRICE_BASIS = "2026-09";
export const CAR_ORIGINS = ["國產", "進口", "豪華"] as const;
export type CarOrigin = (typeof CAR_ORIGINS)[number];
export const CAR_SEGMENTS = ["轎車", "休旅SUV", "七人座MPV", "商用/貨車", "跑車"] as const;
export type CarSegment = (typeof CAR_SEGMENTS)[number];
export const CAR_POWERS = ["汽油", "柴油", "油電", "純電"] as const;
export type CarPower = (typeof CAR_POWERS)[number];
export const CAR_CONDITIONS = ["新車", "中古"] as const;
export type CarCondition = (typeof CAR_CONDITIONS)[number];
export const CAR_MODES = ["全款", "貸款", "殘值型", "租賃"] as const;
export type CarMode = (typeof CAR_MODES)[number];

/** 品牌起手表（Ray 2026/09/27：汽車品牌落差很大，品牌是一級維度）。
 *  priceFactor＝相對「等級層均價」的倍率；retention＝保值係數（乘在車齡保值曲線上，日系高、歐系低）；maint＝保養係數。 */
export type CarBrand = { origin: CarOrigin; priceFactor: number; retention: number; maint: number };
export const CAR_BRANDS_DEFAULT: Record<string, CarBrand> = {
  "Toyota":        { origin: "國產", priceFactor: 1.00, retention: 1.10, maint: 0.9 },
  "Honda":         { origin: "國產", priceFactor: 1.00, retention: 1.05, maint: 0.9 },
  "Nissan":        { origin: "國產", priceFactor: 0.95, retention: 0.95, maint: 0.9 },
  "Mazda":         { origin: "國產", priceFactor: 1.05, retention: 1.00, maint: 1.0 },
  "Mitsubishi":    { origin: "國產", priceFactor: 0.90, retention: 0.90, maint: 0.9 },
  "Hyundai":       { origin: "國產", priceFactor: 0.95, retention: 0.90, maint: 0.9 },
  "Ford":          { origin: "國產", priceFactor: 0.95, retention: 0.85, maint: 1.0 },
  "Luxgen":        { origin: "國產", priceFactor: 0.85, retention: 0.70, maint: 1.0 },
  "MG":            { origin: "國產", priceFactor: 0.85, retention: 0.80, maint: 0.9 },
  "Suzuki":        { origin: "進口", priceFactor: 0.75, retention: 1.00, maint: 0.9 },
  "Subaru":        { origin: "進口", priceFactor: 1.00, retention: 0.95, maint: 1.1 },
  "Kia":           { origin: "進口", priceFactor: 0.85, retention: 0.85, maint: 1.0 },
  "Volkswagen":    { origin: "進口", priceFactor: 1.00, retention: 0.80, maint: 1.2 },
  "Skoda":         { origin: "進口", priceFactor: 0.95, retention: 0.80, maint: 1.2 },
  "Peugeot":       { origin: "進口", priceFactor: 0.95, retention: 0.70, maint: 1.2 },
  "Tesla":         { origin: "進口", priceFactor: 1.35, retention: 0.80, maint: 0.7 },
  "BYD":           { origin: "進口", priceFactor: 0.85, retention: 0.75, maint: 0.7 },
  "Lexus":         { origin: "豪華", priceFactor: 0.85, retention: 1.15, maint: 1.0 },
  "Mercedes-Benz": { origin: "豪華", priceFactor: 1.05, retention: 0.85, maint: 1.4 },
  "BMW":           { origin: "豪華", priceFactor: 1.00, retention: 0.85, maint: 1.4 },
  "Audi":          { origin: "豪華", priceFactor: 0.95, retention: 0.75, maint: 1.4 },
  "Volvo":         { origin: "豪華", priceFactor: 0.90, retention: 0.80, maint: 1.3 },
  "Porsche":       { origin: "豪華", priceFactor: 1.80, retention: 0.95, maint: 1.8 },
  "Mini":          { origin: "豪華", priceFactor: 0.65, retention: 0.85, maint: 1.3 },
};

/** 等級層起手值：新車均價（萬／台），依 車型；動力由倍率推出。 */
export const CAR_ORIGIN_BASE: Record<CarOrigin, Record<CarSegment, number>> = {
  "國產": { "轎車": 85,  "休旅SUV": 105, "七人座MPV": 115, "商用/貨車": 75,  "跑車": 0 },
  "進口": { "轎車": 140, "休旅SUV": 165, "七人座MPV": 180, "商用/貨車": 120, "跑車": 250 },
  "豪華": { "轎車": 260, "休旅SUV": 300, "七人座MPV": 330, "商用/貨車": 0,   "跑車": 480 },
};
export const CAR_POWER_RATIO: Record<CarPower, number> = { "汽油": 1.0, "柴油": 1.08, "油電": 1.15, "純電": 1.3 };

/** 車齡保值曲線（相對新車價）：[車齡上限（含）, 保值率]；最後一段用 Infinity。品牌 retention 係數乘上去、封頂 0.95。 */
export const CAR_RETENTION_DEFAULT: [number, number][] = [[1, 0.8], [2, 0.72], [3, 0.64], [5, 0.52], [8, 0.38], [12, 0.25], [Infinity, 0.15]];
/** 舊車折價（換車時賣給車商／折抵）相對市場現值再打的折扣 % */
export const CAR_TRADE_LOSS_DEFAULT = 10;

/** 牌照稅（元／年）[排氣量上限 cc, 自用, 營業用]；燃料費 [cc 上限, 汽油, 柴油]。與工具箱那一份同源。 */
export const CAR_LICENSE = [[500, 1620, 900], [600, 2160, 1260], [1200, 4320, 2160], [1800, 7120, 3060], [2400, 11230, 6480], [3000, 15210, 9900], [4200, 28220, 16380], [5400, 46170, 24300], [6600, 69690, 33660], [7800, 117000, 44460], [Infinity, 151200, 56700]];
export const CAR_FUEL = [[500, 2160, 1296], [600, 2880, 1728], [1200, 4320, 2592], [1800, 4800, 2880], [2400, 6180, 3708], [3000, 7200, 4320], [3600, 8640, 5184], [4200, 9810, 5886], [4800, 11220, 6732], [5400, 12180, 7380], [6000, 13080, 7848], [6600, 13950, 8370], [7200, 14910, 8946], [Infinity, 15720, 9432]];
/** 電動車牌照稅（元／年）[馬力上限 HP, 稅額]——免徵落日之後用；燃料費電動車不計。 */
export const CAR_EV_LICENSE = [[38.6, 1620], [56.8, 2160], [83.3, 4320], [113.6, 7120], [151.5, 11230], [189.4, 15210], [265.1, 28220], [340.8, 46170], [416.5, 69690], [492.2, 117000], [Infinity, 151200]];

/** 持有成本推算的起手參數（後台 car_params 可改）。 */
export type CarCostParams = {
  evTaxFreeUntil: number;   // 電動車免徵牌照稅／燃料費到哪一年（含）；落日後依馬力課牌照稅
  fuelPrice: number;        // 元／公升（汽油）
  dieselPrice: number;      // 元／公升（柴油）
  elecPrice: number;        // 元／度（家用充電）
  kmPerYear: number;        // 年里程起手
  kmPerL: Record<CarSegment, number>;   // 汽油車油耗 km/L 起手，依車型
  dieselKmRatio: number;    // 柴油油耗倍率
  hybridKmRatio: number;    // 油電油耗倍率
  evKwhPerKm: number;       // 純電 度／公里
  insBase: number;          // 強制險＋第三人責任（元／年）
  bodyRate: [number, number][];   // 車體險：[車齡上限, 車價 %／年]；超過最後一段＝不保車體
  maintBase: Record<CarOrigin, number>;   // 保養／維修起手（元／年），依等級
  maintAgeRatio: [number, number][];      // 保養隨車齡：[車齡上限, 倍率]
  parkingMonthly: number;   // 停車位月租起手（沒有自有車位時）
  misc: number;             // 驗車／ETC／輪胎／雜支（元／年）
  noCarPerKm: number;       // 不買車的對照：共享／計程車／大眾運輸 平均 元／公里
  rule: { downPct: number; loanYearsMax: number; monthlyPct: number };   // 20-4-10 負擔性規則
};
export const CAR_COST_DEFAULT: CarCostParams = {
  evTaxFreeUntil: 2030, fuelPrice: 31, dieselPrice: 29, elecPrice: 6, kmPerYear: 12000,
  kmPerL: { "轎車": 13, "休旅SUV": 11, "七人座MPV": 10, "商用/貨車": 9, "跑車": 8 },
  dieselKmRatio: 1.25, hybridKmRatio: 1.7, evKwhPerKm: 0.17,
  insBase: 6500, bodyRate: [[3, 1.5], [6, 1.0], [Infinity, 0]],
  maintBase: { "國產": 15000, "進口": 25000, "豪華": 45000 }, maintAgeRatio: [[3, 0.6], [6, 1.0], [Infinity, 1.5]],
  parkingMonthly: 3000, misc: 8000, noCarPerKm: 15,
  rule: { downPct: 20, loanYearsMax: 4, monthlyPct: 10 },
};

/** 四種取得方式的範本（Ray 2026/09/27：範本是預設，每一筆購車目標可覆寫）。比例都是「占車價 %」。 */
export type CarPayTemplate = {
  fee: number;         // 領牌雜費 %（規費、當年稅費按比例、代辦）
  loanRatio: number;   // 貸款成數起手 %（全款＝0）
  loanYears: number;   // 貸款年期起手
  loanRate: number;    // 利率起手 %
  balloon: number;     // 殘值型：期末尾款 %（車價）
  rentRate: number;    // 租賃：月租 %（車價／月），含稅險保養
  rentYears: number;   // 租賃：租期（年）
  buyout: number;      // 租賃：期末買斷價 %（車價）；0＝不買斷、歸還
};
export const CAR_PAY_DEFAULT: Record<CarMode, CarPayTemplate> = {
  "全款":   { fee: 1.5, loanRatio: 0,  loanYears: 0, loanRate: 0,   balloon: 0,  rentRate: 0,   rentYears: 0, buyout: 0 },
  "貸款":   { fee: 1.5, loanRatio: 70, loanYears: 5, loanRate: 3.5, balloon: 0,  rentRate: 0,   rentYears: 0, buyout: 0 },
  "殘值型": { fee: 1.5, loanRatio: 80, loanYears: 3, loanRate: 3.8, balloon: 40, rentRate: 0,   rentYears: 0, buyout: 0 },
  "租賃":   { fee: 0,   loanRatio: 0,  loanYears: 0, loanRate: 0,   balloon: 0,  rentRate: 1.6, rentYears: 3, buyout: 45 },
};

/** 換車週期起手（年） */
export const CAR_CYCLE_DEFAULT = 7;
