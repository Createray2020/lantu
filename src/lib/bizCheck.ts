// 企業主十題自我檢核：題目、逐題導引與分級判定。
//
// 這是客戶自己「說出問題在哪裡」的工具，不是我們指出來的——
// 實務上這件事很難用言語達成，一張兩分鐘填完的表卻做得到。
//
// ⚠️ 純資料＋純函式，client/server 共用，勿 import db。
// ⚠️ public/lantu-app.html 另有一份同內容的常數（教練端的合規閘），
//    src/lib/bizModule.test.ts 會正則比對兩邊，改這裡務必同步改那裡。

export const GATE_Q = [
  "公司帳戶與我的個人帳戶完全分開，不交叉收付",
  "我每個月有固定的發薪日與固定金額",
  "公司到我個人的每一筆錢，都說得出是什麼名目",
  "付給個人的租金、顧問費等，都有辦理扣繳與申報",
  "我知道帳上「股東往來」目前的金額與方向",
  "我有一筆與公司完全無關的緊急預備金",
  "這筆預備金足夠支應家庭 6 個月以上的開銷",
  "我知道自己個人（不含公司）的淨值是多少",
  "我知道自己簽了多少金額的個人連帶保證",
  "如果公司明天停止營運，我的家庭仍有生活保障",
] as const;

/** 第 4 題（扣繳申報）＝一票否決：唯一有時效性的一題。 */
export const GATE_VETO_INDEX = 3;

/** 每題勾「否」代表什麼、後續重點是什麼。 */
export const GATE_GUIDE: { mean: string; next: string }[] = [
  { mean: "公私帳混同，最根本的問題", next: "先量化雙向流動金額 → 建立分離機制 → 五條通道各歸各位" },
  { mean: "沒有制度化的個人收入", next: "制度化發薪日 → 從稅負／勞健保／退休年資／貸款條件四個角度重算合理薪資" },
  { mean: "資金移動沒有定性習慣", next: "「先定性，再匯款」→ 五種名目的分辨 → 各自的配套" },
  { mean: "有立即的補稅風險", next: "盤點歷史問題 → 評估自行補正（稅捐稽徵法 §48-1）→ 儘速轉介會計師" },
  { mean: "對自己公司的財務狀況掌握不足", next: "調閱財報 → 判讀股東往來方向 → 建立年度結清機制" },
  { mean: "個人沒有任何緩衝", next: "雙層流動性設計 → 設立與公司無關的防火牆帳戶" },
  { mean: "緩衝存在但不足", next: "水位試算 → 自動化撥付機制" },
  { mean: "沒有真實的財務全貌", next: "製作整合式個人資產負債表 → 算出流動性淨值" },
  { mean: "低估了自身負債曝險", next: "逐筆盤點借款的保證條件 → 計算連帶保證覆蓋率" },
  { mean: "家庭風險裸露", next: "三層保障架構 → 壽險額度須覆蓋連帶保證 → 退場路徑討論" },
];

export type GateLevel = "green" | "amber" | "red" | "na";

export const GATE_LAMP: Record<GateLevel, { title: string; note: string }> = {
  green: {
    title: "基礎穩固",
    note: "公私界線清楚、家庭也有底線。接下來可以談的是優化與傳承：報酬結構、稅務效率、退場規劃。",
  },
  amber: {
    title: "結構有缺口",
    note: "這是最典型的狀況，不緊急但要處理。建議從「你個人（不含公司）的淨值是多少」開始——先做出一張真實的整合式個人資產負債表。",
  },
  red: {
    title: "基礎未穩",
    note: "先處理補稅風險與家庭底線，其餘暫緩。這個階段談投資或傳承，都是建立在不穩定的基礎上。",
  },
  na: { title: "尚未判定", note: "十題都回答完才會判定。" },
};

/**
 * 依「否」的數量分級：0～2 綠、3～5 黃、6 以上紅；
 * 第 4 題勾否＝一票否決（稅務問題會隨時間累積，通常三到五年後一次被翻出來）。
 */
export function gateLevelOf(answers: Record<number, "是" | "否">): {
  lv: GateLevel; no: number; answered: number; veto: boolean; noIndexes: number[];
} {
  const keys = Object.keys(answers).map(Number).filter((k) => answers[k] === "是" || answers[k] === "否");
  const noIndexes = keys.filter((k) => answers[k] === "否").sort((a, b) => a - b);
  const answered = keys.length;
  const veto = answers[GATE_VETO_INDEX] === "否";
  const lv: GateLevel =
    answered < GATE_Q.length ? "na" : veto || noIndexes.length >= 6 ? "red" : noIndexes.length >= 3 ? "amber" : "green";
  return { lv, no: noIndexes.length, answered, veto, noIndexes };
}

/**
 * 一次不要處理超過三個「否」——缺口講太多會癱瘓，不會行動。
 * 這是內容規則，不是 UI 偏好，所以寫在這裡而不是散在畫面上。
 */
export const MAX_GAPS_AT_ONCE = 3;

export function topGaps(noIndexes: number[]): { q: string; mean: string; next: string }[] {
  // 第 4 題有時效性，只要勾否就排第一
  const ordered = noIndexes.slice().sort((a, b) => {
    if (a === GATE_VETO_INDEX) return -1;
    if (b === GATE_VETO_INDEX) return 1;
    return a - b;
  });
  return ordered.slice(0, MAX_GAPS_AT_ONCE).map((i) => ({ q: GATE_Q[i], ...GATE_GUIDE[i] }));
}
