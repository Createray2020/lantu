// 已發放案件的退費：產生「負數沖回列」而不是重算（Ray 2026/08 拍板）。
//
// 為什麼不能重算：分潤已經發出去了。舊版把 pending/batched 標 void 再整批 insert 新列，
// 但 paid 的舊列刻意不動——而 comp_payouts 的 partial unique 是
// `(case_id, payee_key) where status <> 'void'`，paid 舊列與新的 pending 列
// (case_id, payee_key) 完全相同 → 必定衝突。而且 void 先執行成功、insert 才炸，
// 案件上那批 pending 就被永久標 void 而沒有新列補上，應付分潤憑空消失。
//
// 改成沖回之後：原本發了多少留著、退了多少另記一列，帳目是完整的軌跡，可稽核，
// 而且沖回列帶著不同的 payeeKey，唯一鍵天生撞不到。
//
// ⚠️ 這一支刻意不 import db／schema：後台的「產生沖回」預覽要在 client component
//    裡跑同一份計算（畫面看到的＝真的會寫進去的），把 db 拉進 client bundle 是不行的。

/** 沖回列的 payeeKey 後綴。原 key 是 `payeeId ?? kind`，沖回列一律再接這一段＋序號。 */
export const REVERSAL_KEY_SEP = ":refund:";

/** 沖回列在畫面與驗算上都要能被認出來（它不參與「全鏈合計 100%」的驗算）。 */
export function isReversalKey(payeeKey: string): boolean {
  return payeeKey.includes(REVERSAL_KEY_SEP);
}

export type PaidPayout = {
  payeeId: string | null;
  payeeKey: string;
  payeeName: string;
  kind: string;
  role: string | null;
  rankCode: string | null;
  amount: number;
  status: string;
};

export type ReversalLine = {
  payeeId: string | null;
  payeeKey: string;
  payeeName: string;
  kind: string;
  role: string | null;
  rankCode: string | null;
  /** 一律 <= 0。沖回列不帶百分比（見下方註解）。 */
  amount: number;
  trace: string[];
};

/**
 * 依退費金額按比例，為每一位「已發放」的受款人算一筆負數沖回列。
 *
 * @param payouts   該案件目前所有非 void 的分潤列（要含 status，本函式自己挑 paid 的）
 * @param fee       案件原始顧問費（分潤的計算基準；《業務制度辦法 V4.0》§2 的正式科目名詞）
 * @param delta     這一次「新增」的退費金額。refundCase 收到的是退費總額，
 *                  差額才是這次要沖回的部分——否則第二次調整退費金額會重複沖回。
 *
 * 幾個刻意的決定：
 * - **只沖 paid 列**。pending/batched 的錢還沒出去，全額退費時本來就不會進批（§22-1），
 *   不需要也不該用負數列去抵。
 * - **百分比欄位一律 0**。案件詳情頁的「驗算」是把所有列的 totalPct 加起來看是不是 100%，
 *   沖回列若帶負的百分比，驗算就會誤報「未達 100%」。錢的軌跡在 amount 上，不在 pct 上。
 * - **序號**取自現有的沖回列數，讓同一位受款人可以被沖回多次（分次退費）而不撞唯一鍵。
 */
export function planReversals(payouts: PaidPayout[], fee: number, delta: number): ReversalLine[] {
  if (!(fee > 0) || !(delta > 0)) return [];
  const ratio = Math.min(1, delta / fee);

  // 這個案件目前已經有幾筆沖回列（同一位受款人分次退費時要接續序號）。
  const seqOf = new Map<string, number>();
  for (const p of payouts) {
    if (!isReversalKey(p.payeeKey)) continue;
    const base = p.payeeKey.slice(0, p.payeeKey.indexOf(REVERSAL_KEY_SEP));
    seqOf.set(base, (seqOf.get(base) ?? 0) + 1);
  }

  const out: ReversalLine[] = [];
  for (const p of payouts) {
    if (p.status !== "paid") continue;
    // 已發放但金額是 0（例如全額退費後又被重算過的舊列）沒有東西可以沖回。
    const back = Math.round(p.amount * ratio);
    if (back <= 0) continue;
    const seq = (seqOf.get(p.payeeKey) ?? 0) + 1;
    seqOf.set(p.payeeKey, seq);
    out.push({
      payeeId: p.payeeId,
      payeeKey: `${p.payeeKey}${REVERSAL_KEY_SEP}${seq}`,
      payeeName: p.payeeName,
      kind: p.kind,
      role: p.role ? `${p.role}（退費沖回）` : "退費沖回",
      rankCode: p.rankCode,
      amount: -back,
      trace: [
        `退費沖回：本次退費 ${delta} 元 ÷ 顧問費 ${fee} 元 = ${(ratio * 100).toFixed(2)}%`,
        `原已發放 ${p.amount} 元 × ${(ratio * 100).toFixed(2)}% = 沖回 ${back} 元`,
      ],
    });
  }
  return out;
}

/** 案件是否已經有發出去的分潤——有的話就不能重算，只能沖回。 */
export function hasPaidPayout(payouts: { status: string }[]): boolean {
  return payouts.some((p) => p.status === "paid");
}
