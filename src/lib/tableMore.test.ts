import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 共用表格的「細節」列（2026/09/26 Ray）：
 * 「格子太小，擠在一起了，而且輸入的時候不方便看。把重點抓出來，其他的資訊點擊的時候再跳出來。」
 * 主欄留在列上；tableSec 第 6 個參數列的 key 收進「細節 k/N」鈕，點開在同一列正下方展開。
 * 欄位定義的字面不動（interviewFields.drift 靠字面守欄位）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
});

beforeEach(() => {
  const c = w.migrateCase(w.newCase());
  c.members = [{ name: "本人", role: "本人", gender: "男", age: 40, expRatio: 100, indepAge: "" }];
  c.goals = [{ on: true, name: "", type: "購屋", present: 2000000, minPresent: 1500000, start: 46, end: 46, latest: "", freq: 0, growth: "通膨", appreciation: 0, loanRatio: 80, imp: 2, prepared: "" }];
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.TBL_MORE = {};
});

const frag = (html: string) => { const d = w.document.createElement("div"); d.innerHTML = html; return d; };
const COLS = [["a", "甲", "text"], ["b", "乙", "num"], ["c", "丙", "money"], ["d", "丁", "text"]];

describe("tableSec 的主欄／細節欄", () => {
  it("沒給 more 時完全照舊：每欄一個 th、沒有細節鈕", () => {
    const d = frag(w.tableSec("t", "goals", [{ a: "x" }], COLS));
    expect([...d.querySelectorAll("th")].map((e) => e.textContent)).toEqual(["甲", "乙", "丙", "丁", ""]);
    expect(d.querySelector(".morebtn")).toBeNull();
  });

  it("給了 more：那些欄不在表頭，列尾多一顆「細節 k/N」，k＝已填的細節欄數", () => {
    const d = frag(w.tableSec("t", "goals", [{ a: "x", b: "", c: 100, d: "" }], COLS, "", ["b", "c", "d"]));
    expect([...d.querySelectorAll("th")].map((e) => e.textContent)).toEqual(["甲", "", ""]);
    const btn = d.querySelector(".morebtn");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("細節");
    expect(btn.querySelector(".mcnt").textContent).toBe("1／3");
    expect(d.querySelector(".moretr"), "預設收著").toBeNull();
    // 新增列的 colspan 跟著主欄數走
    expect(d.querySelector(".addtr td").getAttribute("colspan")).toBe("3");
  });

  it("展開後在同一列正下方長出細節區，欄位帶標籤、能寫回資料", () => {
    w.TBL_MORE["goals:0"] = 1;
    const d = frag(w.tableSec("t", "goals", [{ a: "x", b: 5, c: 100, d: "" }], COLS, "", ["b", "c", "d"]));
    const tr = d.querySelector(".moretr");
    expect(tr).toBeTruthy();
    expect(tr.previousElementSibling.classList.contains("hasmore")).toBe(true);
    expect([...tr.querySelectorAll(".morefld > span")].map((e) => e.textContent)).toEqual(["乙", "丙", "丁"]);
    expect(tr.querySelector(".morefld input[type=number]").value).toBe("5");
    expect(d.querySelector(".morebtn").classList.contains("on")).toBe(true);
  });

  it("tblMore 切換展開狀態並重畫；重畫不會把展開狀態關掉", () => {
    w.app.activeTab = "data"; w.app.dataTab = "goals"; w.render();
    expect(w.document.querySelector(".moretr")).toBeNull();
    w.tblMore("goals", 0);
    expect(w.TBL_MORE["goals:0"]).toBe(1);
    expect(w.document.querySelector(".moretr")).toBeTruthy();
    w.render();
    expect(w.document.querySelector(".moretr"), "重畫後還開著").toBeTruthy();
    w.tblMore("goals", 0);
    expect(w.document.querySelector(".moretr")).toBeNull();
  });
});

describe("五張 8 欄以上的表都收了", () => {
  it("目標表：列上只剩 納入／名稱／類型／金額(理想)／起始歲／重要度，其餘在細節", () => {
    w.app.activeTab = "data"; w.app.dataTab = "goals"; w.render();
    w.GOAL_SEL = "house"; w.render();
    const sec = [...w.document.querySelectorAll(".sec h4")].find((h) => h.textContent.startsWith("目標 / 置產 / 願望")).parentElement;
    const ths = [...sec.querySelectorAll("th")].map((e) => e.textContent).filter(Boolean);
    expect(ths).toEqual(["納入", "名稱", "類型", "金額(理想)", "起始歲", "重要度（5最高）"]);
    expect(sec.querySelector(".morebtn .mcnt").textContent).toBe("6／8");
    w.tblMore("goals", 0);
    const labels = [...w.document.querySelectorAll(".moretr .morefld > span")].map((e) => e.textContent);
    expect(labels).toEqual(["金額(最低)", "結束歲", "最晚完成歲", "頻率", "成長依據", "年漲幅%", "貸款成數%", "已備"]);
  });

  it("欄位定義的字面沒動（interviewFields.drift 靠它）", () => {
    expect(HTML).toContain("['end','結束歲','num'],['latest','最晚完成歲','num']");
    expect(HTML).toContain("['latest','最晚起始歲','num']");
  });

  it("旅遊／休閒／奢侈品／連帶保證 都有細節鈕", () => {
    expect(HTML).toContain("var GOAL_MORE=['minPresent','end','latest','freq','growth','appreciation','loanRatio','prepared'];");
    expect(HTML).toContain("'travel',c.travel,");
    expect(HTML).toContain(",'',['latest','end','freq','minAmount']);");
    expect(HTML.match(/,'',\['end','freq','minAmount'\]\);/g)?.length, "休閒與奢侈品").toBe(2);
    expect(HTML).toContain(",['due','coGuarantor','note']);");
  });
});
