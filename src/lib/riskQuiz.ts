// 投資風險屬性測驗（KYC 12 題）的伺服器端鏡像。
//
// 為什麼要有這一份：真正的題庫活在 public/lantu-app.html 的 RISK_Q / RISK_TIERS 裡，
// 但 2026/09/01 起「教練可以邀請客戶自己填」——客戶端是 React 頁面，畫不到 iframe 裡的閉包，
// 而且分數一定要由**伺服器**算（客戶送上來的只是選項索引，不能信任他附的分數）。
//
// 同步靠 riskQuiz.drift.test.ts —— 逐字比對 html 裡的題幹、選項與配分。
// 任何人改題目卻沒同步這一份，測試當場變紅。跟 taiwan.ts / analysisModules.ts 同一套慣例。
//
// ⚠️⚠️ 題目的**索引就是主鍵**：作答存成 { "0": 3, "6": [1,2] }，用題目索引當 key。
//    調換順序 = 舊作答靜靜對到別題。要換題只能就地改內容，不能重排。

export type RiskOption = readonly [label: string, score: number];

export type RiskQuestion = {
  q: string;
  o: readonly RiskOption[];
  /** 複選題：計分取所選項中的最高分，所以複選不會膨脹總分 */
  multi?: boolean;
  hint?: string;
};

export const RISK_QUESTIONS: readonly RiskQuestion[] = [
  { q: "您目前的年齡層是？", o: [["70歲以上", 1], ["60–69歲", 2], ["50–59歲", 3], ["40–49歲", 4], ["39歲以下", 5]] },
  { q: "如果要做長期配置，您能撥出來的資金大約占整體資產多少？", hint: "問的是「能撥出來」的比例，不是現在就要投出去。", o: [["80%以上（幾乎是全部）", 1], ["約60–80%", 2], ["約40–60%", 3], ["約20–40%", 4], ["20%以下（僅一小部分）", 5]] },
  { q: "這一筆長期配置的資金，您希望它做到什麼？", o: [["保本，絕不能虧損", 1], ["略高於定存即可", 2], ["穩健累積，兼顧風險", 3], ["追求資產明顯成長", 4], ["積極追求高報酬", 5]] },
  { q: "這一筆資金，您預計可以多久不動用？", o: [["1年以內", 1], ["1–3年", 2], ["3–5年", 3], ["5–10年", 4], ["10年以上", 5]] },
  { q: "您目前的收入來源穩定度？", o: [["已無主動收入（退休/待業）", 1], ["不穩定、起伏大", 2], ["尚可，普通穩定", 3], ["穩定的薪資收入", 4], ["穩定且有多重來源", 5]] },
  { q: "未來3–5年您的收入預期？", o: [["可能明顯減少", 1], ["可能略減", 2], ["大致持平", 3], ["可能成長", 4], ["可望大幅成長", 5]] },
  { q: "您對投資理財商品的了解與經驗？（可複選）", multi: true, hint: "請勾選所有接觸過的類型；計分以最高者為準。", o: [["完全沒有", 1], ["僅定存/儲蓄險", 2], ["買過基金/ETF", 3], ["熟悉股票/債券操作", 4], ["熟悉衍生性/槓桿商品", 5]] },
  { q: "您實際投資過（或目前持有）的商品有哪些？（可複選）", multi: true, hint: "請勾選所有持有過的商品；計分以風險最高者為準。", o: [["定存、儲蓄險", 1], ["債券、貨幣型基金", 2], ["平衡型基金、績優股", 3], ["個股、股票型基金", 4], ["期權、外匯、加密貨幣等", 5]] },
  { q: "假設您持有的部位一年內下跌 20%，您會？", hint: "假設情境，不代表您現在持有任何部位。", o: [["立刻全部贖回、不再投資", 1], ["贖回大部分", 2], ["觀望、暫不動作", 3], ["續抱等待回升", 4], ["視為機會、加碼買進", 5]] },
  { q: "這一筆資金，您能接受的最大本金虧損幅度是？", o: [["不能接受任何虧損", 1], ["5%以內", 2], ["約10–15%", 3], ["約20–30%", 4], ["30%以上也可承受", 5]] },
  { q: "下列報酬/風險組合，您偏好哪一種？", o: [["報酬2%，幾乎不虧", 1], ["報酬4%，最差-5%", 2], ["報酬6%，最差-15%", 3], ["報酬9%，最差-25%", 4], ["報酬12%，最差-40%", 5]] },
  { q: "您目前的緊急預備金（可隨時動用的現金）大約可以支應幾個月的生活支出？", hint: "系統參數的「緊急預備金(月)」預設是 6 個月，可作為對照。", o: [["沒有準備", 1], ["不到 3 個月", 2], ["3–6 個月", 3], ["6–12 個月", 4], ["12 個月以上", 5]] },
];

