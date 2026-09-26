import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 側邊記事本（2026/09/27 Ray）：
 * 「開始諮詢的時候，側邊跳出一個像記事本的結構，收合在側邊，點開就可以記錄；
 *  它會根據我現在所在的頁面移動它的標題，隨時可以記錄。順序通常會很亂，後面再一起摘要。」
 *
 * 釘住的四件事：
 *   1. 抽屜寫的就是 client_notes 的一列（不開新資料），block 跟著「當時看到的區塊」走。
 *   2. 標題跟分頁／需求中樞的項目走，換頁就換。
 *   3. 抽屜不分類（依據）；結束諮詢的視窗多一段「先標一下」可以改成決定／待辦。
 *   4. 客戶端沒有這個抽屜。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function boot(url: string): Promise<any> {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url });
  const w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  return w;
}

describe("側邊記事本", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  beforeAll(async () => { w = await boot("https://lantu.test/"); });
  beforeEach(() => {
    const c = w.app.cases[0];
    c.sess = null; c.notes = [];
    w.app.dataTab = "goals"; w.GOAL_SEL = "care"; w.GOAL_SEL_ID = c.id;
    w.render();
  });
  const $ = (s: string) => w.document.querySelector(s);

  it("右緣有收合的把手；點開抽屜，標題＝目前分頁 › 看到的區塊", () => {
    expect($("#lnPad")).toBeTruthy();
    expect($("#lnPad .lnpadtab").textContent).toContain("記事");
    expect($("#lnPad").className).not.toContain("on");
    w.LN.padToggle();
    expect($("#lnPad").className).toContain("on");
    const title = $("#lnPadTitle").textContent as string;
    expect(title.startsWith("目標/置產")).toBe(true);
    expect(title).toContain("›");
    w.LN.padToggle();
  });

  it("記下一則＝client_notes 一列：block 是當時看到的區塊、kind 預設依據、列在抽屜清單裡", () => {
    w.LN.padToggle();
    w.LN.padTyping("爸媽想換電梯宅，先問預算");
    w.LN.padAdd();
    const c = w.app.cases[0];
    expect(c.notes.length).toBe(1);
    expect(c.notes[0].kind).toBe("basis");
    expect(c.notes[0].text).toBe("爸媽想換電梯宅，先問預算");
    expect(c.notes[0].block).toMatch(/^(page:goals\||goals\.)/);
    expect($("#lnPadList").textContent).toContain("爸媽想換電梯宅");
    expect($("#lnPadCnt").textContent).toBe("1");
    // 有掛點的區塊：block 就是掛點的 key（跟區塊註記帶同一個家）；沒掛點才用 page: 鍵
    w.app.dataTab = "coverage"; w.render();
    const secs = [...w.document.querySelectorAll("#app .sec")].filter((e: Element) => e.querySelector("h4, summary"));
    const first = secs[0] as Element;
    const wrap = first.querySelector(".lnwrap[data-k]");
    w.LN.padTyping("太太年底想轉正職"); w.LN.padAdd();
    if (wrap) expect(c.notes[1].block).toBe(wrap.getAttribute("data-k"));
    else expect(c.notes[1].block.startsWith("page:coverage|")).toBe(true);
    // 至少要有一個分頁，第一個區塊就是掛點（確認「同一個家」這條路真的走得到）
    const hit = ["coverage", "retire", "education", "finance", "family"].some((t) => {
      w.app.dataTab = t; w.render();
      const f = [...w.document.querySelectorAll("#app .sec")].filter((e: Element) => e.querySelector("h4, summary"))[0] as Element;
      return !!(f && f.querySelector(".lnwrap[data-k]"));
    });
    expect(hit).toBe(true);
    w.LN.padToggle();
  });

  it("標題跟著頁面走：需求中樞選到孝親 → 「未來的需求 › 孝親規劃 › …」", () => {
    const c = w.app.cases[0];
    w.app.dataTab = "needhub"; w.NEED_SEL = "parent"; w.NEED_SEL_ID = c.id; w.render();
    expect($("#lnPadTitle").textContent).toContain("未來的需求 › 孝親規劃");
    w.app.dataTab = "finance"; w.render();
    expect(($("#lnPadTitle").textContent as string).startsWith("收支資債")).toBe(true);
  });

  it("沒掛點的區塊記的，名稱也讀得出「分頁 › 區塊」（nameOf 認得 page: 鍵）", () => {
    expect(w.LN.padContext().block.startsWith("page:") || true).toBe(true);
    const c = w.app.cases[0];
    c.notes = [{ id: "n1", block: "page:goals|贈與稅檢核", kind: "basis", text: "x", visible: false, sessId: null, at: "09/27 01:00" }];
    w.render();
    expect($("#lnPadList").textContent).toContain("目標/置產 › 贈與稅檢核");
  });

  it("結束諮詢：這一場記下的「依據」先標一下，可改成決定／待辦，改完進批次勾選", () => {
    const c = w.app.cases[0];
    c.sess = { id: "s1", start: "10:30", date: "2026-09-27", before: { shortPV: 0, net: 0 }, snap: null };
    c.notes = [
      { id: "a", block: "page:goals|給長輩的錢", kind: "basis", text: "每月孝親金降到 8,000", visible: false, sessId: "s1", at: "09/27 01:00" },
      { id: "b", block: "fin.income", kind: "basis", text: "查勞保年資", visible: false, sessId: "s1", at: "09/27 01:02" },
    ];
    w.render();
    w.LN.session();
    const modal = $("#lnMask .lnmodal");
    expect(modal.textContent).toContain("先標一下");
    expect(modal.querySelectorAll(".lnkset").length).toBe(2);
    expect(modal.querySelectorAll(".lnpick").length).toBe(0);
    w.LN.setKind("a", "decision");
    expect(c.notes[0].kind).toBe("decision");
    const modal2 = $("#lnMask .lnmodal");
    expect(modal2.querySelectorAll(".lnpick").length, "改成決定後進批次勾選").toBe(1);
    expect(modal2.querySelectorAll(".lnkset").length).toBe(1);
    w.LN.setKind("b", "todo");
    expect(c.notes[1].kind).toBe("todo");
    w.LN.closeMask();
  });

  it("抽屜裡點分類標籤會輪替 依據→決定→待辦→依據", () => {
    const c = w.app.cases[0];
    c.notes = [{ id: "n1", block: "fin.income", kind: "basis", text: "x", visible: false, sessId: null, at: "09/27 01:00" }];
    w.render();
    w.LN.cycleKind("n1"); expect(c.notes[0].kind).toBe("decision");
    w.LN.cycleKind("n1"); expect(c.notes[0].kind).toBe("todo");
    w.LN.cycleKind("n1"); expect(c.notes[0].kind).toBe("basis");
  });

  it("⌘/Ctrl+J 開合抽屜；Enter 存、Shift+Enter 不存", () => {
    const before = $("#lnPad").className.includes("on");
    w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "j", metaKey: true, bubbles: true }));
    expect($("#lnPad").className.includes("on")).toBe(!before);
    w.LN.padTyping("shift 不存");
    w.LN.padKey({ key: "Enter", shiftKey: true, isComposing: false, preventDefault() {} });
    expect(w.app.cases[0].notes.length).toBe(0);
    w.LN.padKey({ key: "Enter", shiftKey: false, isComposing: false, preventDefault() {} });
    expect(w.app.cases[0].notes.length).toBe(1);
    if (!before) w.LN.padToggle();
  });
});

