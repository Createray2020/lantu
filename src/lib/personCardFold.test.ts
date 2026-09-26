import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 人物卡「留基本資訊、其餘點開再展開」（2026/09/26 Ray：家庭成員拉太長）。
 * 卡片只攤標題列＋身分資料；工作與投保／家庭分攤／族譜／背景收進 details.pcmore，
 * 折疊列帶摘要；展開狀態按成員記在 PC_OPEN，重畫不關。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
});

beforeEach(() => {
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  w.PC_OPEN = {}; w.app.treeSel = "";
  w.app.activeTab = "data"; w.app.dataTab = "family"; w.render();
});

const $$ = (sel: string) => [...w.document.querySelectorAll(sel)] as HTMLElement[];

describe("人物卡折疊", () => {
  it("卡片預設只攤身分資料，其餘四塊收在「更多」裡（族譜選誰就看誰的卡）", () => {
    const c0 = w.activeCase();
    const cards: HTMLElement[] = [];
    for (const m of c0.members) { w.app.treeSel = m.mid; w.render(); cards.push($$(".pcard")[0]); }
    expect(cards.length).toBeGreaterThan(1);
    for (const c of cards) {
      const more = c.querySelector("details.pcmore") as HTMLDetailsElement;
      expect(more, "要有更多折疊列").toBeTruthy();
      expect(more.open).toBe(false);
      // 身分資料在外面，工作／分攤／族譜在裡面
      expect(c.querySelector(".pbody > .subhd")?.textContent).toBe("身分資料");
      const inside = more.textContent as string;
      expect(inside).toContain("家庭分攤");
      expect(inside).toContain("族譜關係");
    }
  });

  it("折疊列帶摘要：本人顯示工作類別與月薪", () => {
    const self = $$(".pcard.self")[0];
    const sum = self.querySelector(".pcsum")?.textContent as string;
    expect(sum).toBeTruthy();
    expect(sum).toContain(w.activeCase().profile.jobType || "一般就業者");
  });

  it("展開後重畫不會關回去（PC_OPEN 按成員記）", () => {
    const self = $$(".pcard.self")[0];
    const more = self.querySelector("details.pcmore") as HTMLDetailsElement;
    more.open = true;
    more.dispatchEvent(new w.Event("toggle"));
    expect(Object.keys(w.PC_OPEN).length).toBe(1);
    w.render();
    expect(($$(".pcard.self")[0].querySelector("details.pcmore") as HTMLDetailsElement).open).toBe(true);
    // 別的人不受影響
    const other = w.activeCase().members.find((m: { role: string }) => m.role !== "本人");
    w.app.treeSel = other.mid; w.render();
    expect(($$(".pcard")[0].querySelector("details.pcmore") as HTMLDetailsElement).open).toBe(false);
    w.app.treeSel = "";
  });

  it("角色未指定的警示留在外面，不被收進去", () => {
    const c = w.activeCase();
    c.members.push({ name: "新成員", role: "", gender: "男", age: 10, expRatio: 0, indepAge: "" });
    w.ensureMemberIds(c); w.app.treeSel = c.members[c.members.length - 1].mid;
    w.render();
    const card = $$(".pcard").pop()!; // 新增的人自動被選到
    expect(card.textContent).toContain("新成員");
    const warn = card.querySelector(".pbody > .note");
    expect(warn?.textContent).toContain("還沒指定");
  });
});
