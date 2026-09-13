import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 諮詢狀態列（底列）的 UI 測試 —— 2026/09/13 的四項修補。
 *
 * 這裡釘住的是四件「壞掉也不會噴錯」的事：
 *   1. 結束諮詢的視窗**不能**因為這一場沒有「決定」類註記就整個跳過——
 *      跳過的話，收尾那一段（摘要的主體）一次都問不到。
 *   2. 帶議程是清單勾選，預設只勾 30 天內。原本是一句 confirm()：看不到內容，
 *      而且會把三個月前的註記一起吸進今天這一場。
 *   3. 自動開場只在「人真的動過」之後才發生。載入時的正規化存檔也會呼叫 save()，
 *      少了這道閘，教練只是進來看一眼資料就被開了一場諮詢。
 *   4. 寫第一則註記時，開場的訊息要排在註記前面送出去，否則那一則會掉進「日常維護」。
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
const DAY = 24 * 3600 * 1000;
const note = (o: Record<string, unknown>) => ({
  id: "n" + Math.random().toString(36).slice(2), block: "fin.income", kind: "basis",
  text: "隨手記的一句", visible: false, sessId: null, at: "08/01 10:00", ...o,
});

describe("結束諮詢：沒有「決定」也要問收尾", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  beforeAll(async () => { w = await boot("https://lantu.test/"); });
  beforeEach(() => {
    const c = w.app.cases[0];
    c.sess = { id: "s1", start: "10:30", date: "2026-09-13", before: { shortPV: 0, net: 0 }, snap: null };
    c.notes = [];
    w.render();
  });

  it("⚠️ 這一場只有「依據」沒有「決定」時，視窗照開，收尾欄位在", () => {
    w.app.cases[0].notes = [note({ sessId: "s1", kind: "basis" })];
    w.LN.session();
    const modal = w.document.querySelector("#lnMask .lnmodal");
    expect(w.document.getElementById("lnMask").className, "視窗要開著").toContain("on");
    expect(modal.querySelector("#lnClosing"), "收尾那一格才是摘要的主體").toBeTruthy();
    expect(modal.textContent).toContain("結束這一場諮詢");
    expect(modal.querySelectorAll(".lnpick").length, "沒有決定就沒有可勾的").toBe(0);
    expect(modal.textContent, "合規警語是講「勾選的內容」的，沒得勾就不該出現").not.toContain("不得含商品推薦");
  });

  it("有「決定」時維持原本的批次勾選＋合規警語", () => {
    w.app.cases[0].notes = [note({ sessId: "s1", kind: "decision", text: "先把循環利率那筆清掉" })];
    w.LN.session();
    const modal = w.document.querySelector("#lnMask .lnmodal");
    expect(modal.querySelectorAll(".lnpick").length).toBe(1);
    expect(modal.textContent).toContain("不得含商品推薦");
    expect(modal.querySelector("#lnClosing")).toBeTruthy();
  });
});

describe("帶議程：清單勾選，預設只勾 30 天內", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  beforeAll(async () => { w = await boot("https://lantu.test/"); });

  it("⚠️ 30 天前的預設不勾，但列出來讓人自己決定", () => {
    const c = w.app.cases[0];
    c.sess = null;
    c.notes = [
      note({ id: "n-new", text: "問他房貸利率是不是浮動的", atMs: Date.now() - 2 * DAY }),
      note({ id: "n-old", text: "三個月前想到的那件事", atMs: Date.now() - 90 * DAY }),
    ];
    w.render();
    w.LN.session();
    const boxes = [...w.document.querySelectorAll("#lnMask .lnpick input")];
    expect(boxes.length, "兩則都要列出來").toBe(2);
    expect(boxes.find((b) => b.dataset.nid === "n-new").checked).toBe(true);
    expect(boxes.find((b) => b.dataset.nid === "n-old").checked, "舊的預設不勾").toBe(false);
    expect(w.document.querySelector("#lnMask .lnmodal").textContent).toContain("30 天前");
  });

  it("勾出來的那幾則才會歸到這一場，沒勾的留在日常維護", () => {
    const c = w.app.cases[0];
    c.sess = null;
    c.notes = [note({ id: "a" }), note({ id: "b" })];
    w.render();
    w.LN.session();
    [...w.document.querySelectorAll("#lnMask .lnpick input")].forEach((b) => { b.checked = b.dataset.nid === "a"; });
    w.LN.adoptGo("start");
    expect(c.sess, "要開場").toBeTruthy();
    expect(c.notes.find((x: { id: string }) => x.id === "a").sessId).toBe(c.sess.id);
    expect(c.notes.find((x: { id: string }) => x.id === "b").sessId, "沒勾的不動").toBe(null);
  });

  it("「不帶，直接開始」就是一則都不收", () => {
    const c = w.app.cases[0];
    c.sess = null;
    c.notes = [note({ id: "a" })];
    w.render();
    w.LN.session();
    w.LN.adoptGo("start", true);
    expect(c.sess).toBeTruthy();
    expect(c.notes[0].sessId).toBe(null);
  });
});

describe("這不是諮詢：註記回到日常維護，場次不留下", () => {
  it("取消後場次消失，註記解綁但還在", async () => {
    const w = await boot("https://lantu.test/");
    w.confirm = () => true;
    const c = w.app.cases[0];
    c.sess = { id: "s9", start: "10:30", date: "2026-09-13", before: null, snap: null };
    c.notes = [note({ sessId: "s9" })];
    w.render();
    w.LN.cancelSess();
    expect(c.sess).toBe(null);
    expect(c.notes.length, "註記不能跟著消失").toBe(1);
    expect(c.notes[0].sessId).toBe(null);
  });
});

