import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 分析模組「後台預設順序」的 UI 測試。
 *
 * 釘住的是三層語意，不是畫面長相：
 *   1. 沒調過的客戶 → 吃後台預設（順序與預設收起）。
 *   2. 調過的客戶 → 後台之後改預設，不回頭覆蓋他。
 *   3. 按「恢復預設」→ 重新吃後台當下那一份（不是程式寫死的那一份）。
 *
 * 另外守兩個容易靜靜壞掉的點：
 *   - 「只點過展開」不算調過順序／隱藏（舊版 anPatch 會把三個維度一起寫回去，
 *     等於任何人展開過一次，後台預設就再也套不進去）。
 *   - storage key 已換版成 lantu.an2.，舊 key 的殘留偏好一律不再讀。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
});

beforeEach(() => {
  w.localStorage.clear();
  w.LANTU_AN_DEFAULT = null;
  w.app.activeTab = "analysis";
  w.render();
});

const order = (): string[] => (w.AN_VIEW?.order ?? []) as string[];
const chipKeys = (): string[] =>
  [...w.document.querySelectorAll("#anChips .anchip")].map((el) => (el as HTMLElement).dataset.k as string);
const shownCards = (): string[] =>
  [...w.document.querySelectorAll(".anmod")].map((el) => (el as HTMLElement).dataset.k as string);
const setDefault = (o: string[], hidden: string[] = []) => {
  w.LANTU_AN_DEFAULT = { order: o, hidden };
  w.render();
};

describe("沒調過的客戶：吃後台預設", () => {
  it("沒有後台預設時照模組表本身的順序", () => {
    expect(order().length).toBeGreaterThan(10);
    expect(order()[0]).toBe("tables"); // sampleCase 沒有企業主體，biz 不出現
  });

  it("後台把某個模組排到第一個，畫面就從它開始", () => {
    const base = order();
    const moved = base[5];
    setDefault([moved, ...base.filter((k) => k !== moved)]);
    expect(order()[0]).toBe(moved);
    expect(chipKeys()[0]).toBe(moved);
  });

  it("後台設「預設收起」的模組不出現在卡片區，但模組列還在（教練按 ＋ 可叫回來）", () => {
    const base = order();
    setDefault(base, ["mc"]);
    expect(shownCards()).not.toContain("mc");
    expect(chipKeys()).toContain("mc");
  });

  it("後台順序漏掉的新模組不會消失，會接在後面", () => {
    const base = order();
    setDefault(base.slice(0, 3)); // 後台只設了前三個
    expect(order().slice(0, 3)).toEqual(base.slice(0, 3));
    expect(order().length).toBe(base.length);
  });
});

describe("調過的客戶：後台再改預設也不覆蓋", () => {
  it("教練拖過順序之後，後台換一份預設，畫面維持教練那份", () => {
    const base = order();
    setDefault(base);
    w.anMove(3, 0); // 教練自己把第 4 個拖到最前面
    const mine = order();
    expect(mine[0]).toBe(base[3]);

    setDefault([...base].reverse()); // 後台整個倒過來
    expect(order()).toEqual(mine);
  });

  it("教練把後台預設收起的模組叫回來之後，後台的 hidden 不會再蓋回去", () => {
    const base = order();
    setDefault(base, ["mc"]);
    expect(shownCards()).not.toContain("mc");
    w.anToggleHide("mc"); // 教練按 ＋ 把它叫回來
    expect(shownCards()).toContain("mc");

    setDefault(base, ["mc"]); // 後台再存一次同一份預設
    expect(shownCards()).toContain("mc");
  });

  it("⚠️ 只點過「展開」不算調過：後台預設照樣套得進去", () => {
    const base = order();
    setDefault(base, ["mc"]);
    w.anExpandAll(true); // 教練只是全部展開看一看
    const moved = base[4];
    setDefault([moved, ...base.filter((k) => k !== moved)], ["mc"]);
    expect(order()[0]).toBe(moved);
    expect(shownCards()).not.toContain("mc");
  });
});

describe("恢復預設：回到後台當下那一份", () => {
  it("清掉個人偏好之後重新吃後台預設（不是程式寫死的順序）", () => {
    const base = order();
    setDefault(base);
    w.anMove(3, 0);
    expect(order()[0]).toBe(base[3]);

    const target = base[7];
    w.LANTU_AN_DEFAULT = { order: [target, ...base.filter((k) => k !== target)], hidden: ["mc"] };
    w.anResetPref();
    expect(order()[0]).toBe(target);
    expect(shownCards()).not.toContain("mc");
  });
});

describe("storage key 換版", () => {
  it("舊 key（lantu.an.）的殘留偏好不再被讀，後台預設照樣生效", () => {
    const base = order();
    const id = w.activeCase().id;
    w.localStorage.setItem("lantu.an." + id, JSON.stringify({ order: [...base].reverse(), hidden: [], open: [] }));
    const moved = base[6];
    setDefault([moved, ...base.filter((k) => k !== moved)]);
    expect(order()[0]).toBe(moved);
  });

  it("新 key（lantu.an2.）才是這位客戶的偏好落點", () => {
    setDefault(order());
    w.anMove(2, 0);
    const id = w.activeCase().id;
    expect(w.localStorage.getItem("lantu.an2." + id)).toBeTruthy();
    expect(w.localStorage.getItem("lantu.an." + id)).toBeNull();
  });
});
