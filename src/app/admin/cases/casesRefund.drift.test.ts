import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 後台「已發放案件不給重算、只給沖回」的漂移測試。
 *
 * 為什麼驗原始碼而不驗畫面：分潤明細是收合的（`open === c.id` 才展開），
 * 而按鈕就長在展開後的那一段裡——SSR 沒有事件，渲染不出來。可是這幾個字
 * 正是最後一道防線：已發放的案件按下「重算分潤」會撞
 * `(case_id, payee_key) where status <> 'void'` 的唯一鍵，而在舊版是
 * 「void 先成功、insert 才炸」，按下去的人只看到一個 digest 錯誤，
 * 那批應付分潤已經消失了。
 *
 * 所以這裡釘的是三件事：
 *   1. 「重算分潤」被 hasPaidPayout() 擋著，已發放時換成「產生沖回」。
 *   2. 按下前有預覽（用的是與伺服器同一支 planReversals）。
 *   3. 沖回列不算進「全鏈合計 100%」的驗算——不然每一筆退費都會誤報未平衡。
 */

const R = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const BOARD = R("src/app/admin/cases/CasesBoard.tsx");
const PAGE = R("src/app/admin/cases/page.tsx");
const ACTIONS = R("src/app/admin/cases/actions.ts");

describe("CasesBoard：重算 ↔ 沖回", () => {
  it("「重算分潤」被 hasPaidPayout() 條件擋著", () => {
    expect(BOARD).toContain("hasPaidPayout(c.payouts)");
    // 條件式必須包住按鈕本身，不是只拿來改個文字顏色
    const at = BOARD.indexOf("hasPaidPayout(c.payouts)");
    const seg = BOARD.slice(at, at + 600);
    expect(seg).toContain("重算分潤");
    expect(seg).toContain("recalcCaseAction");
  });

  it("已發放時按鈕文案是「產生沖回」，未發放時維持「退費重算」", () => {
    expect(BOARD).toContain("產生沖回");
    expect(BOARD).toContain("退費重算");
    expect(BOARD).toMatch(/paid \? "產生沖回" : "退費重算"/);
  });

  it("按下前顯示會產生哪幾筆負數列、金額多少（用的是伺服器端同一支 planReversals）", () => {
    expect(BOARD).toContain('from "@/lib/comp/reversal"');
    expect(BOARD).toContain("planReversals(payouts, fee, delta)");
    expect(BOARD).toContain("按下「產生沖回」會寫入以下負數列");
    // 預覽是逐列列出的（受款人＋金額），不是只有一個總數
    expect(BOARD).toContain("preview.map(");
    expect(BOARD).toContain("l.payeeName");
    expect(BOARD).toContain("fmtMoney(l.amount)");
    // 只沖回本次新增的退費金額（refundAmount 是累計值）
    expect(BOARD).toContain("Math.min(n, fee)) - refundAmount");
  });

  it("沒有東西可沖回時按鈕按不下去", () => {
    expect(BOARD).toContain("(paid && !preview.length)");
  });

  it("驗算把沖回列排除掉——不然每一筆退費都會誤報「未達 100%」", () => {
    expect(BOARD).toContain("c.payouts.filter((p) => !p.reversal)");
    expect(PAGE).toContain("payouts.filter((p) => !p.reversal)");
    expect(PAGE).toContain("isReversalKey(p.payeeKey)");
  });
});

describe("動作層", () => {
  it("已發放時 recalcCaseAction 回明確錯誤，而不是安靜地回 ok", () => {
    expect(ACTIONS).toContain("if (!r.recalculated) throw new Error(\"has-paid-payouts\")");
    expect(ACTIONS).toContain("has-paid-payouts\": \"這筆案件的分潤已經發放");
  });
});
