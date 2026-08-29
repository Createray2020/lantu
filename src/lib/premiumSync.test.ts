import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 支出表的人身保費改由保單表投影（2026/08/26 教練回饋）。
 *
 * 教練原本的訴求是「壽險主約底下附帶很多醫療或意外附約時，我會統一 key 在壽險保費，
 * 分類是不是該重整」。查下來這件事**對分析完全沒有影響**——理財金三角的
 * 保障型／理財型保費是從 c.policies 的險種算的，支出表的保險細分只進總支出，
 * 沒有任何分析吃它。
 *
 * 真正的問題是**同一筆保費要 key 兩次**：全庫 37 份兩邊都有的規劃裡，26 份對不上，
 * 而且正負都有（有人支出寫 26 萬、保單表 34.2 萬；有人反過來）。
 * 所以支出表的人身保費改成保單表的投影：兩列、鎖住、要改去保單表。
 *
 * ⚠️ 產險、勞健保、國民年金維持手填——全庫沒有任何一張產險建在保單表裡，
 *    接管它們會讓那些支出憑空消失。
 * ⚠️ 保單表完全沒有有效保費的規劃**不接管**（那是資料不完整，不是重複輸入）。
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
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const base = (): any => {
  const c = w.newCase();
  c.expenses = [];
  c.policies = [];
  return c;
};
const pol = (subtype: string, premium: number) =>
  ({ pid: "p" + Math.random().toString(36).slice(2, 8), bigCat: "人身", subtype, status: "有效", premium, insured: "本人", policyKind: "主約" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prem = (c: any, k: string) => (c.expenses || []).find((e: { premAuto?: string }) => e.premAuto === k);

beforeEach(() => { w.app.cases = []; });

describe("接管：手填的人身保費換成兩列投影", () => {
  it("保單表有保費 → 支出表長出保障型／理財型兩列，金額對得上", () => {
    const c = base();
    c.policies = [pol("終身壽險", 120_000), pol("住院醫療(日額)", 47_536), pol("增額/儲蓄壽險", 60_000)];
    w.syncPremium(c);
    expect(prem(c, "protect").amount).toBe(167_536);
    expect(prem(c, "invest").amount).toBe(60_000);
    expect(prem(c, "protect").subCat).toBe("人身保險(保障型)");
    expect(prem(c, "invest").subCat).toBe("人身保險(理財型)");
  });

  it("⚠️ 接管時把手填的五種人身保費列收走（這就是 37 份數字會變的原因）", () => {
    const c = base();
    c.expenses = [
      { name: "壽險保費", cat: "保險", subCat: "壽險保費", period: "年", amount: 120_000 },
      { name: "醫療險", cat: "保險", subCat: "醫療/健康險保費", period: "年", amount: 50_000 },
    ];
    c.policies = [pol("終身壽險", 76_500)];
    w.syncPremium(c);
    const manual = c.expenses.filter((e: { subCat: string }) => ["壽險保費", "醫療/健康險保費"].includes(e.subCat));
    expect(manual, "手填的人身保費列要被收走").toEqual([]);
    expect(prem(c, "protect").amount).toBe(76_500);
  });

  it("⚠️ 產險、勞健保、國民年金一律不碰（保單表裡根本沒有產險）", () => {
    const c = base();
    c.expenses = [
      { name: "車險", cat: "保險", subCat: "車險/住宅火險", period: "年", amount: 18_000 },
      { name: "勞健保", cat: "保險", subCat: "勞健保自付", period: "年", amount: 24_000 },
      { name: "國民年金", cat: "保險", subCat: "國民年金保費", period: "年", amount: 12_000 },
    ];
    c.policies = [pol("終身壽險", 76_500)];
    w.syncPremium(c);
    const kept = c.expenses.filter((e: { premAuto?: string }) => !e.premAuto).map((e: { subCat: string }) => e.subCat);
    expect(kept.sort()).toEqual(["國民年金保費", "勞健保自付", "車險/住宅火險"].sort());
  });

  it("⚠️⚠️ 保單表沒有任何有效保費 → 完全不接管（不然支出憑空歸零）", () => {
    const c = base();
    c.expenses = [{ name: "保險費", cat: "保險", subCat: "壽險保費", period: "年", amount: 94_728 }];
    c.policies = [];
    w.syncPremium(c);
    expect(c.expenses.length).toBe(1);
    expect(c.expenses[0].amount, "教練手填的 94,728 必須留著").toBe(94_728);
    expect(prem(c, "protect")).toBeUndefined();
  });

  it("⚠️⚠️ 沒有 subCat、只叫「保險費」的舊列也要接管（全庫 45 筆有 34 筆是這種）", () => {
    // 乾跑時踩過：只比對五種細類 → 這 34 筆整批漏掉，然後在原本的保費上「再疊一份」，
    // 實測有客戶的財務階段直接從 A 掉到 D。
    const c = base();
    c.expenses = [{ name: "保險費", cat: "保險", subCat: "", period: "年", amount: 120_000 }];
    c.policies = [pol("終身壽險", 76_500)];
    w.syncPremium(c);
    const manual = c.expenses.filter((e: { premAuto?: string }) => !e.premAuto);
    expect(manual, "舊的「保險費」那列要被收走，不能疊加").toEqual([]);
    const total = c.expenses.reduce((s: number, e: { amount: number }) => s + Number(e.amount || 0), 0);
    expect(total, "接管後就是保單表的金額").toBe(76_500);
  });

  it("⚠️ 認不得的列一律不碰——庫裡真的有一筆「居住(房租)」被誤放在保險大類", () => {
    const c = base();
    c.expenses = [
      { name: "房租", cat: "保險", subCat: "居住(房租)", period: "年", amount: 240_000 },
      { name: "保險費", cat: "保險", subCat: "", period: "年", amount: 120_000 },
    ];
    c.policies = [pol("終身壽險", 76_500)];
    w.syncPremium(c);
    const rent = c.expenses.find((e: { subCat: string }) => e.subCat === "居住(房租)");
    expect(rent, "房租不可以被當成保費刪掉").toBeTruthy();
    expect(rent.amount).toBe(240_000);
  });

  it("沒有 subCat 但名稱跟保險無關的列也不碰", () => {
    const c = base();
    c.expenses = [{ name: "社區管理費", cat: "保險", subCat: "", period: "年", amount: 36_000 }];
    c.policies = [pol("終身壽險", 76_500)];
    w.syncPremium(c);
    expect(c.expenses.some((e: { name: string }) => e.name === "社區管理費")).toBe(true);
  });

  it("isPersonalPremRow 的完整判斷表", () => {
    const T = (e: Record<string, unknown>) => w.isPersonalPremRow(e);
    expect(T({ cat: "保險", subCat: "壽險保費" })).toBe(true);
    expect(T({ cat: "保險", subCat: "人身保險" })).toBe(true);
    expect(T({ cat: "保險", subCat: "", name: "保險費" })).toBe(true);
    expect(T({ cat: "保險", subCat: "車險/住宅火險" })).toBe(false);
    expect(T({ cat: "保險", subCat: "勞健保自付" })).toBe(false);
    expect(T({ cat: "保險", subCat: "勞健保", name: "勞健保費（個人負擔）" })).toBe(false);
    expect(T({ cat: "保險", subCat: "國民年金保費" })).toBe(false);
    expect(T({ cat: "保險", subCat: "居住(房租)" })).toBe(false);
    expect(T({ cat: "生活", subCat: "" , name: "保險費" }), "別的大類一律不碰").toBe(false);
  });

  it("⚠️ 投影列要繼承原本那幾列的起訖（不然金流的時間被悄悄改掉）", () => {
    // 舊列多半寫著「40–85 歲」，投影列如果留空＝一生都在繳。
    // 教練沒有動任何東西，現金流的時間卻不一樣了——這種改動最難被發現。
    const c = base();
    c.expenses = [{ name: "保險費", cat: "保險", subCat: "", period: "年", amount: 120_000, start: 40, end: 85 }];
    c.policies = [pol("終身壽險", 76_500)];
    w.syncPremium(c);
    expect(prem(c, "protect").start).toBe(40);
    expect(prem(c, "protect").end).toBe(85);
    expect(prem(c, "invest").start).toBe(40);
  });

  it("多列起訖不同時取最寬的區間", () => {
    const c = base();
    c.expenses = [
      { name: "壽險保費", cat: "保險", subCat: "壽險保費", period: "年", amount: 60_000, start: 45, end: 80 },
      { name: "醫療險", cat: "保險", subCat: "醫療/健康險保費", period: "年", amount: 40_000, start: 40, end: 90 },
    ];
    c.policies = [pol("終身壽險", 76_500)];
    w.syncPremium(c);
    expect(prem(c, "protect").start).toBe(40);
    expect(prem(c, "protect").end).toBe(90);
  });

  // 2026/08/29 A4：原本這裡斷言 start===''，理由寫的是「留空＝一生，這是對的」——
  // 但引擎那邊 n('')===0，workPhaseExpense 的 age>n(e.end) 每一年都命中，
  // 這一列其實是「一毛都不計」，跟註解說的完全相反（全庫有一筆：金思妤的人身保險(保障型) 20,913）。
  // Ray 拍板兩層都補：(a) 新列預設帶「現齡 → 預估壽命」；(b) 引擎把留空當全期間有效（見 inSpan）。
  it("原本就沒有保費列 → 起訖預設帶「現齡 → 預估壽命」", () => {
    const c = base();               // newCase：現齡 40、預估壽命 85
    c.policies = [pol("終身壽險", 76_500)];
    w.syncPremium(c);
    expect(prem(c, "protect").start).toBe(40);
    expect(prem(c, "protect").end).toBe(85);
    expect(prem(c, "invest").start).toBe(40);
    expect(prem(c, "invest").end).toBe(85);
  });

  it("A4b：就算起訖真的留空，引擎也當「全期間有效」而不是 0–0", () => {
    const c = base();
    c.expenses = [{ name: "人身保險(保障型)", cat: "保險", subCat: "人身保險(保障型)", period: "年",
      amount: 20_913, infl: false, cut: 0, start: "", end: "", premAuto: "protect" }];
    // 現齡與投影兩邊都要看得到這 20,913
    expect(w.metrics(c).expTotal).toBe(20_913);
    expect(w.workPhaseExpense(c, 40, 1, 0)).toBe(20_913);
    expect(w.workPhaseExpense(c, 84, 1, 0)).toBe(20_913);
  });

  it("失效／停效的保單不算保費", () => {
    const c = base();
    c.policies = [pol("終身壽險", 120_000), { ...pol("終身壽險", 999_999), status: "失效" }];
    w.syncPremium(c);
    expect(prem(c, "protect").amount).toBe(120_000);
  });
});

describe("同步：改保單表，支出表跟著走", () => {
  it("重複跑不會多長列（冪等）", () => {
    const c = base();
    c.policies = [pol("終身壽險", 100_000)];
    w.syncPremium(c);
    w.syncPremium(c);
    w.syncPremium(c);
    expect(c.expenses.filter((e: { premAuto?: string }) => e.premAuto).length).toBe(2);
  });

  it("保費改了，投影跟著改", () => {
    const c = base();
    c.policies = [pol("終身壽險", 100_000)];
    w.syncPremium(c);
    expect(prem(c, "protect").amount).toBe(100_000);
    c.policies[0].premium = 180_000;
    w.syncPremium(c);
    expect(prem(c, "protect").amount).toBe(180_000);
  });

  it("保單被判成理財型 → 金額從保障型那列搬到理財型", () => {
    const c = base();
    c.policies = [pol("終身壽險", 100_000)];
    w.syncPremium(c);
    expect(prem(c, "invest").amount).toBe(0);
    c.policies[0].premiumType = "理財型";   // 教練在保單卡上覆寫
    w.syncPremium(c);
    expect(prem(c, "protect").amount).toBe(0);
    expect(prem(c, "invest").amount).toBe(100_000);
  });

  it("在保單表改保費（走 set()）會即時同步到支出表", () => {
    const c = w.migrateCase(base());
    c.policies = [pol("終身壽險", 100_000)];
    w.app.cases = [c]; w.app.activeId = c.id;
    w.syncPremium(c);
    w.set("policies:0", "premium", "250000", "num");
    expect(prem(w.activeCase(), "protect").amount).toBe(250_000);
  });
});

describe("畫面：鎖住、標明來源", () => {
  it("投影列在支出表上是唯讀的，而且標「來自保單表」", () => {
    const c = w.migrateCase(base());
    c.policies = [pol("終身壽險", 100_000)];
    w.app.cases = [c]; w.app.activeId = c.id;
    w.syncPremium(c);
    w.app.activeTab = "data"; w.app.dataTab = "finance"; w.render();
    const rows = [...w.document.querySelectorAll("#app tr.autorow")];
    expect(rows.length).toBe(2);
    const txt = rows.map((r) => (r as Element).textContent).join(" ");
    expect(txt).toContain("來自保單表");
    expect(txt).toContain("人身保險(保障型)");
    for (const r of rows) {
      expect((r as Element).querySelectorAll("input").length, "不能有可編輯的輸入框").toBe(0);
    }
  });
});

describe("總支出仍然含保費（投影列是真的資料列，不是畫面裝飾）", () => {
  it("引擎算得到這兩列", () => {
    const c = w.migrateCase(base());
    c.policies = [pol("終身壽險", 100_000), pol("增額/儲蓄壽險", 60_000)];
    w.app.cases = [c]; w.app.activeId = c.id;
    w.syncPremium(c);
    const total = (c.expenses || []).reduce((s: number, e: { amount: number }) => s + Number(e.amount || 0), 0);
    expect(total).toBe(160_000);
  });
});