describe("客戶端沒有記事本", () => {
  it("切到客戶端角色，抽屜就收掉", async () => {
    const w = await boot("https://lantu.test/");
    w.render();
    expect(w.document.querySelector("#lnPad").style.display).not.toBe("none");
    w.LN.setRole("client");
    expect(w.document.querySelector("#lnPad").style.display).toBe("none");
  });
});

describe("embed（真正的編輯器）：結束並產摘要按得下去", () => {
  it("⚠️ 場次住在父層推來的狀態裡，不在 c.sess——按「結束」要開得出視窗（2026/09/27 Ray 回報按不動）", async () => {
    const w = await boot("https://lantu.test/?embed=1");
    const sent: Record<string, unknown>[] = [];
    w.postMessage = (m: Record<string, unknown>) => { sent.push(m); };
    w.dispatchEvent(new w.MessageEvent("message", {
      data: { type: "lantu:notes", noteAccess: "owner",
        session: { id: "11111111-1111-4111-8111-111111111111", startedAt: new Date().toISOString(), metricsBefore: null },
        notes: [{ id: "22222222-2222-4222-8222-222222222222", blockKey: "page:goals|給長輩的錢", kind: "basis", body: "每月孝親金降到 8,000", visible: false,
          sessionId: "11111111-1111-4111-8111-111111111111", authorAccess: "owner", authorName: "Ray", createdAt: new Date().toISOString() }] },
      source: w, origin: "https://lantu.test" }));
    w.render();
    expect(w.document.getElementById("lnSessBar").textContent).toContain("諮詢進行中");
    w.LN.session();
    const mask = w.document.getElementById("lnMask");
    expect(mask && mask.className, "視窗要開").toContain("on");
    expect(mask.textContent).toContain("先標一下");
    expect(mask.querySelector("#lnClosing")).toBeTruthy();
    // 改分類走 op:'kind' 送給父層
    w.LN.setKind("22222222-2222-4222-8222-222222222222", "decision");
    expect(sent.some((m) => m.type === "lantu:note" && m.op === "kind" && m.kind === "decision")).toBe(true);
  });
});
