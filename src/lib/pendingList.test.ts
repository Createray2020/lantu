import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 待補齊清單（取代原本的「資料檢核表」）— 2026/08/31 Ray 拍板。
 *
 * Ray：「資料檢核表的目的是什麼？基本上我們應該會有一個待補齊的清單就可以了，
 *      然後這個清單內容要在客戶那邊的待辦清單裡面出現。
 *      我們也不會一開始先收集完文件才開始。」
 *
 * 舊的那張是九項**寫死的文件清單**（填數量與備註），而且全站沒有任何一支讀 c.docCheck——
 * 填了不會影響任何結果。新的這份：自動偵測缺件 → 教練勾選 → 送進 action_items → 客戶端看得到。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blank(): any {
  // newCase() 的陣列全是空的 —— 正好是「什麼都還沒問」的那一刻
  const c = w.migrateCase(w.newCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.dataTab = "intent";
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filled(): any {
  const c = w.migrateCase(w.sampleCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  return c;
}
const ids = () => w.pendingItems(w.activeCase()).map((x: { id: string }) => x.id);

beforeEach(() => { blank(); });

describe("自動偵測：教練不用自己維護打勾", () => {
  it("全新的客戶：該缺的都被抓出來", () => {
    const got = ids();
    for (const k of ["income", "expense", "asset", "insSalary", "nhiSalary", "pension", "policy", "credit", "risk"]) {
      expect(got, `${k} 應該被列為待補`).toContain(k);
    }
  });

  it("每一項都說得出「缺了會影響什麼」——不然教練沒有理由去要", () => {
    for (const x of w.pendingItems(w.activeCase())) {
      expect(x.why.length, x.id).toBeGreaterThan(6);
      expect(x.ask.length, x.id).toBeGreaterThan(4);
    }
  });

  it("填進去就自己消失（示範客戶剩下的才是真的缺）", () => {
    filled();
    const before = ids();
    expect(before).not.toContain("income");
    expect(before).not.toContain("asset");
    // 反過來：清掉信用評分，credit 那一項就冒出來
    w.setCreditScore("");
    expect(ids()).toContain("credit");
    w.setCreditScore(720);
    expect(ids()).not.toContain("credit");
  });

  it("⚠️ 偵測的是「真的空著」的欄位——退休年齡有預設的 65，所以抓的是退休生活費", () => {
    const c = blank();
    expect(ids()).toContain("retireLiving");
    expect(ids(), "預設值不算缺件，否則永遠催不完").not.toContain("retireAge");
    c.retire.monthLiving = 55_000;
    expect(ids()).not.toContain("retireLiving");
  });

  it("⚠️ 沒有子女成員時不會催子女教育（不要製造假缺件）", () => {
    expect(ids()).not.toContain("edu");
    const c = w.activeCase();
    c.members.push({ name: "小明", role: "子女", age: 8 });
    expect(ids()).toContain("edu");
  });

  it("⚠️ 沒開企業主體就不催公司數字", () => {
    expect(ids()).not.toContain("biz");
    const c = w.activeCase();
    c.intent.entities = { company: true };
    c.companies = [w.newCompany()];
    expect(ids()).toContain("biz");
  });
});

describe("教練自訂項目", () => {
  it("加進去、列出來、刪得掉", () => {
    w.addPendingCustom("提供 114 年度綜所稅申報書");
    expect(ids()).toContain("cus:0");
    expect(w.pendingItems(w.activeCase()).find((x: { id: string }) => x.id === "cus:0").name)
      .toBe("提供 114 年度綜所稅申報書");
    w.delPendingCustom(0);
    expect(ids()).not.toContain("cus:0");
  });

  it("同一項不會重複加", () => {
    w.addPendingCustom("薪資單");
    w.addPendingCustom("薪資單");
    expect(w.activeCase().pendingCustom.length).toBe(1);
  });

  it("空字串不會變成一列", () => {
    w.addPendingCustom("   ");
    expect(w.activeCase().pendingCustom || []).toEqual([]);
  });

  it("常見文件（原本那九項）改成一鍵加入，而不是一張要填數量的表", () => {
    expect(w.DOC_QUICK).toContain("人壽險保單");
    expect(w.DOC_QUICK.length).toBe(9);
    const h = w.pendingSec(w.activeCase()) as string;
    expect(h).toContain("常見文件（點一下加入）");
    expect(h).not.toContain("諮詢前需收集的文件");     // 舊標題不該再出現
  });
});

describe("勾選 → 送到客戶待辦", () => {
  it("勾選存得住（教練換分頁回來不會不見）", () => {
    w.toggleAsk("income");
    expect(w.activeCase().askClient.income).toBe(true);
    w.toggleAsk("income");
    expect(w.activeCase().askClient.income).toBeFalsy();
  });

  it("送出的是「請客戶做什麼」那一句，不是內部欄位名", () => {
    const sent: string[][] = [];
    w.LANTU_SEND_TODOS = (t: string[]) => sent.push(t);
    w.render();
    w.toggleAsk("insSalary");
    w.toggleAsk("policy");
    w.sendPendingToClient();
    expect(sent.length).toBe(1);
    expect(sent[0]).toContain("提供勞保投保薪資（勞保局 e 化服務或勞保局 App 查得到）");
    expect(sent[0].length).toBe(2);
    delete w.LANTU_SEND_TODOS;
  });

  it("一項都沒勾就按：說出來，不要靜靜地什麼都沒發生", () => {
    w.render();
    w.sendPendingToClient();
    expect(w.document.getElementById("pendMsg").textContent).toContain("先勾選");
  });

  it("單機預覽（沒有父層）也要講清楚，而不是按了沒反應", () => {
    w.render();
    w.toggleAsk("income");
    w.sendPendingToClient();
    expect(w.document.getElementById("pendMsg").textContent).toContain("單機預覽");
  });
});

describe("清單本身的態度：缺件不擋規劃", () => {
  it("標題那一行就寫明「缺件不擋規劃」", () => {
    expect(w.pendingSec(w.activeCase())).toContain("缺件不擋規劃");
  });

  it("全部補齊時說得出「目前偵測不到缺件」", () => {
    // 直接把偵測全部餵飽比造一份完美 case 穩：這裡驗的是空清單的呈現
    const c = blank();
    const orig = w.GAP_CHECKS.slice();
    w.GAP_CHECKS.length = 0;
    expect(w.pendingSec(c)).toContain("目前偵測不到缺件");
    w.GAP_CHECKS.push(...orig);
  });
});
