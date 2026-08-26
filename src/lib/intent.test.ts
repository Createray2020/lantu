import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  PURPOSES, TARGETS, TARGET_META, ALL_SIM, DEFAULT_TARGET, BASE_TABS, BIZ_BASE_TABS,
  normalizeIntent, defaultIntent, goalTabs, baseTabs, visibleTargetMeta, PURPOSE_TO_ENTITY,
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
    const known = new Set([
      "intent", "goals", "education", "retire", "family", "finance", "coverage", "credit", "tax", "lifestyle",
      "company", "linkage", "bizgate", "bizcomp", "bizrisk", "bizexit",
    ]);
    for (const m of TARGET_META) expect(known.has(m.tab)).toBe(true);
  });
});

// ── 企業主體（2026-08-22）──
describe("entities · 企業主體", () => {
  const biz = TARGET_META.filter((m) => m.entity === "company").map((m) => m.name);

  it("新客戶不開任何額外主體", () => {
    expect(defaultIntent().entities).toEqual({});
  });

  it("舊資料沒有 entities 欄位也不會炸，正規化成空物件", () => {
    expect(normalizeIntent({ purposes: [], targets: [], mustHave: [] }).entities).toEqual({});
  });

  it("只留認得的 key，值一律 boolean", () => {
    const r = normalizeIntent({ purposes: [], targets: [], mustHave: [], entities: { company: 1, ghost: true } as never });
    expect(r.entities).toEqual({ company: true });
  });

  it("主體沒開時，企業目標選不到、也留不住（避免優先序 index 對不上）", () => {
    const r = normalizeIntent({ purposes: [], targets: biz, mustHave: biz });
    expect(r.mustHave).toEqual([]);
    expect(visibleTargetMeta(r).map((m) => m.name)).not.toContain(biz[0]);
  });

  it("主體開了，企業目標就留得住且看得到", () => {
    const r = normalizeIntent({ purposes: [], targets: biz, mustHave: biz, entities: { company: true } });
    expect(r.mustHave).toEqual(biz);
    expect(visibleTargetMeta(r).map((m) => m.name)).toEqual(expect.arrayContaining(biz));
  });

  it("勾對應議題＝自動開主體（客戶端沒有開關，這是唯一路徑）", () => {
    const p = Object.keys(PURPOSE_TO_ENTITY)[0];
    const r = normalizeIntent({ purposes: [p], targets: [], mustHave: [] });
    expect(r.entities.company).toBe(true);
  });

  it("baseTabs：主體開了才追加第 ④ 群，且不動原本五頁", () => {
    expect(baseTabs(null)).toEqual(BASE_TABS);
    expect(baseTabs({ entities: {} })).toEqual(BASE_TABS);
    expect(baseTabs({ entities: { company: true } })).toEqual(BASE_TABS.concat(BIZ_BASE_TABS));
  });

  it("goalTabs 不會帶出主體沒開的分頁", () => {
    expect(goalTabs(biz)).toEqual([]);
    const on = { entities: { company: true } };
    expect(goalTabs(biz, on).map((t) => t.tab)).toEqual(["bizcomp", "bizrisk", "bizexit"]);
  });

  it("冪等：帶 entities 跑兩次結果相同", () => {
    const once = normalizeIntent({ purposes: ["想處理公司與個人的財務界線"], targets: biz, mustHave: biz });
    const twice = normalizeIntent(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
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

  it("TARGET_META 的 tab / 分頁名 / goalType / 主體 兩邊一致", () => {
    const rows = pick("TARGET_META").split("],").map((r) => strings(r)).filter((r) => r.length);
    rows.forEach((r, i) => {
      expect(r[1]).toBe(TARGET_META[i].tab);
      expect(r[2]).toBe(TARGET_META[i].tabName);
      expect(r[3]).toBe(TARGET_META[i].hint);
      // html 端沒有 goalType 時寫成 ''（因為後面還有主體欄），所以用 || 收斂成 undefined
      expect(r[4] || undefined).toBe(TARGET_META[i].goalType);
      expect(r[5] || undefined).toBe(TARGET_META[i].entity);
    });
  });

  it("BASE_TABS / BIZ_BASE_TABS 兩邊一致", () => {
    const cmp = (name: string, ts: { tab: string; tabName: string }[]) => {
      const rows = pick(name).split("],").map((r) => strings(r)).filter((r) => r.length);
      expect(rows.map((r) => r[0])).toEqual(ts.map((b) => b.tab));
      expect(rows.map((r) => r[1])).toEqual(ts.map((b) => b.tabName));
    };
    cmp("BASE_TABS", BASE_TABS);
    cmp("BIZ_BASE_TABS", BIZ_BASE_TABS);
  });

  it("PURPOSE_TO_ENTITY 兩邊一致", () => {
    const m = html.match(/var PURPOSE_TO_ENTITY=\{([\s\S]*?)\};/);
    if (!m) throw new Error("lantu-app.html 找不到 PURPOSE_TO_ENTITY");
    const pairs = Array.from(m[1].matchAll(/'([^']*)':'([^']*)'/g)).map((x) => [x[1], x[2]]);
    expect(Object.fromEntries(pairs)).toEqual(PURPOSE_TO_ENTITY);
  });

  it("ALL_SIM / DEFAULT_TARGET 兩邊一致", () => {
    expect(html).toContain(`var ALL_SIM='${ALL_SIM}'`);
    expect(html).toContain(`var DEFAULT_TARGET='${DEFAULT_TARGET}'`);
  });
});

/**
 * 分頁與面向的順序 ＝ 教練實際在用的 SurveyCake 訪談問卷的順序。
 *
 * 這不是美觀問題。教練是在客戶面前開著系統、照著順序一路問下去的，
 * 順序一亂，他的口條就跟畫面對不上，會退回去用問卷（那就是雙重工）。
 *
 * 問卷順序來自 docs/客戶入場問卷_規格拆解.md（22 頁實體樣本拆解）。
 * 要改順序之前，先確認問卷那邊也改了。
 */
describe("順序照訪談問卷", () => {
  it("11 個規劃面向的順序，逐項對得上問卷", () => {
    const 問卷順序 = [
      "職涯規劃", "購屋規劃", "購車規劃", "婚姻規劃", "子女教養規劃", "孝親規劃",
      "旅遊規劃", "休閒興趣規劃", "奢侈品購買規劃", "退休生活規劃", "傳承規劃",
    ];
    expect(TARGET_META.filter((m) => !m.entity).map((m) => m.name)).toEqual(問卷順序);
  });

  it("購屋排在購車之前（問卷是先問房再問車，不要對調）", () => {
    const names = TARGET_META.map((m) => m.name);
    expect(names.indexOf("購屋規劃")).toBeLessThan(names.indexOf("購車規劃"));
  });

  it("婚姻排在子女之前（先成家才有子女，問卷的因果順序）", () => {
    const names = TARGET_META.map((m) => m.name);
    expect(names.indexOf("婚姻規劃")).toBeLessThan(names.indexOf("子女教養規劃"));
  });

  it("退休與傳承排在最後兩項（人生最遠的兩件事，問到最後才談）", () => {
    const personal = TARGET_META.filter((m) => !m.entity).map((m) => m.name);
    expect(personal.slice(-2)).toEqual(["退休生活規劃", "傳承規劃"]);
  });

  it("地基層：保障中心排在信用之後（現況數字問完才問「萬一你走了」）", () => {
    const tabs = BASE_TABS.map((b) => b.tab);
    expect(tabs).toEqual(["family", "finance", "credit", "coverage", "tax"]);
  });

  it("企業三項永遠排在個人面向之後，順序不變", () => {
    const biz = TARGET_META.filter((m) => m.entity === "company").map((m) => m.name);
    expect(biz).toEqual(["報酬結構優化", "企業風險保障", "事業退場規劃"]);
    const firstBiz = TARGET_META.findIndex((m) => !!m.entity);
    expect(TARGET_META.slice(firstBiz).every((m) => !!m.entity)).toBe(true);
  });
});
