// 人生護照：能力分析「逆推」引擎（純計算＋型別，勿 import db/engine，client/server 共用）。
// 模型＝「輸入每月能存多少＋條件 → 直接算出能達成的結果」（1:1 比照關鍵理財網原版，見記憶 人生護照規格.md）。
// 五面向：購房 / 購車 / 退休 / 扶養 / 旅遊。左欄彙總「每月應存」＝五面向月存加總。

export const BASE_YEAR = 2026;

// ---------- 財務基本函式 ----------
const iMonthly = (annualPct: number) => annualPct / 100 / 12;

// 定期定額未來值（每月 monthly，共 months 期，年報酬 annualPct）。
export function fv(monthly: number, months: number, annualPct: number): number {
  const i = iMonthly(annualPct);
  const n = Math.max(0, Math.round(months));
  if (n <= 0) return 0;
  if (i === 0) return monthly * n;
  return monthly * ((Math.pow(1 + i, n) - 1) / i);
}

// 本息均攤每月還款（本金 principal，年利率 ratePct，攤還 months 期）。
export function pmt(principal: number, ratePct: number, months: number): number {
  const i = iMonthly(ratePct);
  const n = Math.max(0, Math.round(months));
  if (principal <= 0 || n <= 0) return 0;
  if (i === 0) return principal / n;
  return (principal * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
}

// 年金給付：一筆 corpus 於 months 期間、年報酬 annualPct 下，每月可領。
export function annuityPayout(corpus: number, months: number, annualPct: number): number {
  const i = iMonthly(annualPct);
  const n = Math.max(0, Math.round(months));
  if (corpus <= 0 || n <= 0) return 0;
  if (i === 0) return corpus / n;
  return (corpus * i) / (1 - Math.pow(1 + i, -n));
}

const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

// ---------- 型別（各面向輸入條件） ----------
export type HouseInputs = {
  buyYear: number; monthly: number; startYear: number; annualReturn: number;
  loanRatio: number; // 貸款成數（成，1~9）
  loanYears: number; graceMonths: number; rate: number; // 細節
};
export type CarInputs = {
  buyYear: number; monthly: number; startYear: number; annualReturn: number;
  loanRatio: number; loanYears: number; graceMonths: number; rate: number;
};
export type RetireInputs = {
  curAge: number; retireAge: number; monthly: number; startYear: number;
  salary: number; // 目前月薪（萬）
  workYears: number; annualReturn: number;
  lifeExp: number; contribRate: number; // 細節：預估壽命、勞退提繳率%
};
export type SupportInputs = {
  birthYear: number; monthly: number; startYear: number; annualReturn: number;
  raiseToAge: number; annualCost: number; tuitionGrowth: number; // 細節：養至幾歲、每年花費(元)、學費上漲率%
};
export type TravelInputs = {
  travelYear: number; monthly: number; startYear: number; annualReturn: number;
};

export type PassportInputs = {
  house: HouseInputs; car: CarInputs; retire: RetireInputs;
  support: SupportInputs; travel: TravelInputs;
};

// ---------- 型別（各面向結果） ----------
export type LoanResult = {
  price: number; down: number; loan: number;
  graceMonths: number; graceMonthly: number; amortMonths: number; amortMonthly: number;
  monthly: number; targetYear: number;
};
export type RetireResult = {
  totalMonthly: number; presentMonthly: number;
  selfMonthly: number; laborPensionMonthly: number; laborInsMonthly: number;
  monthly: number; retireAge: number;
};
export type SupportResult = {
  kids: number; savedAtBirth: number; perChildCost: number; monthly: number; raiseToAge: number;
};
export type TravelResult = { fund: number; monthly: number; travelYear: number };

export type PassportResult = {
  house: LoanResult; car: LoanResult; retire: RetireResult;
  support: SupportResult; travel: TravelResult;
  totalMonthlyWan: number; // 每月應存（萬）＝五面向月存加總
};

// ---------- 預設輸入 ----------
export function emptyPassport(baseYear = BASE_YEAR): PassportInputs {
  return {
    house: { buyYear: baseYear + 10, monthly: 3, startYear: baseYear, annualReturn: 3, loanRatio: 7, loanYears: 20, graceMonths: 36, rate: 2 },
    car: { buyYear: baseYear + 5, monthly: 1, startYear: baseYear, annualReturn: 3, loanRatio: 7, loanYears: 5, graceMonths: 0, rate: 2 },
    retire: { curAge: 30, retireAge: 65, monthly: 0.5, startYear: baseYear, salary: 3, workYears: 35, annualReturn: 3, lifeExp: 85, contribRate: 6 },
    support: { birthYear: baseYear + 6, monthly: 1, startYear: baseYear, annualReturn: 3, raiseToAge: 22, annualCost: 150000, tuitionGrowth: 3 },
    travel: { travelYear: baseYear + 2, monthly: 1, startYear: baseYear, annualReturn: 3 },
  };
}

// 勞保投保薪資上限（簡化，2024 級距上限約 45,800）。
const LABOR_INS_CAP = 45800;

// ---------- 各面向計算 ----------
function loanAbility(inp: HouseInputs | CarInputs): LoanResult {
  const monthly = num(inp.monthly);
  const months = Math.max(0, (num(inp.buyYear) - num(inp.startYear)) * 12);
  const down = fv(monthly * 10000, months, num(inp.annualReturn));
  const ratio = Math.min(0.9, Math.max(0, num(inp.loanRatio) / 10)); // 成→比例
  const price = ratio >= 1 ? down : down / (1 - ratio);
  const loan = Math.max(0, price - down);
  const grace = Math.max(0, Math.round(num(inp.graceMonths)));
  const totalMonths = Math.max(1, num(inp.loanYears) * 12);
  const graceMonthly = loan * (num(inp.rate) / 100 / 12); // 寬限期純息
  const amortMonths = Math.max(0, totalMonths - grace);
  const amortMonthly = pmt(loan, num(inp.rate), amortMonths);
  return { price, down, loan, graceMonths: grace, graceMonthly, amortMonths, amortMonthly, monthly, targetYear: num(inp.buyYear) };
}

function retireAbility(inp: RetireInputs): RetireResult {
  const monthly = num(inp.monthly);
  const curAge = num(inp.curAge), retireAge = num(inp.retireAge), lifeExp = num(inp.lifeExp) || 85;
  const monthsToRetire = Math.max(0, (retireAge - curAge) * 12);
  const retireMonths = Math.max(1, (lifeExp - retireAge) * 12);
  const ret = num(inp.annualReturn);
  // 自行準備：月存 FV → 退休期間年金化。
  const selfCorpus = fv(monthly * 10000, monthsToRetire, ret);
  const selfMonthly = annuityPayout(selfCorpus, retireMonths, ret);
  // 企業提撥（勞退新制）：月薪×提繳率 累積 → 退休期間年金化。
  const salary = num(inp.salary) * 10000;
  const laborPensionCorpus = fv(salary * (num(inp.contribRate) / 100), monthsToRetire, ret);
  const laborPensionMonthly = annuityPayout(laborPensionCorpus, retireMonths, ret);
  // 社會保險（勞保老年年金）：平均月投保薪資 × 年資 × 1.55%。
  const insSalary = Math.min(salary, LABOR_INS_CAP);
  const laborInsMonthly = insSalary * num(inp.workYears) * 0.0155;
  const totalMonthly = selfMonthly + laborPensionMonthly + laborInsMonthly;
  // 現值（以通膨 1.5% 折現至今）。
  const yearsToRetire = Math.max(0, retireAge - curAge);
  const presentMonthly = totalMonthly / Math.pow(1 + 0.015, yearsToRetire);
  return { totalMonthly, presentMonthly, selfMonthly, laborPensionMonthly, laborInsMonthly, monthly, retireAge };
}

function supportAbility(inp: SupportInputs): SupportResult {
  const monthly = num(inp.monthly);
  const monthsToBirth = Math.max(0, (num(inp.birthYear) - num(inp.startYear)) * 12);
  const savedAtBirth = fv(monthly * 10000, monthsToBirth, num(inp.annualReturn));
  // 每位小孩總花費：年花費逐年以學費上漲率成長，累加至扶養年齡。
  const years = Math.max(1, num(inp.raiseToAge));
  const g = num(inp.tuitionGrowth) / 100;
  const base = num(inp.annualCost);
  let perChildCost = 0;
  for (let y = 0; y < years; y++) perChildCost += base * Math.pow(1 + g, y);
  const kids = perChildCost > 0 ? savedAtBirth / perChildCost : 0;
  return { kids, savedAtBirth, perChildCost, monthly, raiseToAge: num(inp.raiseToAge) };
}

function travelAbility(inp: TravelInputs): TravelResult {
  const monthly = num(inp.monthly);
  const months = Math.max(0, (num(inp.travelYear) - num(inp.startYear)) * 12);
  const fund = fv(monthly * 10000, months, num(inp.annualReturn));
  return { fund, monthly, travelYear: num(inp.travelYear) };
}

export function computePassport(p: PassportInputs): PassportResult {
  const house = loanAbility(p.house);
  const car = loanAbility(p.car);
  const retire = retireAbility(p.retire);
  const support = supportAbility(p.support);
  const travel = travelAbility(p.travel);
  const totalMonthlyWan =
    num(p.house.monthly) + num(p.car.monthly) + num(p.retire.monthly) +
    num(p.support.monthly) + num(p.travel.monthly);
  return { house, car, retire, support, travel, totalMonthlyWan };
}

export const FACES: { key: keyof PassportInputs; label: string; icon: string }[] = [
  { key: "house", label: "購房", icon: "🏠" },
  { key: "car", label: "購車", icon: "🚗" },
  { key: "retire", label: "退休", icon: "🌴" },
  { key: "support", label: "扶養", icon: "👨‍👩‍👧" },
  { key: "travel", label: "旅遊", icon: "✈️" },
];

// 顯示輔助
export const wan = (nt: number) => Math.round(nt / 10000); // 元→萬（整數）
export const ntfmt = (nt: number) => Math.round(nt || 0).toLocaleString("en-US");
