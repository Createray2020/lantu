import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 雙實作對拍。
 *
 * src/lib/engine.ts 算的是「寫進 DB 的快照」（planSnapshot → plans.health_grade / net_worth），
 * public/lantu-app.html 算的是「使用者在 iframe 看到的數字」。兩份是同一套邏輯的兩個實作。
 *
 * 2026/08/18 的稽核發現這兩邊已經默默漂移：
 *   - health() 的信用分數正規化：engine 用 cs/100（700 分算成 7.0，safety 飆到 183），
 *     html 用 (cs-200)/600 clamp 0~1。隨機 2000 例 safety 100% 不一致、等級 1.9% 不一致，
 *     而且方向永遠是 DB 快照偏樂觀 → 該判「整裝期」的客戶，列表上顯示「啟程期」。
 *   - coverageGaps() 的壽險「已備」：html 會加上家庭可變現流動資產，engine 沒有
 *     （primaryMember() 整個函式都沒被移植）→ totalGap 差到 32 倍。
 *   - ratios()：html 已改成協會 25 項，engine 還停在舊的 11 項。
 *
 * 這組測試就是不讓它再發生：以正則比對關鍵公式字串 + 對同一份 sampleCase 斷言具體數字。
 * 兩邊任何一邊改了計算而沒同步，這裡就會紅。
 *
 * （src/lib/intent.test.ts 用同樣的手法守常數，是這個 repo 裡最早也最正確的做法。）
 */
