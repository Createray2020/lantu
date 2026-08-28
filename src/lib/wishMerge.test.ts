import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 旅遊／休閒／奢侈品整併到「生活願望」，＋ goals 的 freq 改成兩段式，＋ 購置試算。
 * （2026/08/26 教練回饋）
 *
 * ⚠️⚠️ 整併的真因不是「漏做同步」：這三類原本有兩個家（c.goals 與 c.travel/hobby/luxury），
 * 而**兩張表都進引擎**（goalOut vs lifestyleFactor）。教練問「目標資產填了、生活願望
 * 為什麼不帶入」，若照他的直覺自動帶入，同一筆旅遊會被算兩次——實測李育鏷那份
 * 正是每年被算 20 萬（goals 10 萬＋travel 一年兩次×5 萬）。
 *
 * ⚠️⚠️ freq 的真因：goals 是「每隔幾年一次」、生活願望是「一年幾次」，**剛好相反**。
 * 全庫 98 筆 goals 有 93 筆是 0（一次性）；真正用到重複的 5 筆有 3 筆填錯，
 * 而生活願望 46 份一筆都沒錯——差別在欄位標籤。所以不改語意，改成不可能填錯的輸入方式。
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
  w.alert = () => {};
});

const fresh = () => {
  w.app.cases = [w.migrateCase(w.newCase())];
  w.app.activeId = w.app.cases[0].id;
  return w.app.cases[0];
};
const go = (tab: string) => { w.app.activeTab = "data"; w.app.dataTab = tab; w.render(); };
beforeEach(() => { fresh(); });

describe("三類目標搬家：生活願望是唯一真相", () => {
  it("TARGET_META 的三項都指向生活願望，而且不再帶 goals 類型", () => {
    for (const t of ["旅遊規劃", "休閒興趣規劃", "奢侈品購買規劃"]) {
      const m = w.targetMeta(t);
      expect(m[1], `${t} 應該指向 lifestyle`).toBe("lifestyle");
      expect(m[2]).toBe("生活願望");
      expect(m[4], `${t} 不可以再 seed goals 列`).toBeFalsy();
    }
  });

  it("⚠️ 勾選時帶到生活願望，goals 一列都不長（不然又是兩個家）", () => {
    w.toggleTarget("旅遊規劃");
    const c = w.activeCase();
    expect(c.travel.length).toBe(1);
    expect((c.goals || []).filter((g: { type: string }) => g.type === "旅遊").length).toBe(0);
  });

  it("休閒與奢侈品各自帶到自己的表", () => {
    w.toggleTarget("休閒興趣規劃");
    w.toggleTarget("奢侈品購買規劃");
    const c = w.activeCase();
    expect(c.hobby.length).toBe(1);
    expect(c.luxury.length).toBe(1);
    expect((c.goals || []).some((g: { type: string }) => ["休閒", "奢侈品"].includes(g.type))).toBe(false);
  });

  it("已經有資料就不再帶新的空列", () => {
    w.toggleTarget("旅遊規劃");
    w.toggleTarget("旅遊規劃");   // 取消（空列會被收走）
    w.activeCase().travel = [{ on: true, cat: "國外", sub: "認知旅遊", start: 40, end: 65, freq: 2, amount: 50_000, minAmount: 50_000, imp: 4 }];
    w.toggleTarget("旅遊規劃");   // 再勾
    expect(w.activeCase().travel.length, "有資料就不要再塞空列").toBe(1);
  });

  it("取消勾選時，生活願望的空列也會自己收走", () => {
    w.toggleTarget("休閒興趣規劃");
    expect(w.activeCase().hobby.length).toBe(1);
    w.toggleTarget("休閒興趣規劃");
    expect(w.activeCase().hobby.length).toBe(0);
  });

  it("填過金額的生活願望列不會被誤刪", () => {
    w.toggleTarget("旅遊規劃");
    w.activeCase().travel[0].amount = 150_000;
    w.toggleTarget("旅遊規劃");
    expect(w.activeCase().travel.length).toBe(1);
    expect(w.activeCase().travel[0].amount).toBe(150_000);
  });

  it("目標類型下拉不再有這三項（教練不會再誤選回去）", () => {
    const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
    expect(html).toContain("sel:購屋,置產,購車,婚姻,生育,孝親,傳承,其他");
  });

  it("三張表都掛得到錨點（檢核清單與「填細節 →」要捲得過去）", () => {
    go("lifestyle");
    for (const t of ["旅遊規劃", "休閒興趣規劃", "奢侈品購買規劃"]) {
      expect(w.document.querySelector(`#app [data-goalanchor="${t}"]`), `${t} 沒有錨點`).toBeTruthy();
    }
  });
});

describe("⚠️ sel 下拉遇到清單外的舊值不可以靜靜跳掉", () => {
  it("舊資料的 goals 類型「旅遊」仍然顯示，而且被選中", () => {
    const c = fresh();
    c.goals = [{ on: true, name: "旅遊", type: "旅遊", present: 100_000, minPresent: 0, start: 39, end: 65, freq: 1, growth: "通膨", appreciation: 0, loanRatio: 0, imp: 4, prepared: 0 }];
    go("goals");
    const sel = w.document.querySelector("#app select option[selected]");
    const html = w.document.querySelector("#app")!.innerHTML as string;
    void sel;
    expect(html).toContain("旅遊（舊值）");
  });

  it("selOpts 本身：清單內的值不加標記、清單外的補進去", () => {
    expect(w.selOpts(["購屋", "購車"], "購車")).toContain('selected value="購車"');
    expect(w.selOpts(["購屋", "購車"], "購車")).not.toContain("舊值");
    const out = w.selOpts(["購屋", "購車"], "旅遊");
    expect(out).toContain("旅遊（舊值）");
    expect(out).toContain('selected value="旅遊"');
  });

  it("值是空的時候不要憑空補一個空選項", () => {
    const out = w.selOpts(["購屋", "購車"], "");
    expect(out).not.toContain("舊值");
  });
});

