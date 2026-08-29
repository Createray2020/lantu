import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 2026/08/29 Ray 拍板的四項引擎修正，兩份實作各釘一次。
 *
 *  A1 收支加總改成「只算現齡有效」——ratios / health 與 projection 同一個口徑。
 *  A2「模擬到幾歲」綁死「預估壽命」，params.horizonManual 才吃手動值。
 *  A3 沒有任何賺薪成員填退休年齡 → 退回 65 試算，且畫面上明說是假設。
 *  A4 起訖留空＝全期間有效（引擎），新的人身保費列預設帶「現齡 → 預估壽命」（UI）。
 *
 * 這四件事都會改變既有客戶的數字，所以每一條都要有測試釘住方向，
 * 免得下一個人「順手改回去」的時候沒有東西擋。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useSample(tab: string): any {
  const c = w.migrateCase(w.sampleCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.role = "coach";
  w.app.activeTab = "data";
  w.app.dataTab = tab;
  w.render();
  return c;
}

// ─────────────────────────────────────────────────────────────
describe("A1｜收支加總只算現齡有效（vs 表面總額）", () => {
  it("示範案現齡 40：每一列都在起訖內 → 現齡有效 ＝ 表面總額", () => {
    const c = E.sampleCase();
    const m = E.metrics(c);
    expect(m.incTotal).toBe(1_900_000);
    expect(m.incTotal).toBe(m.incTotalRaw);
    expect(m.expTotal).toBe(m.expTotalRaw);
  });

  it("⚠️ 現齡 70（收入列 40–65／40–60 都已結束）：incTotal 歸零，表面總額仍是 190 萬", () => {
    const c = E.sampleCase();
    c.profile.age = 70;
    const m = E.metrics(c);
    expect(m.incTotalRaw).toBe(1_900_000);
    expect(m.incTotal).toBe(0);
    // 這正是「同一份資料兩套口徑」的證據：projection 第 0 年早就是 0
    expect(m.proj.rows[0].work).toBe(0);
    expect(m.proj.rows[0].income).toBe(m.incTotal + E.assetPassive(c));
  });

  it("⚠️ 改版前判 C（所得穩定度 100%、名目儲蓄率 35%），改版後判 D", () => {
    const c = E.sampleCase();
    c.profile.age = 70;
    const h = E.health(c);
    expect(h.grade).toBe("D");
    const r = E.ratios(c);
    // 分子分母同口徑：收入全部結束 → 所得穩定度不可能還是 100%。
    // 而且分母是 0，硬給一個百分比只會更誤導 → 顯示「—」並熄燈。
    expect(r["所得穩定度"].v).toBe("—（現齡沒有有效收入）");
    expect(r["所得穩定度"].status).toBe("na");
    expect(r["名目儲蓄率"].v).toBe("—（現齡沒有有效收入）");
  });

  it("ratios 的分子與 crossTable 的分項都跟著同一個口徑（不會出現 >100% 的比率）", () => {
    const c = E.sampleCase();
    c.profile.age = 70;
    const ct = E.crossTable(c);
    expect(ct.incWork).toBe(0);
    expect(ct.incWork + ct.incFin + ct.incOther).toBe(ct.incTotal);
    // 支出列是 40–85／40–70，現齡 70 時「孝親費 40–70」還在、其餘也還在
    expect(ct.expLive + ct.expTax + ct.expIns + ct.expSupport + ct.expOther + ct.expLoan)
      .toBeCloseTo(ct.expTotal, 6);
  });

  it("支出列到期後就不再計入 expTotal（孝親費 40–70，現齡 71）", () => {
    const c = E.sampleCase();
    c.profile.age = 71;
    const m = E.metrics(c);
    expect(m.expTotalRaw - m.expTotal).toBe(240_000); // 孝親費
  });

  // A1 打開了兩個「除以零」的新破口——舊版 incTotal/expTotal 幾乎不可能是 0，現在會。
  it("⚠️ 沒有任何有效支出時，財務自由度不可以讀成 100%（示範案張文山原本因此 D→A）", () => {
    const c = E.sampleCase();
    c.profile.age = 29;               // 每一列都從 40 歲起算 → 現齡沒有任何有效收支
    c.liabilities = [];
    const m = E.metrics(c);
    expect(m.expTotal).toBe(0);
    expect(m.incFinancial).toBeGreaterThan(0);
    const h = E.health(c);
    expect(h.freedom).toBe(0);        // 不是 100
    expect(h.grade).not.toBe("A");
    expect(E.ratios(c)["財務自由度"].v).toBe("—（現齡沒有有效支出）");
    expect(E.ratios(c)["財務自由度"].status).toBe("na");
  });

  it("⚠️ 有收入列但沒有一列涵蓋現齡 → 以收入為分母的比率顯示「—」，不是 −50,400,000%", () => {
    const c = E.sampleCase();
    c.profile.age = 38;               // 示範案林曉薇的情形
    const r = E.ratios(c);
    expect(r["名目儲蓄率"].v).toBe("—（現齡沒有有效收入）");
    expect(r["支出收入比"].status).toBe("na");
    expect(r["所得穩定度"].v).toBe("—（現齡沒有有效收入）");
    // 資產負債那一組不吃收入，維持原樣
    expect(r["負債比率"].v).not.toContain("—（現齡");
  });

  it("整張收入表本來就空白的個案維持改版前的顯示（不順手改動不相干的數字）", () => {
    const c = E.sampleCase();
    c.incomes = [];
    const r = E.ratios(c);
    expect(E.metrics(c).incTotalRaw).toBe(0);
    expect(r["名目儲蓄率"].v).not.toContain("—（現齡");
  });

  it("UI：表面總額與現齡有效不一樣時，比率表上方要當場說明（不能藏在「點開」裡）", () => {
    const c = useSample("family");
    // 現齡 40、每列都在起訖內 → 不出現
    expect(w.flowScopeHTML(c)).toBe("");
    c.profile.age = 29;                 // 每列都從 40 歲起算
    const html = w.flowScopeHTML(c);
    expect(html).toContain("現齡 29 歲落在起訖之內");
    expect(html).toContain("2 列收入");
    expect(html).toContain("5 列支出");
    expect(html).toContain(w.fmt(1_900_000));   // 表面總額仍要看得到
    expect(html).toContain("把起訖歲改對");
    // 掛在收支流量比率表的正上方
    expect(HTML).toContain("html:function(){return flowScopeHTML(c)+ratioTbl('收支流量')}},");
  });

  it("兩份實作的 metrics 對同一份資料給同一組數字", () => {
    const c = E.sampleCase();
    c.profile.age = 70;
    const a = E.metrics(c);
    const b = w.metrics(JSON.parse(JSON.stringify(c)));
    for (const k of ["incTotal", "incTotalRaw", "expTotal", "expTotalRaw", "tax", "ins", "save", "net"]) {
      expect(b[k], k).toBeCloseTo(a[k], 6);
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe("A2｜模擬到幾歲：綁定與覆寫兩條路", () => {
  it("未覆寫：投影上界一律跟著預估壽命走", () => {
    const c = E.sampleCase();               // lifeExp 85 / horizon 85
    expect(E.horizonManual(c)).toBe(false);
    expect(E.effHorizon(c)).toBe(85);
    // UI 的 setLifeExp() 會把旗標寫實＋把 horizon 帶著走；這裡直接模擬那個狀態
    c.params.horizonManual = false;
    c.profile.lifeExp = 95;
    expect(E.effHorizon(c)).toBe(95);
    const rows = E.projection(c).rows;
    expect(rows[rows.length - 1].age).toBe(95);
  });

  it("明確覆寫（horizonManual===true）：投影吃 params.horizon，不跟壽命走", () => {
    const c = E.sampleCase();
    c.params.horizonManual = true;
    c.params.horizon = 80;
    c.profile.lifeExp = 95;
    expect(E.horizonManual(c)).toBe(true);
    expect(E.effHorizon(c)).toBe(80);
    const rows = E.projection(c).rows;
    expect(rows[rows.length - 1].age).toBe(80);
  });

  it("⚠️ 舊資料相容：沒有 horizonManual 但 horizon ≠ lifeExp → 視為已覆寫，數字一位不動", () => {
    const c = E.sampleCase();               // 模擬既有那 7 份 2025 示範案
    c.profile.lifeExp = 88;
    c.params.horizon = 85;
    expect(c.params.horizonManual).toBeUndefined();
    expect(E.horizonManual(c)).toBe(true);
    expect(E.effHorizon(c)).toBe(85);       // ← 保住現狀，不偷偷改成 88
  });

  it("horizonManual===false 一律以壽命為準（即使 horizon 是別的值）", () => {
    const c = E.sampleCase();
    c.params.horizonManual = false;
    c.params.horizon = 85;
    c.profile.lifeExp = 92;
    expect(E.effHorizon(c)).toBe(92);
  });

  it("綁定之後，改壽命 shortPV 才會動（舊版 retireNeed 跳 740 萬、shortPV 紋風不動）", () => {
    const c = E.sampleCase();
    c.params.horizonManual = false;
    const before = E.metrics(c).proj.shortPV;
    const needBefore = E.retireNeed(c).total;
    c.profile.lifeExp = 95;
    const after = E.metrics(c).proj.shortPV;
    const needAfter = E.retireNeed(c).total;
    expect(needAfter).toBeGreaterThan(needBefore);
    expect(after).not.toBe(before);
  });

  it("蒙地卡羅與投影用同一個上界", () => {
    const c = E.sampleCase();
    c.params.horizonManual = false;
    c.profile.lifeExp = 95;
    expect(E.monteCarlo(c, 10).years).toBe(E.projection(c).rows.length);
  });

  it("UI：規劃參數的「模擬到幾歲」預設是唯讀＋跟著壽命，勾了才可以打字", () => {
    const c = useSample("family");
    const html = () => w.document.querySelector(".main")?.innerHTML || "";
    expect(html()).toContain("跟著「家庭」分頁的預估壽命走");
    expect(html()).toContain("自己設定");

    w.setHorizonManual(true);
    expect(c.params.horizonManual).toBe(true);
    expect(c.params.horizon).toBe(85);      // 打開時先把目前生效值寫進去
    expect(html()).toContain("手動覆寫中");

    w.setHorizonManual(false);
    expect(c.params.horizonManual).toBe(false);
    expect(w.effHorizon(c)).toBe(85);
  });

  it("UI：未覆寫時改「預估壽命」，horizon 跟著寫進去（不會被相容規則誤判成已覆寫）", () => {
    const c = useSample("family");
    w.setLifeExp("95");
    expect(c.profile.lifeExp).toBe(95);
    expect(c.params.horizon).toBe(95);
    expect(c.params.horizonManual).toBe(false);
    expect(w.effHorizon(c)).toBe(95);
  });

  it("UI：已覆寫時改「預估壽命」，horizon 不動", () => {
    const c = useSample("family");
    w.setHorizonManual(true);
    w.setMeta("params", "horizon", "80", "num");
    w.setLifeExp("95");
    expect(c.params.horizon).toBe(80);
    expect(w.effHorizon(c)).toBe(80);
  });
});

// ─────────────────────────────────────────────────────────────
describe("A3｜沒有任何賺薪成員填退休年齡 → 退回 65", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noRetire = (): any => {
    const c = E.sampleCase();
    c.profile.retireAge = 0;
    c.members.forEach((m: { retireAge?: number }) => { m.retireAge = 0; });
    return c;
  };

  it("earnerRetirePoints 仍是空的（旗標就是靠它判斷）", () => {
    const c = noRetire();
    expect(E.earnerRetirePoints(c).length).toBe(0);
    expect(E.retireAgeAssumed(c)).toBe(true);
    expect(E.retireAgeAssumed(E.sampleCase())).toBe(false);
  });

  it("retirePoints 退回「本人 65 歲一次切換」，權重不再永遠是 0", () => {
    const c = noRetire();
    const pts = E.retirePoints(c);
    expect(pts.length).toBe(1);
    expect(pts[0].at).toBe(65);
    expect(pts[0].assumed).toBe(true);
    expect(E.retiredWeight(c, 64)).toBe(0);
    expect(E.retiredWeight(c, 66)).toBe(1);
  });

  it("⚠️ 退休期支出不再整段從投影裡消失（舊版 shortPV 從 541,711 掉到 72,600）", () => {
    const c = noRetire();
    const withDraw = E.projection(c).rows.filter((r: { age: number }) => r.age > 65);
    expect(withDraw.length).toBeGreaterThan(0);
    // 65 歲之後每一年都要吃得到退休期支出
    expect(E.retireAnnual(c, 70, 1)).toBeGreaterThan(0);
    expect(E.metrics(c).proj.shortPV).toBeGreaterThan(E.n(72_600));
  });

  it("metrics() 帶出 retireAgeAssumed 讓 UI 讀得到", () => {
    expect(E.metrics(noRetire()).retireAgeAssumed).toBe(true);
    expect(E.metrics(E.sampleCase()).retireAgeAssumed).toBe(false);
  });

  it("UI：退休分頁明說「本人未填退休年齡，暫以 65 歲試算」，且說清楚是假設", () => {
    const c = useSample("retire");
    expect(w.document.querySelector("[data-retire-assumed]")).toBeFalsy();

    c.profile.retireAge = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.members.forEach((m: any) => { m.retireAge = 0; });
    w.render();
    const box = w.document.querySelector("[data-retire-assumed]");
    expect(box, "退休分頁要看得到假設提示").toBeTruthy();
    expect(box.textContent).toContain("本人未填退休年齡，暫以 65 歲試算");
    expect(box.textContent).toContain("系統的假設值，不是客戶填的");
  });

  it("UI：四個落點（退休首屏／退休時點／分析頁 retire 模組／報告書）都接上了", () => {
    expect(HTML).toContain("function retireAssumedHTML(c,light){");
    expect(HTML).toContain("return retireAssumedHTML(c)+'<div class=\"big3\"><div class=\"b\"><div class=\"l\">退休後餘年</div>");
    expect(HTML).toContain("+warn+assumed+'</div>';");
    expect(HTML).toContain("return retireAssumedHTML(c)+'<div class=\"big3\">");
    expect(HTML).toContain("'<h2>§、退休與教育需求</h2>'+retireAssumedHTML(c,true)+");
  });
});

// ─────────────────────────────────────────────────────────────
describe("A4｜起訖留空＝全期間有效", () => {
  it("inSpan：空字串／0 都當成沒設界線", () => {
    expect(E.inSpan({ start: "", end: "" }, 1)).toBe(true);
    expect(E.inSpan({ start: "", end: "" }, 120)).toBe(true);
    expect(E.inSpan({ start: 0, end: 0 }, 70)).toBe(true);
    expect(E.inSpan({}, 70)).toBe(true);
    // 單邊留空 → 只剩另一邊那個界線
    expect(E.inSpan({ start: 50, end: "" }, 49)).toBe(false);
    expect(E.inSpan({ start: 50, end: "" }, 200)).toBe(true);
    expect(E.inSpan({ start: "", end: 50 }, 51)).toBe(false);
    expect(E.inSpan({ start: "", end: 50 }, 1)).toBe(true);
    // 有界線的照舊
    expect(E.inSpan({ start: 40, end: 65 }, 39)).toBe(false);
    expect(E.inSpan({ start: 40, end: 65 }, 65)).toBe(true);
    expect(E.inSpan({ start: 40, end: 65 }, 66)).toBe(false);
  });

  it("⚠️ 全庫那一筆：金思妤的「人身保險(保障型)」年繳 20,913 起訖全空", () => {
    const c = E.sampleCase();
    c.incomes = [];
    c.expenses = [{ name: "人身保險(保障型)", cat: "保險", subCat: "人身保險(保障型)",
      period: "年", amount: 20_913, infl: false, cut: 0, start: "", end: "", premAuto: "protect" }];
    c.liabilities = [];
    // 現齡端與投影端都看得到，而且是同一個數字
    expect(E.metrics(c).expTotal).toBe(20_913);
    expect(E.workPhaseExpense(c, 40, 1, 0)).toBe(20_913);
    expect(E.workPhaseExpense(c, 85, 1, 0)).toBe(20_913);
    expect(E.metrics(c).ins).toBe(20_913);
  });

  it("收入列留空也一樣（每一年都算）", () => {
    const c = E.sampleCase();
    c.incomes = [{ owner: "本人", type: "工作", amount: 600_000, growth: 0, start: "", end: "" }];
    expect(E.metrics(c).incTotal).toBe(600_000);
    expect(E.projection(c).rows[0].work).toBe(600_000);
    const rows = E.projection(c).rows;
    expect(rows[rows.length - 1].work).toBe(600_000);
  });

  it("生活願望與目標也走同一支（留空＝全期間）", () => {
    const c = E.sampleCase();
    c.travel = [{ name: "每年旅遊", amount: 100_000, freq: 1, start: "", end: "" }];
    c.hobby = []; c.luxury = [];
    expect(E.lifestyleFactor(c, 40, 1)).toBe(100_000);
    expect(E.lifestyleFactor(c, 84, 1)).toBe(100_000);
  });

  it("兩份實作對同一筆留空資料給同一個答案", () => {
    const c = E.sampleCase();
    c.expenses.push({ name: "人身保險(保障型)", cat: "保險", period: "年",
      amount: 20_913, infl: false, cut: 0, start: "", end: "" });
    const a = E.metrics(c), b = w.metrics(JSON.parse(JSON.stringify(c)));
    expect(b.expTotal).toBeCloseTo(a.expTotal, 6);
    expect(b.proj.shortPV).toBeCloseTo(a.proj.shortPV, 6);
  });
});
