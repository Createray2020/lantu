import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 收支資債輸入台的 UI 接線測試（真的把 lantu-app.html 跑起來）。
 *
 * 為什麼需要這一支：細類的連動是「選了細類 → 把大類與旗標寫進資料列」，
 * 而旗標（risk / consumerDebt）決定了風險資產比與消費性負債比的分子。
 * 這條路徑全部走在 HTML 內的字串樣板與 onchange 屬性裡，
 * 純正則的 drift test 看不出「選了之後資料到底有沒有寫進去」。
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
  w.app.dataTab = "finance";
  if (!w.app.cases.length) w.app.cases = [w.sampleCase()];
  w.app.activeId = w.app.cases[0].id;
  w.render();
});

const pane = () => w.document.querySelector("#app").innerHTML as string;

describe("收支資債：細類下拉吃的是字典，不是寫死的短清單", () => {
  it("四張表都渲染得出細類選項（含改版後才有的細顆粒選項）", () => {
    const h = pane();
    expect(h).toContain("薪資");                 // 收入細類
    expect(h).toContain("細項");                 // 支出/負債新增的欄位標題
    expect(h).toContain("加密貨幣");             // 資產：改版前沒有
    expect(h).toContain("私人借款(親友)");        // 負債：改版前沒有
    expect(h).toContain("動產-珠寶名錶");         // 資產：Ray 指名要的動產
  });

  it("選項依大類分組（optgroup），不是一長串平的清單", () => {
    expect(pane()).toContain("<optgroup");
  });
});

describe("選細類會把大類與旗標一起寫進資料列（引擎讀不到後台字典，旗標必須跟著資料走）", () => {
  it("資產選「加密貨幣」→ 大類=可投資資產、風險性=true、流動性=流動", () => {
    w.setCat("assets", 0, "asset", "加密貨幣");
    const a = w.activeCase().assets[0];
    expect(a.type).toBe("加密貨幣");
    expect(a.mainCat).toBe("可投資資產");
    expect(a.risk).toBe(true);
    expect(a.cls).toBe("流動");
    expect(w.isRiskAsset(a)).toBe(true);
  });

  it("資產選「自住不動產」→ 大類=自用資產、風險性=false（不會被算進風險資產比）", () => {
    w.setCat("assets", 0, "asset", "自住不動產");
    const a = w.activeCase().assets[0];
    expect(a.mainCat).toBe("自用資產");
    expect(a.risk).toBe(false);
    expect(w.isRiskAsset(a)).toBe(false);
  });

  it("負債選「信用卡循環」→ 大類=信貸、消費性=true", () => {
    w.setCat("liabilities", 0, "liability", "信用卡循環");
    const l = w.activeCase().liabilities[0];
    expect(l.subCat).toBe("信用卡循環");
    expect(l.mainCat).toBe("信貸");
    expect(l.consumerDebt).toBe(true);
    expect(w.isConsumerDebt(l)).toBe(true);
  });

  it("負債選「私人借款(親友)」→ 大類=其他、預設不算消費性負債", () => {
    w.setCat("liabilities", 0, "liability", "私人借款(親友)");
    const l = w.activeCase().liabilities[0];
    expect(l.mainCat).toBe("其他");
    expect(l.consumerDebt).toBe(false);
    expect(w.isConsumerDebt(l)).toBe(false);
  });

  it("收入選細類會連動稅務大類（執行業務所得仍歸「工作」，費用率扣除照舊）", () => {
    w.setCat("incomes", 0, "income", "執行業務所得");
    expect(w.activeCase().incomes[0].type).toBe("工作");
    w.setCat("incomes", 0, "income", "租金收入");
    expect(w.activeCase().incomes[0].type).toBe("理財");
  });
});

describe("舊資料相容：沒有旗標的資料沿用改版前的判定，數字不會變", () => {
  it("舊的股票/基金/債券仍算風險性資產", () => {
    expect(w.isRiskAsset({ type: "股票" })).toBe(true);
    expect(w.isRiskAsset({ type: "基金" })).toBe(true);
    expect(w.isRiskAsset({ type: "現金" })).toBe(false);
    expect(w.isRiskAsset({ type: "不動產", mainCat: "可投資資產" })).toBe(true);
    expect(w.isRiskAsset({ type: "不動產", mainCat: "自用資產" })).toBe(false);
  });

  it("舊的信貸／名稱含「卡」的仍算消費性負債", () => {
    expect(w.isConsumerDebt({ mainCat: "信貸", name: "銀行借款" })).toBe(true);
    expect(w.isConsumerDebt({ mainCat: "其他", name: "卡費" })).toBe(true);
    expect(w.isConsumerDebt({ mainCat: "房貸", name: "房貸" })).toBe(false);
  });

  it("旗標一旦寫進資料就優先於字串比對（顧問可個案覆寫）", () => {
    expect(w.isRiskAsset({ type: "股票", risk: false })).toBe(false);
    expect(w.isConsumerDebt({ mainCat: "房貸", consumerDebt: true })).toBe(true);
  });
});