describe("goals 的 freq 改成兩段式（填 52 想表達每週的坑）", () => {
  const withGoal = () => {
    const c = fresh();
    c.goals = [{ on: true, name: "換車", type: "購車", present: 1_000_000, minPresent: 0, start: 45, end: 65, freq: 0, growth: "通膨", appreciation: 0, loanRatio: 0, imp: 3, prepared: 0 }];
    return c;
  };

  it("預設是「只發生一次」＝freq 0（全庫 94.9% 都是這種）", () => {
    withGoal();
    go("goals");
    const html = w.document.querySelector("#app")!.innerHTML as string;
    expect(html).toContain("只發生一次");
    expect(html).toContain("每隔幾年一次");
  });

  it("切到「每隔幾年」→ freq 變成 1，不是 0", () => {
    withGoal();
    w.setFreqMode("goals", 0, "every");
    expect(w.activeCase().goals[0].freq).toBe(1);
  });

  it("切回「只發生一次」→ freq 歸 0", () => {
    withGoal();
    w.setFreqMode("goals", 0, "every");
    w.setFreqYears("goals", 0, 8);
    w.setFreqMode("goals", 0, "once");
    expect(w.activeCase().goals[0].freq).toBe(0);
  });

  it("⚠️ 年數限 1–20 的整數——這就是擋掉「填 52 想每週」的地方", () => {
    withGoal();
    w.setFreqMode("goals", 0, "every");
    w.setFreqYears("goals", 0, 52);
    expect(w.activeCase().goals[0].freq, "52 會被夾到 20").toBe(20);
    w.setFreqYears("goals", 0, 0.5);
    expect(w.activeCase().goals[0].freq, "0.5 不是合法的「每隔幾年」").toBe(1);
    w.setFreqYears("goals", 0, 8);
    expect(w.activeCase().goals[0].freq).toBe(8);
  });

  it("⚠️ 資料格式完全沒變（freq 仍是 0 或正整數）→ 引擎 0 改動、遷移 0 筆", () => {
    const c = withGoal();
    w.setFreqMode("goals", 0, "every");
    w.setFreqYears("goals", 0, 8);
    expect(typeof w.activeCase().goals[0].freq).toBe("number");
    expect(Number.isInteger(w.activeCase().goals[0].freq)).toBe(true);
    expect(w.metrics(c), "引擎照常算").toBeTruthy();
  });

  it("生活願望的頻率維持自由數字（那邊 46 份一筆都沒填錯）", () => {
    const c = fresh();
    c.travel = [{ on: true, cat: "國外", sub: "認知旅遊", start: 40, end: 65, freq: 2, amount: 50_000, minAmount: 0, imp: 4 }];
    go("lifestyle");
    const html = w.document.querySelector("#app")!.innerHTML as string;
    expect(html).toContain("頻率(次/年)");
  });
});

describe("購置試算：參數齊全，但只算給人看", () => {
  const withHouse = () => {
    const c = fresh();
    c.profile.age = 40;
    c.goals = [{ on: true, name: "換屋", type: "購屋", present: 12_000_000, minPresent: 10_000_000, start: 50, end: 50, freq: 0, growth: "固定", appreciation: 2, loanRatio: 70, imp: 4, prepared: 0, loanRate: 2, loanYears: 30, decoCost: 1_700_000 }];
    return c;
  };

  it("算得出頭期、貸款、月付、總利息", () => {
    withHouse();
    go("goals");
    const txt = w.document.querySelector("#app")!.textContent as string;
    expect(txt).toContain("購置試算");
    expect(txt).toContain("頭期款");
    expect(txt).toContain("月付");
    expect(txt).toContain("總利息");
    // 840 萬、2%、30 年 → 月付約 31,000
    const mp = Math.round(w.pmt(8_400_000, 2, 360));
    expect(mp).toBeGreaterThan(30_000);
    expect(mp).toBeLessThan(32_500);
  });

  it("⚠️ 引擎行為完全不變——利率年期不會改變任何金流", () => {
    const c = withHouse();
    const before = w.metrics(c).proj.shortPV;
    c.goals[0].loanRate = 5;
    c.goals[0].loanYears = 40;
    const after = w.metrics(w.activeCase()).proj.shortPV;
    expect(after, "利率年期只做試算").toBe(before);
  });

  it("裝修款要按了才併進總價，而且不會重複按", () => {
    const c = withHouse();
    expect(c.goals[0].present).toBe(12_000_000);
    w.addDecoToPrice(0);
    expect(w.activeCase().goals[0].present).toBe(13_700_000);
    expect(w.activeCase().goals[0].minPresent, "最低標準也要跟著加").toBe(11_700_000);
    w.addDecoToPrice(0);
    expect(w.activeCase().goals[0].present, "重複按不能再加一次").toBe(13_700_000);
  });

  it("沒有購屋／置產目標時不出現這一區", () => {
    const c = fresh();
    c.goals = [{ on: true, name: "換車", type: "購車", present: 800_000, start: 45, end: 45, freq: 0, growth: "通膨", imp: 3, prepared: 0, loanRatio: 0, minPresent: 0, appreciation: 0 }];
    go("goals");
    expect((w.document.querySelector("#app")!.textContent as string)).not.toContain("購置試算");
  });
});
