import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 表格的新增入口搬到表格最後一列（2026/09/25 Ray）：
 * 「新增的部分直接在現在新增的那一個區塊，不用再移到右上」。
 * 新列長在「＋ 新增一列」正上方；空表時那一列兼「尚無資料」提示。
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
  c.lifeGoals = [];
  w.app.cases = [c];
  w.app.activeId = c.id;
});

const frag = (html: string) => {
  const d = w.document.createElement("div");
  d.innerHTML = html;
  return d;
};
const LG_COLS = [["name", "目標", "text"], ["note", "備註", "text"]];

describe("共用表格 tableSec", () => {
  it("標題列不再有新增鈕，新增鈕是表格最後一列", () => {
    const d = frag(w.tableSec("人生財務目標清單", "lifeGoals", [], LG_COLS));
    expect(d.querySelector("h4 button.add")).toBeNull();
    const rows = d.querySelectorAll("table tr");
    const last = rows[rows.length - 1];
    expect(last.classList.contains("addtr")).toBe(true);
    expect(last.querySelector("button.add")).toBeTruthy();
  });

  it("空表：最後一列兼提示「尚無資料」；有資料時不再顯示那句", () => {
    expect(frag(w.tableSec("t", "lifeGoals", [], LG_COLS)).querySelector(".addtr")!.textContent).toContain("尚無資料");
    const d = frag(w.tableSec("t", "lifeGoals", [{ name: "買房", note: "" }], LG_COLS));
    expect(d.querySelector(".addtr")!.textContent).not.toContain("尚無資料");
    // 新增列之前就是那一筆資料列
    const rows = [...d.querySelectorAll("table tr")];
    expect(rows).toHaveLength(3);
  });

  it("按下去真的多一列，而且新列在新增鈕的正上方", () => {
    const btn = frag(w.tableSec("t", "lifeGoals", w.activeCase().lifeGoals, LG_COLS)).querySelector(".addtr button") as HTMLElement;
    w.eval(btn.getAttribute("onclick") as string);
    expect(w.activeCase().lifeGoals).toHaveLength(1);
    const d = frag(w.tableSec("t", "lifeGoals", w.activeCase().lifeGoals, LG_COLS));
    const rows = [...d.querySelectorAll("table tr")];
    expect(rows[rows.length - 2].querySelector("input")).toBeTruthy();
    expect(rows[rows.length - 1].classList.contains("addtr")).toBe(true);
  });

  it("colspan 蓋滿整列（欄數＋刪除欄）", () => {
    const td = frag(w.tableSec("t", "lifeGoals", [], LG_COLS)).querySelector(".addtr td")!;
    expect(td.getAttribute("colspan")).toBe(String(LG_COLS.length + 1));
  });
});

describe("收支資債五張表", () => {
  it("面板標題列沒有新增鈕，每張表最後一列都是新增列", () => {
    const c = w.activeCase();
    const html = [w.finIncTable(c), w.finExpTable(c), w.finSavTable(c), w.finAstTable(c), w.finLiaTable(c)];
    const arrs = ["incomes", "expenses", "savings", "assets", "liabilities"];
    html.forEach((h: string, i: number) => {
      const tr = frag(h).querySelector(".addtr button")!;
      expect(tr.getAttribute("onclick"), arrs[i]).toContain(`addRow('${arrs[i]}')`);
    });
  });

  it("全檔已無「標題列 ＋ 新增」的寫法殘留", () => {
    expect(HTML).not.toMatch(/<\/div>'\+sortBtn\([^)]*\)\+'<button class="add"/);
    expect(HTML).not.toMatch(/點「＋ 新增」/);
  });
});