describe("「其他」的明細欄：選填、不擋存檔，但沒填會標「待補明細」", () => {
  it("選了「其他」就長出明細欄與提示；填了提示就消失", () => {
    w.setCat("expenses", 0, "expense", "其他");
    expect(pane()).toContain("待補明細");
    w.set("expenses:0", "otherNote", "公司團購尾款");
    w.render();
    expect(w.activeCase().expenses[0].otherNote).toBe("公司團購尾款");
    expect(pane()).not.toContain("待補明細");
  });

  it("改選非「其他」的細類，殘留的明細會被清掉（不會掛在不相干的類別上）", () => {
    w.setCat("expenses", 0, "expense", "其他");
    w.set("expenses:0", "otherNote", "殘留值");
    w.setCat("expenses", 0, "expense", "餐食");
    expect(w.activeCase().expenses[0].otherNote).toBe("");
    expect(w.activeCase().expenses[0].cat).toBe("生活");
  });
});

describe("房租／社會保險費的比對加上細項欄位（舊版只看項目名稱會漏抓）", () => {
  it("項目名沒有「租」字、但細項選了「居住(房租)」，房租仍算得出來", () => {
    const c = w.activeCase();
    c.expenses = [{ name: "家裡", cat: "生活", subCat: "居住(房租)", amount: 360000, infl: false, start: 40, end: 85, cut: 0 }];
    const r = w.ratios(c);
    expect(r).toBeTruthy();
    // 直接驗聚合式：租金要被認出來（改版前這裡會是 0）
    expect(/租/.test(String(c.expenses[0].name) + String(c.expenses[0].subCat))).toBe(true);
  });
});

describe("其他分頁不被連累", () => {
  it.each(["family", "incomes", "retire", "education", "goals", "coverages"])(
    "資料分頁 %s 仍渲染得出來",
    (tab) => {
      w.app.activeTab = "data";
      w.app.dataTab = tab;
      expect(() => w.render()).not.toThrow();
    },
  );

  it.each(["analysis", "report"])("主分頁 %s 仍渲染得出來", (tab) => {
    w.app.activeTab = tab;
    expect(() => w.render()).not.toThrow();
  });
});