describe("雙實作對拍：engine.ts ↔ lantu-app.html", () => {
  it("health()：信用分數正規化公式兩邊一致，且 credit 值域為 0~1", () => {
    // html 端的公式（改動時這裡要一起改，而且要確認 engine 也改了）
    expect(HTML).toContain("var credit=cs>=200?Math.min(1,Math.max(0,(cs-200)/600)):0");

    const c = E.sampleCase(); // profile.credit = 700
    const h = E.health(c);
    expect(h.raw.credit).toBeCloseTo((700 - 200) / 600, 6);
    expect(h.parts.信用).toBe(83);
    expect(h.safety).toBeLessThanOrEqual(100);
    expect(h.safety).toBeGreaterThanOrEqual(0);
  });

  it.each([
    [0, 0],
    [199, 0],
    [200, 0],
    [500, 0.5],
    [800, 1],
    [900, 1],
    [-100, 0],
  ])("信用 %i 分 → credit %f（永遠落在 0~1）", (score, expected) => {
    const c = E.sampleCase();
    c.credit.score = score;
    c.profile.credit = 0;
    expect(E.health(c).raw.credit).toBeCloseTo(expected, 6);
  });

  it("coverageGaps()：本人壽險的『已備』要納入家庭可變現流動資產", () => {
    // html 端多的那一行（engine.ts 曾經整段缺席）
    expect(HTML).toContain("if(k==='壽險'&&nd.member===(primaryMember(c)||{}).name)ex+=liquidMovable(c)");

    const c = E.sampleCase();
    const row = E.coverageGaps(c).find((r: { kind: string }) => r.kind === "壽險");
    // 保單壽險 3,000,000 + liquidMovable 11,480,000
    expect(row.have).toBe(3_000_000 + E.liquidMovable(c));
    expect(row.have).toBe(14_480_000);
  });

  it("coverageGaps()：非本人成員的壽險不加流動資產", () => {
    const c = E.sampleCase();
    c.needs.push({
      member: "王太太", funeral: 600000, protectYears: 5, estateTax: 0,
      room: 0, selfPay: 0, nursing: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0,
    });
    const row = E.coverageGaps(c).find(
      (r: { kind: string; member: string }) => r.kind === "壽險" && r.member === "王太太",
    );
    expect(row.have).toBe(0);
  });

  it("ratios()：兩邊都是協會 25 項體檢（分組＋理想值＋紅黃綠燈）", () => {
    const r = E.ratios(E.sampleCase());
    const names = Object.keys(r);
    expect(names.length).toBe(25);
    // 每一項都要有 group / ideal / status，不能退回舊的 {v,f,ok} 形狀
    for (const k of names) {
      expect(["收支流量", "資產負債"]).toContain(r[k].group);
      expect(typeof r[k].ideal).toBe("string");
      expect(["good", "warn", "bad", "na"]).toContain(r[k].status);
    }
    // 抽驗幾個只存在於新版的項目，確認不是舊的 11 項
    for (const k of ["所得穩定度", "支出收入比", "保費支出比", "償債壓力指數", "資產成長動力比"]) {
      expect(names).toContain(k);
      expect(HTML).toContain(`'${k}'`);
    }
    // 舊版的 11 項裡已被協會版取代的，不該再出現
    for (const k of ["年儲蓄率", "消費比率", "財務負擔率", "願景成就率"]) {
      expect(names).not.toContain(k);
    }
  });

  it("負債一律換匯（lBal），不可直接讀 l.balance", () => {
    // 兩邊的 lifeNeed 都要用 lBal，否則外幣房貸在「缺口」與「準備度」兩頁會差一個匯率
    expect(HTML).toContain("+ sum(c.liabilities,function(l){return lBal(l)}) + eduTotal(c)");

    const c = E.sampleCase();
    c.liabilities = [{ name: "美金房貸", currency: "美金", fxRate: 32, balance: 100000, rate: 2, pay: 500, months: 240, startAge: 38 }];
    const nd = c.needs[0];
    // 需求裡的負債部分＝ 100,000 × 32
    expect(E.lBal(c.liabilities[0])).toBe(3_200_000);
    expect(E.lifeNeed(c, nd)).toBeGreaterThanOrEqual(0);
  });

  it("剩餘本金用攤還公式，不是線性遞減", () => {
    expect(HTML).toContain("function lRemain(l,age,a0){");
    // 2% 的 1000 萬房貸、月繳 42,000，第 10 年的剩餘本金應明顯高於「餘額 − 月繳×12×10」
    const l = { balance: 10_000_000, fxRate: 1, rate: 2, pay: 42000, months: 300, startAge: 40 };
    const linear = 10_000_000 - 42000 * 12 * 10;
    const amortised = E.lRemain(l, 50, 40);
    expect(amortised).toBeGreaterThan(linear);
    expect(amortised).toBeLessThan(10_000_000);
  });

  it("財務階段 STAGE 的名稱與課題兩邊一致", () => {
    for (const g of ["D", "C", "B", "A"] as const) {
      expect(HTML).toContain(`${g}:{name:'${E.STAGE[g].name}',task:'${E.STAGE[g].task}'`);
    }
  });

  it("KYC 複選題：兩邊都把第 7、8 題標成 multi，且計分取最高分", () => {
    expect(E.RISK_Q[6].multi).toBe(true);
    expect(E.RISK_Q[7].multi).toBe(true);
    expect((HTML.match(/multi:true/g) || []).length).toBe(2);

    const c = E.sampleCase();
    c.riskQuiz = { ans: { 0: 1, 1: 2, 2: 2, 3: 2, 4: 1, 5: 2, 6: [2, 3], 7: 2, 8: 2, 9: 2, 10: 2, 11: 2 } };
    const r = E.riskScore(c);
    expect(r.answered).toBe(12);
    expect(r.unanswered).toEqual([]);
    // 第 7 題勾了索引 2(3分) 與 3(4分) → 取 4 分
    expect(r.score).toBe(2 + 3 + 3 + 3 + 2 + 3 + 4 + 3 + 3 + 3 + 3 + 3);
  });

  it("riskScore：越界索引不丟例外（舊版直接 TypeError）", () => {
    const c = E.sampleCase();
    c.riskQuiz = { ans: { 0: 99 } };
    expect(() => E.riskScore(c)).not.toThrow();
    expect(E.riskScore(c).score).toBe(0);
  });

  it("PURPOSES / TARGETS 只有一份真相（engine 由 intent.ts re-export）", async () => {
    const intent = await import("./intent");
    expect(E.PURPOSES).toBe(intent.PURPOSES);
    expect(E.TARGETS).toBe(intent.TARGETS);
    // 已廢止的舊值不該再出現
    expect(E.PURPOSES).not.toContain("想買車、買房，進行置產");
    expect(E.TARGETS).not.toContain("人生模擬");
    expect(E.TARGETS).toContain("婚姻規劃");
  });

  it("財務階段：判定條件／定義文案三份對照表一致（engine.ts ↔ lantu-app.html ↔ format.ts）", async () => {
    const fmt = await import("@/app/dashboard/format");
    for (const k of ["D", "C", "B", "A"] as const) {
      const st = E.STAGE[k];
      expect(st.gate, `STAGE.${k}.gate 未定義`).toBeTruthy();
      expect(st.desc, `STAGE.${k}.desc 未定義`).toBeTruthy();
      // html 端
      expect(HTML).toContain(st.gate);
      expect(HTML).toContain(st.desc);
      // format.ts（React 端顯示層）
      expect(fmt.STAGE_GATE[k]).toBe(st.gate);
      expect(fmt.STAGE_DESC[k]).toBe(st.desc);
      expect(fmt.STAGE_LABEL[k]).toBe(st.name);
      expect(fmt.STAGE_TASK[k]).toBe(st.task);
    }
    // 三項指標的算法說明
    expect(E.STAGE_METRICS).toHaveLength(3);
    E.STAGE_METRICS.forEach((m: [string, string], i: number) => {
      expect(HTML).toContain(m[1]);
      expect(fmt.STAGE_METRICS[i][0]).toBe(m[0]);
      expect(fmt.STAGE_METRICS[i][1]).toBe(m[1]);
    });
  });

  it("財務階段：判定條件文字要對得上 health() 實際的門檻值", () => {
    // 這裡守的是「說明別跟程式漂移」：grade 判定式改了，下面的字串就得跟著改。
    expect(HTML).toContain("var grade=(safety<60||balScore<1)?'D':(freedom<20?'C':(vision<60?'B':'A'))");
    expect(E.STAGE.D.gate).toContain("60");
    expect(E.STAGE.C.gate).toContain("20%");
    expect(E.STAGE.B.gate).toContain("60%");
  });
});
