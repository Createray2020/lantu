// 由「孩子現在幾歲」推出所在學段與尚未完成的學段清單（純函式，兩份實作共用同一套規則）。
// lantu-app.html 有一份對照實作，由 eduPlan.drift.test.ts 對拍。
import { EDU_COST_DEFAULTS, type EduCostSeed } from "./eduCosts.defaults";

export type StageRow = {
  stage: string;
  startAge: number;
  years: number;          // 該學段總年數
  startIn: number;        // 幾年後開始（現在就在讀＝0）
  remainYears: number;    // 還要供給幾年
  current: boolean;       // 現在正在這個學段
};

export type StageDef = Pick<EduCostSeed, "stage" | "startAge" | "years">;

export const DEFAULT_STAGES: StageDef[] = EDU_COST_DEFAULTS.map((s) => ({
  stage: s.stage,
  startAge: s.startAge,
  years: s.years,
}));

const byAge = (list: StageDef[]) => [...list].sort((a, b) => a.startAge - b.startAge);

/**
 * 孩子目前所在學段。
 * 未滿入學年齡回 null（學齡前）；已超過最後一個學段也回 null（已完成學業）。
 */
export function stageOfAge(age: number, stages: StageDef[] = DEFAULT_STAGES): StageRow | null {
  if (!Number.isFinite(age) || age < 0) return null;
  for (const s of byAge(stages)) {
    const end = s.startAge + s.years;
    if (age >= s.startAge && age < end) {
      return {
        stage: s.stage,
        startAge: s.startAge,
        years: s.years,
        startIn: 0,
        remainYears: end - Math.floor(age),
        current: true,
      };
    }
  }
  return null;
}

/**
 * 從現在起「還沒念完」的所有學段，供給到 topLevel 為止（協會問卷 G14 的期望最高學歷）。
 *
 * - 已經念完的學段不出現（付過的錢不該再列進未來需求）。
 * - 正在讀的學段只算剩下的年數。
 * - payToAge（G14 的「支付學雜費至幾歲」）> 0 時，超過該歲數的年份不列入。
 * - topLevel 不在清單裡（例如後台改了學段名稱）時，一路供給到最後一段。
 *
 * public/lantu-app.html 的 eduRemainingStages 是同一套規則的第二份實作，
 * 由 eduPlan.drift.test.ts 對拍。
 */
export function remainingStages(
  age: number,
  topLevel: string,
  payToAge = 0,
  stages: StageDef[] = DEFAULT_STAGES,
): StageRow[] {
  const list = byAge(stages);
  const topIdx = list.findIndex((s) => s.stage === topLevel);
  const cut = topIdx >= 0 ? topIdx : list.length - 1;
  const a = Math.max(0, Number.isFinite(age) ? Math.floor(age) : 0);
  const cap = Number.isFinite(payToAge) ? Number(payToAge) : 0;
  const out: StageRow[] = [];
  for (let i = 0; i <= cut; i++) {
    const s = list[i];
    const end = s.startAge + s.years;
    if (a >= end) continue;                       // 已念完，付過的錢不再列進未來需求
    const from = Math.max(a, s.startAge);
    const to = cap > 0 ? Math.min(end, cap) : end; // 只供給到「支付學雜費至幾歲」
    const remainYears = to - from;
    if (remainYears <= 0) continue;
    out.push({
      stage: s.stage,
      startAge: s.startAge,
      years: s.years,
      startIn: Math.max(0, s.startAge - a),
      remainYears,
      current: a >= s.startAge,
    });
  }
  return out;
}

/** 該學段依「公立／私立／海外」取年學雜費。找不到學段回 0。 */
export function tuitionOf(
  stage: string,
  schoolType: string,
  table: readonly EduCostSeed[] = EDU_COST_DEFAULTS,
): number {
  const row = table.find((r) => r.stage === stage);
  if (!row) return 0;
  if (schoolType === "海外") return row.overseasTuition;
  if (schoolType === "私立") return row.privateTuition;
  return row.publicTuition;
}