export type RiskTier = {
  min: number;
  max: number;
  name: string;
  en: string;
  /** 建議投資報酬率 % */
  rr: number;
  /** 建議報酬波動度 % */
  std: number;
  desc: string;
  color: string;
  alloc: string;
};

export const RISK_TIERS: readonly RiskTier[] = [
  { min: 12, max: 23, name: "保守型", en: "Conservative", rr: 3, std: 6, desc: "以保本與穩定為優先，可承受的波動很低。", color: "#6f8f74", alloc: "現金/定存與債券為主（約 70–85%），少量配置平衡型或高評級收益商品。" },
  { min: 24, max: 35, name: "穩健型", en: "Moderate", rr: 5, std: 10, desc: "願意承擔適度風險換取中等成長，重視風險與報酬的平衡。", color: "#7f97ac", alloc: "股債均衡（股 40–55%、債與現金 45–60%），核心配置搭配部分成長型標的。" },
  { min: 36, max: 47, name: "積極型", en: "Aggressive", rr: 6.5, std: 14, desc: "以資產成長為主要目標，能承受明顯的短期波動。", color: "#c99a5b", alloc: "股票/股票型基金為主（約 60–75%），搭配少量債券與現金作為緩衝。" },
  { min: 48, max: 60, name: "進取型", en: "Growth", rr: 8, std: 18, desc: "追求長期最大化報酬，可承受大幅波動與較高風險。", color: "#b07d3d", alloc: "高成長股票、產業/區域型與另類資產為主（80%以上），現金部位極低。" },
];

/** 作答：單選＝選項索引；複選＝索引陣列。key 是題目索引的字串。 */
export type RiskAnswers = Record<string, number | number[]>;

/** 某一題的作答攤成陣列（單選也回長度 1 的陣列）。 */
export function answerList(ans: RiskAnswers | null | undefined, qi: number): number[] {
  const v = ans ? ans[String(qi)] ?? ans[qi as unknown as string] : null;
  if (v == null) return [];
  return Array.isArray(v) ? v.slice() : [v];
}

/** 一題的得分＝所選項中的最高分（所以複選不會膨脹總分，12 題滿分仍是 60）。 */
export function questionScore(qi: number, picked: number[]): number {
  const q = RISK_QUESTIONS[qi];
  if (!q) return 0;
  let mx = 0;
  for (const oi of picked) {
    const o = q.o[oi];
    if (o && o[1] > mx) mx = o[1];
  }
  return mx;
}

export type RiskResult = { score: number; answered: number; total: number; unanswered: number[] };

export function scoreAnswers(ans: RiskAnswers | null | undefined): RiskResult {
  let score = 0, answered = 0;
  const unanswered: number[] = [];
  for (let i = 0; i < RISK_QUESTIONS.length; i++) {
    const picked = answerList(ans, i);
    if (picked.length) { score += questionScore(i, picked); answered++; }
    else unanswered.push(i);
  }
  return { score, answered, total: RISK_QUESTIONS.length, unanswered };
}

/** 全部答完才有等級（跟 html 的 riskProfile 同一條規則）。 */
export function tierOf(score: number): RiskTier {
  let t = RISK_TIERS[0];
  for (const x of RISK_TIERS) if (score >= x.min) t = x;
  return t;
}

/**
 * 把客戶端送上來的東西正規化成可信任的作答。
 *
 * ⚠️ 一律由伺服器重算分數——前端送什麼分數都不採信。
 * ⚠️ 超出題數或超出選項範圍的索引直接丟掉，不要讓它變成 NaN 混進總分。
 */
export function normalizeAnswers(raw: unknown): RiskAnswers {
  const out: RiskAnswers = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (let qi = 0; qi < RISK_QUESTIONS.length; qi++) {
    const v = src[String(qi)];
    if (v == null) continue;
    const q = RISK_QUESTIONS[qi];
    const ok = (x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < q.o.length;
    if (q.multi) {
      const list = Array.isArray(v) ? v.filter(ok).map(Number) : ok(v) ? [Number(v)] : [];
      if (list.length) out[String(qi)] = Array.from(new Set(list)).sort((a, b) => a - b);
    } else {
      const one = Array.isArray(v) ? v[0] : v;
      if (ok(one)) out[String(qi)] = Number(one);
    }
  }
  return out;
}