describe("自動開場（embed）", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  let sent: Record<string, unknown>[];
  beforeEach(async () => {
    w = await boot("https://lantu.test/?embed=1");
    sent = [];
    w.postMessage = (m: Record<string, unknown>) => { sent.push(m); };  // toParentLN 走 parent.postMessage
  });
  const starts = () => sent.filter((m) => m.type === "lantu:session" && m.op === "start");

  it("⚠️ 沒有人碰過畫面之前的存檔不開場（載入時的正規化存檔就是這種）", () => {
    w.save();
    expect(starts().length, "只是載入就開一場諮詢是最糟的誤判").toBe(0);
  });

  it("人真的動過之後的第一次存檔就開場，而且不吸任何日常維護註記", () => {
    w.document.dispatchEvent(new w.KeyboardEvent("keydown", { bubbles: true }));
    w.save();
    expect(starts().length).toBe(1);
    expect(starts()[0].adopt, "要帶什麼進議程是人的決定").toEqual([]);
  });

  it("⚠️ 開場只送一次：父層還沒回場次之前再存檔也不會重送", () => {
    w.document.dispatchEvent(new w.KeyboardEvent("keydown", { bubbles: true }));
    w.save(); w.save(); w.save();
    expect(starts().length).toBe(1);
  });

  it("⚠️⚠️ 第一則註記：開場的訊息要排在註記前面送出去", () => {
    w.LN.typing("fin.income", "他說想在 55 歲收手");
    w.LN.add("fin.income");
    const kinds = sent.map((m) => m.type + ":" + m.op);
    expect(kinds.indexOf("lantu:session:start"), "沒有開場訊息＝這一則會掉進日常維護").toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf("lantu:session:start")).toBeLessThan(kinds.indexOf("lantu:note:add"));
  });

  /** 照父層真正的那條路送（listenParent 只認 parent 且比對 origin）。 */
  const push = (payload: Record<string, unknown>) =>
    w.dispatchEvent(new w.MessageEvent("message", { data: { type: "lantu:notes", ...payload }, source: w, origin: "https://lantu.test" }));

  it("唯讀（到期或共同執案）不會被自動開場", () => {
    push({ noteAccess: "viewer", notes: [] });
    w.document.dispatchEvent(new w.KeyboardEvent("keydown", { bubbles: true }));
    w.save();
    expect(starts().length).toBe(0);
  });

  it("⚠️ 場次回來就解除等待；那一場結束之後還能再自動開下一場", () => {
    w.document.dispatchEvent(new w.KeyboardEvent("keydown", { bubbles: true }));
    w.save();
    expect(starts().length).toBe(1);
    // 父層把場次推回來 → 進行中，這時再存檔不該重開
    push({ notes: [], session: { id: "s1", startedAt: new Date(), metricsBefore: null }, past: [] });
    w.save();
    expect(starts().length).toBe(1);
    // 結束之後（session 變 null）＝下一場又可以自動開
    push({ notes: [], session: null, past: [] });
    w.save();
    expect(starts().length, "旗標沒放掉的話，自動開場會安靜地再也不發生").toBe(2);
  });

  it("⚠️ 自動封場又沒整理的那一場，底列要給得出出口", () => {
    push({
      notes: [{ id: "n1", sessionId: "sold", blockKey: "fin.income", kind: "basis", body: "那天談到的房貸", visible: false, authorAccess: "owner", authorName: null, createdAt: new Date("2026-09-11T02:30:00Z") }],
      session: null,
      past: [{ id: "sold", startedAt: new Date("2026-09-11T02:30:00Z"), endedAt: new Date("2026-09-11T20:00:00Z"), closeReason: "auto", reviewId: null, draftSummary: null }],
    });
    const bar = w.document.getElementById("lnSessBar");
    expect(bar.textContent).toContain("補整理上一場");
    expect(bar.textContent, "日期是那一天，不是 'Fri Sep 11' 這種 Date.toString() 切出來的東西").toContain("2026-09-11");
    w.LN.fixup("sold");
    expect(sent.some((m) => m.type === "lantu:session" && m.op === "fixup" && m.sessionId === "sold")).toBe(true);
  });

  it("已經存成紀錄的那一場不會再叫人去補整理", () => {
    push({
      notes: [{ id: "n1", sessionId: "sold", blockKey: "fin.income", kind: "basis", body: "x", visible: false, authorAccess: "owner", authorName: null, createdAt: new Date() }],
      session: null,
      past: [{ id: "sold", startedAt: new Date(), endedAt: new Date(), closeReason: "auto", reviewId: "rv1", draftSummary: null }],
    });
    expect(w.document.getElementById("lnSessBar").textContent).not.toContain("補整理上一場");
  });

  it("底列在進行中會標明是系統自動開的，並給一顆「這不是諮詢」", () => {
    w.document.dispatchEvent(new w.KeyboardEvent("keydown", { bubbles: true }));
    w.save();
    push({ notes: [], session: { id: "s1", startedAt: new Date(), metricsBefore: null }, past: [] });
    const bar = w.document.getElementById("lnSessBar");
    expect(bar.textContent).toContain("諮詢進行中（自動開始）");
    expect(bar.textContent).toContain("這不是諮詢");
  });
});
