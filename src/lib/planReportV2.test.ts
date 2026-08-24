import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 調整方案書 v2（2026/08/24 整份重寫）。
 *
 * v1 的主角是「六根槓桿的比例」，v2 換成「一條一條具體動作」。
 * ⚠️ 兩份文件的分工不變：方案書回答「所以要做什麼」，客戶版報告書回答
 *    「你現在怎麼樣」。這支測試同時守住這條界線。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "report";
  w.app.reportDoc = "plan";
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withActions(): any {
  const c = w.migrateCase(w.sampleCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  const mk = (cat: string, o: Record<string, unknown>) => {
    w.addRow("actions");
    const a = c.actions[c.actions.length - 1];
    a.cat = cat;
    w.actFillSpan(c, a);
    Object.assign(a, o);
  };
  mk("income", { name: "轉職／爭取加薪", tool: "職涯規劃", getMonthly: 15000, src: "new" });
  mk("expense", { name: "處理掉第二台車", ref: "expenses:0", getMonthly: 9000 });
  mk("regular", { name: "全球股票型 ETF 月扣", tool: "VT／00646", payMonthly: 20000, growth: 6, src: "surplus" });
  mk("insure", { name: "補足家庭責任保障", tool: "定期壽險 20 年期", payMonthly: 4200, cover: 8000000, coverKind: "壽險", member: c.members[0].name });
  return c;
}
const rp = () => w.planReportHTML(w.app.cases[0]) as string;

describe("八章結構", () => {
  it("章節齊全且依序", () => {
    withActions();
    const h = rp();
    const order = [
      "一、你和你想要的未來，差多少",
      "二、這一輪要完成哪些願景",
      "三、缺口是怎麼形成的",
      "四、我們決定做哪些事",
      "五、這些動作做得到嗎",
      "六、如果還想做到更多",
      "七、什麼時候做什麼",
    ];
    let prev = -1;
    order.forEach((t) => {
      const i = h.indexOf(t);
      expect(i, t).toBeGreaterThan(prev);
      prev = i;
    });
  });

  it("首章是願景時間軸圖（淺色版）與改善度，不是拉桿", () => {
    withActions();
    const h = rp();
    expect(h).toContain("<svg");
    expect(h).toContain("一生願景需要的資金");
    expect(h).toContain("套用本次方案之後");
    expect(h).toContain("改善");
    expect(h).not.toContain('type="range"');
  });

  it("主軸文案是「改善了多少」不是「補平了沒」", () => {
    withActions();
    const h = rp();
    expect(h).toContain("比原本改善了多少");
    expect(h).toContain("每年再調整一次");
  });
});

describe("第四章：動作清單是主角", () => {
  it("每個動作的類別／項目／工具／年期／效果／資金來源都印得出來", () => {
    withActions();
    const h = rp();
    ["增加工作收入", "轉職／爭取加薪", "職涯規劃", "每月增加收入 15,000", "新增／自生"].forEach((t) => {
      expect(h, t).toContain(t);
    });
    expect(h).toContain("每月投入 20,000");
    expect(h).toContain("增值 6%");
    expect(h).toContain("保額 8,000,000");
  });

  it("刪減支出的效果寫「省下」不是「增加現金流」，而且指得出明細列", () => {
    withActions();
    const h = rp();
    expect(h).toContain("每月省下 9,000");
    expect(h).toContain("↳ ");
  });

  it("停用的動作不進方案書", () => {
    withActions();
    w.toggleAction(0);
    expect(rp()).not.toContain("轉職／爭取加薪");
  });

  it("沒有動作時第四章明講「尚未排定」", () => {
    const c = w.migrateCase(w.sampleCase());
    w.app.cases = [c];
    w.app.activeId = c.id;
    expect(rp()).toContain("尚未排定任何調整動作");
  });
});

describe("第五章：資金勾稽", () => {
  it("兩條資金線都印，而且會講結論", () => {
    withActions();
    const h = rp();
    expect(h).toContain("每月資金");
    expect(h).toContain("單筆資金");
    expect(h).toContain("緊急預備金門檻");
    expect(h).toMatch(/資金排得出來|排不出錢/);
  });

  it("排不出錢時要出現紅字警語", () => {
    const c = withActions();
    // 把投入拉到遠超過月結餘
    c.actions[2].payMonthly = 999999;
    expect(rp()).toContain("排不出錢");
  });
});

describe("願景清單與教練總結", () => {
  it("週期性的生活願望標「已計入現金流」，不是空的破折號", () => {
    withActions();
    const h = rp();
    expect(h).toContain("已計入現金流");
    expect(h).toContain("週期性");
  });

  it("沒選的願景會另外列出，並說明是共同決定不做的", () => {
    const c = withActions();
    c.goals[0].on = false;
    const h = rp();
    expect(h).toContain("不納入");
    expect(h).toContain("不是做不到");
  });

  it("教練總結有填才出現第八章", () => {
    const c = withActions();
    expect(rp()).not.toContain("八、教練的話");
    c.planNote = "這一輪先把支出結構調下來。";
    const h = rp();
    expect(h).toContain("八、教練的話");
    expect(h).toContain("這一輪先把支出結構調下來。");
  });
});

describe("合規與分工", () => {
  it("免責段講明報酬率是假設、登錄的是工具不是商品", () => {
    withActions();
    const h = rp();
    expect(h).toContain("假設值");
    expect(h).toContain("不是特定商品");
    expect(h).toContain("一般顧問公司");
    expect(h).toContain("不構成任何金融商品的推介或投資建議");
  });

  it("⚠️ 方案書與客戶版報告書是兩份不同的文件", () => {
    withActions();
    const plan = rp();
    const family = w.reportHTML ? w.reportHTML(w.app.cases[0]) : null;
    expect(plan).toContain("調整方案書");
    if (family) {
      expect(family).not.toContain("調整方案書");
      // 客戶版不該把動作清單整份搬進去
      expect(family).not.toContain("我們決定做哪些事");
    }
  });
});