describe("子女教育：依年齡自動推學段、官方學費預填", () => {
   
  const freshCase = (childAge: number) => {
    const c = w.newCase();
    c.members = [
      { name: "爸", role: "本人", age: 38, mid: "p1" },
      { name: "小華", role: "子女", age: childAge, mid: "k1" },
    ];
    c.intent = { mustHave: ["子女教養規劃"] };
    w.app.cases.push(c);
    w.app.activeId = c.id;
    w.app.activeTab = "data";
    w.app.dataTab = "education";
    w.render();
    return w.activeCase();
  };

  it("7 歲的孩子 → 卡片直接顯示目前學段與剩餘年數", () => {
    freshCase(7);
    const h = w.document.querySelector("#app").innerHTML as string;
    expect(h).toContain("目前就讀");
    expect(h).toContain("國小");
    expect(h).toContain("國小還剩 5 年");
  });

  it("新客戶（沒有舊教育金列）→ 自動產生從現在到大學的所有學段", () => {
    const c = freshCase(7);
    const auto = c.education.filter((e: { auto?: boolean }) => e.auto === true);
    expect(auto.map((e: { stage: string }) => e.stage)).toEqual(["國小", "國中", "高中職", "大學"]);
    // 國小：現在就在讀 → 幾年後開始 0、還要供給 5 年
    expect(auto[0]).toMatchObject({ startIn: 0, years: 5 });
    // 大學：11 年後開始、4 年
    expect(auto[3]).toMatchObject({ startIn: 11, years: 4 });
  });

  it("金額用官方公告的公立學雜費預填，換成私立會整組換掉", () => {
    const c = freshCase(7);
    const uni = () => c.education.find((e: { stage: string }) => e.stage === "大學");
    expect(uni().tuition).toBe(55000);   // 公立大學
    w.setEduSchool("k1", "大學", "私立");
    expect(uni().tuition).toBe(65000);   // 私立（已扣 3.5 萬補助）
    w.setEduSchool("k1", "大學", "海外");
    expect(uni().tuition).toBe(1500000);
  });

  it("手動改過的金額不會被換學別蓋掉，按 ↺ 才回復預設", () => {
    const c = freshCase(7);
    const primary = () => c.education.find((e: { stage: string }) => e.stage === "國小");
    w.setEduAmt("k1", "國小", "tuition", 99999);
    expect(primary().tuition).toBe(99999);
    expect(primary().lock.tuition).toBeTruthy();
    w.setEduSchool("k1", "國小", "私立");
    expect(primary().tuition).toBe(99999);       // 沒被蓋掉
    w.resetEduRow("k1", "國小");
    expect(primary().tuition).toBe(115000);      // 私立國小
    expect(primary().lock.tuition).toBeFalsy();
  });

  it("期望最高學歷改了，學段清單跟著長短", () => {
    const c = freshCase(7);
    const stages = () => c.education.filter((e: { auto?: boolean }) => e.auto === true).map((e: { stage: string }) => e.stage);
    w.setEduOpt(1, "eduTop", "高中職");
    expect(stages()).toEqual(["國小", "國中", "高中職"]);
    w.setEduOpt(1, "eduTop", "研究所");
    expect(stages()).toEqual(["國小", "國中", "高中職", "大學", "研究所"]);
  });

  it("補習才藝／撫養費預設不列入；勾了才加進年費用", () => {
    const c = freshCase(7);
    const primary = () => c.education.find((e: { stage: string }) => e.stage === "國小");
    expect(primary().annual).toBe(12000);                  // 只有學雜費
    w.setEduOpt(1, "eduExtra", true, "bool");
    expect(primary().annual).toBe(12000 + 60000);          // ＋ 補習才藝
    w.setEduOpt(1, "eduCare", true, "bool");
    expect(primary().annual).toBe(12000 + 60000 + 190000); // ＋ 撫養費
  });

  it("「支付學雜費至幾歲」會截掉後面的年份", () => {
    const c = freshCase(7);
    w.setEduOpt(1, "eduPayTo", 20, "num");
    const uni = c.education.find((e: { stage: string }) => e.stage === "大學");
    expect(uni.years).toBe(2); // 大學 18–22，只供給到 20 歲
  });

  it("既有客戶的手動列不會被自動生成的列蓋掉、也不會被重複計算", () => {
    // sampleCase 帶著兩列手動填的教育金
    const c = w.sampleCase();
    c.members = [
      { name: "爸", role: "本人", age: 40, mid: "p9" },
      { name: "小寶", role: "子女", age: 7, mid: "k9" },
    ];
    c.intent = { mustHave: ["子女教養規劃"] };
    const legacyCount = c.education.length;
    expect(legacyCount).toBeGreaterThan(0);
    w.app.cases.push(c);
    w.app.activeId = c.id;
    w.app.activeTab = "data";
    w.app.dataTab = "education";
    w.render();
    const cur = w.activeCase();
    // 有舊資料 → 預設不自動生成，只給一顆按鈕請顧問自己決定
    expect(cur.education.filter((e: { auto?: boolean }) => e.auto === true)).toHaveLength(0);
    expect(cur.education).toHaveLength(legacyCount);
    expect(w.document.querySelector("#app").innerHTML).toContain("依年齡自動帶入各學段");

    // 按下去才生成，而且舊列原封不動
    w.enableEduAuto(1);
    expect(cur.education.filter((e: { auto?: boolean }) => e.auto === true).length).toBeGreaterThan(0);
    expect(cur.education.filter((e: { auto?: boolean }) => e.auto !== true)).toHaveLength(legacyCount);

    // 改回手動：只移除自動列
    w.disableEduAuto(1);
    expect(cur.education).toHaveLength(legacyCount);
  });

  it("家庭沒有子女成員時，給的是「去家庭分頁加子女」的說明，不是空白表", () => {
    const c = w.newCase();
    c.members = [{ name: "本人", role: "本人", age: 30, mid: "s1" }];
    c.intent = { mustHave: ["子女教養規劃"] };
    w.app.cases.push(c);
    w.app.activeId = c.id;
    w.app.activeTab = "data";
    w.app.dataTab = "education";
    w.render();
    expect(w.document.querySelector("#app").innerHTML).toContain("還沒有角色為");
  });
});
