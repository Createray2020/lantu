import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PURPOSES, TARGETS, TARGET_META, ALL_SIM, DEFAULT_TARGET, BASE_TABS,
  normalizeIntent, defaultIntent, goalTabs,
} from "./intent";

describe("normalizeIntent · 舊資料遷移", () => {
  it("把舊議題「想買車、買房，進行置產」轉成購車＋購屋目標", () => {
    const r = normalizeIntent({ purposes: ["想買車、買房，進行置產", "有節稅需求，想進行節稅"], targets: [], mustHave: [] });
    expect(r.purposes).toEqual(["有節稅需求，想進行節稅"]);
    expect(r.mustHave).toContain("購車規劃");
    expect(r.mustHave).toContain("購屋規劃");
  });

  it("把舊目標「人生模擬」轉成關注議題", () => {
    const r = normalizeIntent({ purposes: [], targets: ["人生模擬", "退休生活規劃"], mustHave: [] });
    expect(r.purposes).toEqual([ALL_SIM]);
    expect(r.mustHave).toEqual(["退休生活規劃"]);
  });

  it("選了＝必達：targets 與 mustHave 合成同一組集合", () => {
    const r = normalizeIntent({ purposes: [], targets: ["旅遊規劃", "退休生活規劃"], mustHave: ["退休生活規劃"] });
    expect(r.mustHave).toEqual(["退休生活規劃", "旅遊規劃"]); // 原本排過的在前，其餘依 TARGETS 序補上
    expect(r.targets).toEqual(r.mustHave);
  });

  it("保留使用者拖曳出來的順序", () => {
    const r = normalizeIntent({ purposes: [], targets: ["購屋規劃", "退休生活規劃", "旅遊規劃"], mustHave: ["旅遊規劃", "購屋規劃", "退休生活規劃"] });
    expect(r.mustHave).toEqual(["旅遊規劃", "購屋規劃", "退休生活規劃"]);
  });

  it("丟掉已不存在的選項，且不炸在 null / 缺欄位", () => {
    expect(normalizeIntent(null).mustHave).toEqual([]);
    expect(normalizeIntent({}).purposes).toEqual([]);
    const r = normalizeIntent({ purposes: ["不存在的議題"], targets: ["不存在的目標"], mustHave: [] });
    expect(r.purposes).toEqual([]);
    expect(r.mustHave).toEqual([]);
  });

  it("冪等：跑兩次結果相同", () => {
    const once = normalizeIntent({ purposes: ["想買車、買房，進行置產"], targets: ["人生模擬"], mustHave: [] });
    const twice = normalizeIntent(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });

  it("去重", () => {
    const r = normalizeIntent({ purposes: [ALL_SIM, ALL_SIM], targets: ["旅遊規劃", "旅遊規劃"], mustHave: ["旅遊規劃"] });
    expect(r.purposes).toEqual([ALL_SIM]);
    expect(r.mustHave).toEqual(["旅遊規劃"]);
  });
});

describe("defaultIntent / goalTabs", () => {
  it("新客戶預設必達退休", () => {
    expect(defaultIntent().mustHave).toEqual([DEFAULT_TARGET]);
  });

  it("goalTabs 依已選目標帶出分頁、去重、排除地基層", () => {
    const tabs = goalTabs(["退休生活規劃", "購屋規劃", "旅遊規劃", "子女教養規劃"]);
    expect(tabs.map((t) => t.tab)).toEqual(["retire", "goals", "education"]); // 購屋/旅遊同屬 goals 只算一次
  });

  it("沒選任何目標時分母只剩地基層", () => {
    expect(goalTabs([])).toEqual([]);
    expect(BASE_TABS.length).toBe(5);
  });

  it("每個目標的 tab 都指向真實存在的分頁 id", () => {
    const known = new Set(["intent", "goals", "education", "retire", "family", "finance", "coverage", "credit", "tax", "lifestyle"]);
    for (const m of TARGET_META) expect(known.has(m.tab)).toBe(true);
  });
});

// ── 防漂移：public/lantu-app.html 是獨立 HTML，另存一份同樣的常數 ──
describe("lantu-app.html 常數與 intent.ts 一致", () => {
  const html = readFileSync(fileURLToPath(new URL("../../public/lantu-app.html", import.meta.url)), "utf8");
  const pick = (name: string) => {
    const m = html.match(new RegExp("var " + name + "\\s*=\\s*\\[([\\s\\S]*?)\\];"));
    if (!m) throw new Error(`lantu-app.html 找不到 ${name}`);
    return m[1];
  };
  const strings = (body: string) => Array.from(body.matchAll(/'([^']*)'/g)).map((x) => x[1]);

  it("PURPOSES 兩邊一致", () => {
    expect(strings(pick("PURPOSES"))).toEqual([...PURPOSES]);
  });

  it("TARGETS 兩邊一致（含順序）", () => {
    // lantu-app.html 的 TARGET_META 為 [名稱, tab, 分頁名, 副標, goalType?] 陣列，取第一個字串
    const rows = pick("TARGET_META").split("],").map((r) => strings(r)).filter((r) => r.length);
    expect(rows.map((r) => r[0])).toEqual(TARGETS);
  });

  it("TARGET_META 的 tab / 分頁名 / goalType 兩邊一致", () => {
    const rows = pick("TARGET_META").split("],").map((r) => strings(r)).filter((r) => r.length);
    rows.forEach((r, i) => {
      expect(r[1]).toBe(TARGET_META[i].tab);
      expect(r[2]).toBe(TARGET_META[i].tabName);
      expect(r[3]).toBe(TARGET_META[i].hint);
      expect(r[4] ?? undefined).toBe(TARGET_META[i].goalType);
    });
  });

  it("BASE_TABS 兩邊一致", () => {
    const rows = pick("BASE_TABS").split("],").map((r) => strings(r)).filter((r) => r.length);
    expect(rows.map((r) => r[0])).toEqual(BASE_TABS.map((b) => b.tab));
    expect(rows.map((r) => r[1])).toEqual(BASE_TABS.map((b) => b.tabName));
  });

  it("ALL_SIM / DEFAULT_TARGET 兩邊一致", () => {
    expect(html).toContain(`var ALL_SIM='${ALL_SIM}'`);
    expect(html).toContain(`var DEFAULT_TARGET='${DEFAULT_TARGET}'`);
  });
});
