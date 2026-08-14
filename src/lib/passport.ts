// 人生護照：純計算與型別（可同時被 client 精靈與 server action 使用，勿 import db/engine）。
// 五面向：購房 / 購車 / 退休 / 扶養 / 旅遊 → 各自「每月應存」＋合計。
// 這是客戶自助的友善估算；正式規劃仍以顧問端引擎為準。

export const PASSPORT_CONST = {
  preRetReturn: 5, // 退休前投資報酬 %（存錢期）
  postRetReturn: 4, // 退休後報酬 %
  inflation: 1.5, // 通膨 %
  lifeExp: 85, // 預估壽命
};

export type PassportInputs = {
  house: { price: number; loanRatio: number; years: number };
  car: { price: number; years: number };
  retire: { age: number; retireAge: number; monthLiving: number; prepared: number };
  support: { kids: number; annualPerKid: number; years: number; startIn: number };
  travel: { annualBudget: number; years: number };
};

export type PassportMonthly = {
  house: number;
  car: number;
  retire: number;
  support: number;
  travel: number;
  total: number;
  meta: { retireCorpus: number; retireGap: number; houseDown: number; supportTotal: number };
};

export function emptyPassport(age = 35): PassportInputs {
  return {
    house: { price: 0, loanRatio: 70, years: 5 },
    car: { price: 0, years: 3 },
    retire: { age, retireAge: 65, monthLiving: 0, prepared: 0 },
    support: { kids: 0, annualPerKid: 0, years: 4, startIn: 10 },
    travel: { annualBudget: 0, years: 20 },
  };
}

const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

// 目標金額 target，n 年後要備妥，期間年報酬 retPct → 每月應存（累積年金/sinking fund）。
function sink(target: number, years: number, retPct: number): number {
  const t = Math.max(0, target);
  const N = Math.round(years * 12);
  if (t <= 0) return 0;
  if (N <= 0) return t; // 已到期，需一次補足
  const i = retPct / 100 / 12;
  if (i <= 0) return t / N;
  return (t * i) / (Math.pow(1 + i, N) - 1);
}

export function computeMonthly(p: PassportInputs): PassportMonthly {
  const C = PASSPORT_CONST;

  const price = num(p.house.price);
  const houseDown = price * (1 - num(p.house.loanRatio) / 100);
  const house = sink(houseDown, num(p.house.years), C.preRetReturn);

  const car = sink(num(p.car.price), num(p.car.years), C.preRetReturn);

  // 退休：現值月生活費 → 退休年通膨後 → 退休期間年金現值(退休金總需求) → 扣已備 → 存錢期每月應存。
  const age = num(p.retire.age);
  const retireAge = num(p.retire.retireAge);
  const yrsToRetire = Math.max(0, retireAge - age);
  const retireYears = Math.max(0, C.lifeExp - retireAge);
  const monthFV = num(p.retire.monthLiving) * Math.pow(1 + C.inflation / 100, yrsToRetire);
  const annualFV = monthFV * 12;
  const rr = C.postRetReturn / 100;
  const g = C.inflation / 100;
  const retireCorpus =
    retireYears <= 0
      ? 0
      : Math.abs(rr - g) < 1e-6
        ? (annualFV * retireYears) / (1 + rr)
        : annualFV * ((1 - Math.pow((1 + g) / (1 + rr), retireYears)) / (rr - g));
  const retireGap = Math.max(0, retireCorpus - num(p.retire.prepared));
  const retire = sink(retireGap, yrsToRetire, C.preRetReturn);

  // 扶養：小孩數 × 每位每年花費 × 年數，於 startIn 年後備妥。
  const supportTotal = num(p.support.kids) * num(p.support.annualPerKid) * num(p.support.years);
  const support = sink(supportTotal, num(p.support.startIn), C.preRetReturn);

  // 旅遊：每年旅遊基金 → 攤成每月（持續性支出）。
  const travel = num(p.travel.annualBudget) / 12;

  const total = house + car + retire + support + travel;

  return {
    house,
    car,
    retire,
    support,
    travel,
    total,
    meta: { retireCorpus, retireGap, houseDown, supportTotal },
  };
}

export const FACES: { key: keyof PassportInputs; label: string; icon: string }[] = [
  { key: "house", label: "購房", icon: "🏠" },
  { key: "car", label: "購車", icon: "🚗" },
  { key: "retire", label: "退休", icon: "🌴" },
  { key: "support", label: "扶養", icon: "👨‍👩‍👧" },
  { key: "travel", label: "旅遊", icon: "✈️" },
];
