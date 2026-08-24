import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 調整動作清單 c.actions[]（區塊 1B，2026/08/24）。
 *
 * 動作經由 projection() 的**分離池**進試算：被動作指定的錢用該動作自己的 growth 滾，
 * 全域 rate 只管沒被指定的剩餘資產。最重要的一條斷言是
 * 「**沒有任何動作時，數字與改版前一位不差**」——分離池的實作必須在 acts 為空時
 * 完全退化成改版前的算式。
 *
 * 另外釘住三件容易走鐘的事：
 *   ① 一致性規則：所有流出走 pay*、所有流入走 get*
 *   ② 刪減支出／資產變現必須指到明細的某一列（不能自由填金額）
 *   ③ 動作 id 不撞號（批次新增時 uid() 會撞，見家庭成員那次）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
  w.app.dataTab = "plan";
});

function fresh() {
  const c = w.migrateCase(w.sampleCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.render();
  return c;
}
const pane = () => w.document.querySelector("#app").innerHTML as string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const last = () => w.app.cases[0].actions[w.app.cases[0].actions.length - 1] as any;

function addOf(cat: string) {
  w.addRow("actions");
  const a = last();
  w.setActionCat(w.app.cases[0].actions.length - 1, cat);
  return a;
}

describe("資料層", () => {
  it("actions 進了 CASE_ARRAYS，migrateCase 保得住", () => {
    const c = fresh();
    expect(Array.isArray(c.actions)).toBe(true);
    w.addRow("actions");
    expect(w.migrateCase(w.app.cases[0]).actions.length).toBe(1);
  });

  it("新增列帶齊欄位，且預設啟用", () => {
    fresh();
    w.addRow("actions");
    const a = last();
    ["id", "on", "cat", "name", "tool", "ref", "payFrom", "payTo", "payMonthly", "payLump",
     "getFrom", "getTo", "getMonthly", "getLump", "divYear", "divMode", "growth",
     "cover", "coverKind", "src", "startY", "note"].forEach((k) => {
      expect(a).toHaveProperty(k);
    });
    expect(a.on).toBe(true);
  });

  it("批次新增時 id 不撞號", () => {
    fresh();
    for (let i = 0; i < 12; i++) w.addRow("actions");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = w.app.cases[0].actions.map((a: any) => a.id);
    expect(new Set(ids).size).toBe(12);
  });
});

describe("七個類別各自的欄位", () => {
  it("流入走 get*、流出走 pay*，換類別後年期不會落空", () => {
    fresh();
    // 流入型
    ["income", "expense"].forEach((k) => {
      const a = addOf(k);
      expect(a.cat).toBe(k);
      expect(w.n(a.getFrom)).toBeGreaterThan(0);
      expect(w.n(a.getTo)).toBeGreaterThan(0);
    });
    // 流出型
    ["regular", "insure", "loan"].forEach((k) => {
      const a = addOf(k);
      expect(w.n(a.payFrom)).toBeGreaterThan(0);
      expect(w.n(a.payTo)).toBeGreaterThan(0);
    });
    // 單點型
    ["lump", "liquidate"].forEach((k) => {
      const a = addOf(k);
      expect(w.n(a.payFrom)).toBeGreaterThan(0);
    });
  });

  it("換類別會清掉指向的明細（原本指的那一列一定不再適用）", () => {
    fresh();
    const a = addOf("expense");
    a.ref = "expenses:0";
    w.setActionCat(0, "regular");
    expect(w.app.cases[0].actions[0].ref).toBe("");
  });

  it("每個類別都畫得出來、不丟錯", () => {
    fresh();
    ["income", "expense", "regular", "lump", "liquidate", "loan", "insure"].forEach((k) => addOf(k));
    w.render();
    expect(w.app.cases[0].actions.length).toBe(7);
    expect(pane()).toContain("調整動作清單");
  });
});

describe("必填提醒", () => {
  it("刪減支出／資產變現沒指到明細時會出現警示", () => {
    fresh();
    addOf("expense");
    w.render();
    expect(pane()).toContain("尚未指到明細的某一列");
  });

  it("資產變現一定提醒要填淨額（租金消失／貸款清償／交易稅費）", () => {
    fresh();
    addOf("liquidate");
    w.render();
    expect(pane()).toContain("淨額");
  });

  it("指到明細之後警示消失", () => {
    fresh();
    addOf("expense");
    w.setAction(0, "ref", "expenses:0");
    expect(pane()).not.toContain("尚未指到明細的某一列");
  });
});

describe("啟用開關", () => {
  it("toggleAction 切換 on，畫面標成停用", () => {
    fresh();
    addOf("regular");
    expect(w.app.cases[0].actions[0].on).toBe(true);
    w.toggleAction(0);
    expect(w.app.cases[0].actions[0].on).toBe(false);
    expect(pane()).toContain("actrow off");
    w.toggleAction(0);
    expect(w.app.cases[0].actions[0].on).toBe(true);
  });
});

describe("動作真的進試算（分離池）", () => {
  it("沒有任何動作時，數字與改版前一位不差", () => {
    const c = fresh();
    const gap0 = w.gapPV(c);
    w.addRow("actions");
    w.toggleAction(0); // 停用
    expect(w.gapPV(w.app.cases[0])).toBeCloseTo(gap0, 6);
  });

  it("加一筆定期定額，缺口下降；停用後回到原值", () => {
    const c = fresh();
    const gap0 = w.gapPV(c);
    const a = addOf("regular");
    a.payMonthly = 30000;
    a.growth = 6;
    w.render();
    const after = w.gapPV(w.app.cases[0]);
    expect(after).toBeLessThan(gap0);
    w.toggleAction(0);
    expect(w.gapPV(w.app.cases[0])).toBeCloseTo(gap0, 6);
  });

  it("增加工作收入與刪減支出都讓缺口下降", () => {
    ["income", "expense"].forEach((k) => {
      const c = fresh();
      const gap0 = w.gapPV(c);
      const a = addOf(k);
      a.getMonthly = 20000;
      w.render();
      expect(w.gapPV(w.app.cases[0])).toBeLessThan(gap0);
    });
  });

  it("分離池用動作自己的報酬率：growth 越高、缺口越小", () => {
    function gapAt(g: number) {
      fresh();
      const a = addOf("regular");
      a.payMonthly = 30000;
      a.growth = g;
      return w.gapPV(w.app.cases[0]);
    }
    expect(gapAt(8)).toBeLessThan(gapAt(2));
  });

  it("買保障是支出：缺口變大（保額的價值走保障缺口，不走現金流）", () => {
    const c = fresh();
    const gap0 = w.gapPV(c);
    const a = addOf("insure");
    a.payMonthly = 8000;
    a.cover = 10000000;
    w.render();
    expect(w.gapPV(w.app.cases[0])).toBeGreaterThan(gap0);
  });

  it("願景事件會被標記可否負擔，並找得出第一個做不到的", () => {
    const c = fresh();
    const p = w.projection(c);
    expect(Array.isArray(p.events)).toBe(true);
    expect(p.events.length).toBeGreaterThan(0);
    p.events.forEach((e: { age: number; ok: boolean; name: string }) => {
      expect(typeof e.ok).toBe("boolean");
      expect(typeof e.name).toBe("string");
    });
    // 事件依年齡排序，firstFail 是第一個 ok=false 的
    const ages = p.events.map((e: { age: number }) => e.age);
    expect(ages.slice().sort((x: number, y: number) => x - y)).toEqual(ages);
    const firstBad = p.events.filter((e: { ok: boolean }) => !e.ok)[0] || null;
    expect(p.firstFail).toEqual(firstBad);
  });
});

describe("資料源收斂：報告書／生涯模擬／前後對照都看得到動作", () => {
  it("scenario 的『規劃前』會把動作拿掉，前後對照才有差額", () => {
    fresh();
    const a = addOf("regular");
    a.payMonthly = 30000;
    a.growth = 6;
    const s = w.scenario(w.app.cases[0]);
    expect(s.hasActions).toBe(true);
    // ⚠️ 這條是重點：before 不可以等於含動作的 c，否則差額永遠是 0
    expect(s.before.gap).toBeGreaterThan(s.after.gap);
    expect(s.baseCase.actions.length).toBe(0);
  });

  it("沒有動作時 scenario 的行為與改版前一致", () => {
    const c = fresh();
    const s = w.scenario(c);
    expect(s.hasActions).toBe(false);
    expect(s.before.gap).toBeCloseTo(w.gapPV(c), 6);
  });

  it("baseCase 是深拷貝，不會就地清掉呼叫端的 actions", () => {
    fresh();
    addOf("regular");
    const b = w.baseCase(w.app.cases[0]);
    expect(b.actions.length).toBe(0);
    expect(w.app.cases[0].actions.length).toBe(1);
  });

  it("保障動作的保額會計入『已備』，缺口跟著變小", () => {
    const c = fresh();
    const who = c.members[0].name;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (cc: any, kind: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      w.coverageGaps(cc).filter((r: any) => r.member === who && r.kind === kind)[0];

    // 挑一個目前確實有缺口的險種來測（sampleCase 的壽險會被流動資產抵掉）

    const kinds: string[] = w.KINDS.filter((k: string) => (row(c, k)?.gap || 0) > 0);
    expect(kinds.length, "sampleCase 至少要有一個險種有缺口").toBeGreaterThan(0);
    const kind = kinds[0];
    const b = row(c, kind);

    const a = addOf("insure");
    a.cover = Math.round(b.gap / 2);
    a.coverKind = kind;
    a.member = who;
    const af = row(w.app.cases[0], kind);

    expect(af.have).toBeCloseTo(b.have + a.cover, 6);
    expect(af.gap).toBeCloseTo(b.gap - a.cover, 6);
  });

  it("停用的保障動作不算保額", () => {
    const c = fresh();
    const a = addOf("insure");
    a.cover = 5000000;
    a.coverKind = "壽險";
    a.member = c.members[0].name;
    const on = w.actionCover(w.app.cases[0], c.members[0].name, "壽險");
    expect(on).toBe(5000000);
    w.toggleAction(0);
    expect(w.actionCover(w.app.cases[0], c.members[0].name, "壽險")).toBe(0);
  });
});

describe("當下脈絡：不用跳頁就填得對", () => {
  it("可用資源條有四格：月結餘／現金水位／保障缺口／負債比", () => {
    fresh();
    addOf("regular");
    w.render();
    const h = pane();
    ["月結餘 可再投入", "現金水位 可動用", "保障缺口 未補", "負債比"].forEach((t) => {
      expect(h).toContain(t);
    });
  });

  it("刪減支出那列顯示該項目前金額與刪減後剩多少", () => {
    fresh();
    const a = addOf("expense");
    a.ref = "expenses:0";
    a.getMonthly = 3000;
    w.render();
    const h = pane();
    expect(h).toContain("此項目前每月");
    expect(h).toContain("刪減後每月剩");
  });

  it("刪減額超過該項金額時會擋", () => {
    fresh();
    const a = addOf("expense");
    a.ref = "expenses:0";
    a.getMonthly = 99999999;
    w.render();
    expect(pane()).toContain("刪減額超過該項金額");
  });

  it("定期定額那列列出客戶原有的儲蓄理財投入（避免重複填）", () => {
    const c = fresh();
    c.savings = [{ name: "定期定額 ETF", amount: 120000, period: "年" }];
    addOf("regular");
    w.render();
    const h = pane();
    expect(h).toContain("客戶原有的儲蓄理財投入");
    expect(h).toContain("只填<b>增加的部分</b>");
  });

  it("保障那列顯示該成員該險種還缺多少", () => {
    const c = fresh();
    const a = addOf("insure");
    a.coverKind = "壽險";
    a.member = c.members[0].name;
    w.render();
    expect(pane()).toMatch(/的「壽險」(還缺|已無缺口)/);
  });

  it("停用的動作不顯示脈絡（畫面不吵）", () => {
    fresh();
    addOf("expense");
    w.toggleAction(0);
    expect(pane()).not.toContain("此項目前每月");
  });
});

describe("連動：十字表與投資配置", () => {
  it("十字表疊加動作，但四張原始表一個字都沒被改", () => {
    const c = fresh();
    const expBefore = JSON.stringify(c.expenses);
    const a = addOf("expense");
    a.ref = "expenses:0";
    a.getMonthly = 5000;
    const x = w.crossTable(w.app.cases[0]);
    const after = w.crossTableAfter(w.app.cases[0]);
    expect(after).toBeTruthy();
    expect(after.expLive).toBeLessThan(x.expLive);
    expect(after.monthBal).toBeGreaterThan(x.monthBal);
    // ⚠️ 這條是重點：原始資料不可以被動到
    expect(JSON.stringify(w.app.cases[0].expenses)).toBe(expBefore);
  });

  it("沒有動作時 crossTableAfter 回 null（不顯示第二個數字）", () => {
    const c = fresh();
    expect(w.crossTableAfter(c)).toBe(null);
  });

  it("加薪讓十字表的工作收入變大", () => {
    const c = fresh();
    const x = w.crossTable(c);
    const a = addOf("income");
    a.getMonthly = 10000;
    const after = w.crossTableAfter(w.app.cases[0]);
    expect(after.incWork).toBeCloseTo(x.incWork + 120000, 6);
  });

  it("定期定額與單筆投入自動併進投資配置", () => {
    const c = fresh();
    const ownBefore = w.allocInvestOwn(c).length;
    const a = addOf("regular");
    a.payMonthly = 20000;
    a.growth = 6;
    a.name = "全球 ETF 月扣";
    const all = w.allocInvest(w.app.cases[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = all.filter((r: any) => r.fromAction)[0];
    expect(row).toBeTruthy();
    expect(row.yearly).toBe(240000);
    expect(row.ret).toBe(6);
    // 手填那張表不受影響
    expect(w.allocInvestOwn(w.app.cases[0]).length).toBe(ownBefore);
  });

  it("停用的動作不進配置", () => {
    fresh();
    const a = addOf("regular");
    a.payMonthly = 20000;
    w.toggleAction(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(w.allocInvest(w.app.cases[0]).filter((r: any) => r.fromAction).length).toBe(0);
  });
});
