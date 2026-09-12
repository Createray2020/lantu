import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 訪談模式：順序、檢核清單、以及照問卷補進來的欄位。
 *
 * 背景：教練原本開著 SurveyCake 問卷、在客戶面前照著問（實測 82 分鐘），
 * 問完再把同一批資料謄進系統——雙重工。這一輪把問卷的順序與缺的欄位搬進系統，
 * 目標是讓他只開一個。規格見 docs/客戶入場問卷_規格拆解.md。
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
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
});

const fresh = () => {
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  return w.app.cases[0];
};
const go = (tab: string) => { w.app.activeTab = "data"; w.app.dataTab = tab; w.render(); };
// 2026/08/31：訪談檢核清單改成右下角常駐浮層，內容仍是同一支 interviewSec()。
const openIv = () => { w.IVP.open(); return w.document.querySelector(".ivdbody") as Element; };

describe("分頁順序＝問卷順序", () => {
  it("②未來的需求 排在 ③現在的狀況 之前（先講夢想，最後才問錢）", () => {
    go("intent");
    const labels = [...w.document.querySelectorAll("#app .dgrow .dglab")].map((e: Element) => e.textContent);
    const future = labels.findIndex((t: string) => t.includes("未來的需求"));
    const now = labels.findIndex((t: string) => t.includes("現在的狀況"));
    expect(future).toBeGreaterThan(-1);
    expect(now).toBeGreaterThan(-1);
    expect(future, "先攤資產負債，客戶一開始就進防衛狀態，後面的願景就問不深了").toBeLessThan(now);
  });

  // ⚠️ 2026-09-11：下拉從「列分頁」改成「列面向」。
  //    ①群第一顆因此從「意圖 / 生涯」變成「規劃單位與界線」——那是手冊的會談前調頻，
  //    刻意排在最前面。問卷骨幹的第一段仍然是「這次想解決什麼」，見下一條。
  it("①群第一顆是會談前調頻（規劃單位與界線）", () => {
    go("intent");
    const first = w.document.querySelector("#app .dgrow .dtab");
    expect(first.textContent!.trim()).toBe("規劃單位與界線新");
  });

  it("問卷骨幹的第一段仍然是「這次想解決什麼」", () => {
    const spine = w.INTERVIEW_STEPS.filter((s: { nw?: number }) => !s.nw);
    expect(spine[0].name).toBe("這次想解決什麼");
  });

  it("③群內＝財務現況 → 風險屬性 → 人身風險（手冊 4→5→6 章的順序）", () => {
    go("finance");
    const rows = [...w.document.querySelectorAll("#app .dgrow")];
    const nowRow = rows.find((r) => (r.querySelector(".dglab")?.textContent ?? "").includes("現在的狀況"))!;
    const names = [...nowRow.querySelectorAll(".dtab")]
      .map((b: Element) => b.textContent!.trim().replace(/新$/, ""));
    expect(names).toEqual([
      "收入現況", "支出現況", "短期資金需求", "資產現況", "負債現況",
      "信用與海外", "稅賦", "風險屬性對話", "保障需求", "保障預算與取捨",
    ]);
  });

  it("群標籤帶進度，而且分母只算客戶有勾的目標", () => {
    go("intent");
    const rows = [...w.document.querySelectorAll("#app .dgrow")];
    const future = rows.find((r) => (r.querySelector(".dglab")?.textContent ?? "").includes("未來的需求"))!;
    const cnt = future.querySelector(".dgcnt")!.textContent!;
    expect(cnt).toMatch(/^\d+\/\d+$/);
    const total = Number(cnt.split("/")[1]);
    const c = w.activeCase();
    const on = w.INTERVIEW_STEPS.filter((s: { g: number; t?: string }) =>
      s.g === 2 && (!s.t || w.targetOn(c, s.t))).length;
    expect(total, "分母只算有勾的目標——否則多數客戶永遠是 3/12，看起來像做不完").toBe(on);
  });

  it("客戶沒勾的目標淡出但仍可點（取消勾選不刪資料）", () => {
    go("intent");
    const c = w.activeCase();
    const off = w.INTERVIEW_STEPS.find((s: { g: number; t?: string }) =>
      s.g === 2 && s.t && !w.targetOn(c, s.t));
    if (!off) return;
    const btn = w.document.querySelector(`#app .dgrow [data-ivk="${off.k}"]`)!;
    expect(btn.className).toContain("dim");
    expect(btn.hasAttribute("disabled")).toBe(false);
  });

  it("點下拉裡的面向會切到它的分頁並記住目前面向", () => {
    go("intent");
    w.ivGoto("asset");
    expect(w.app.dataTab).toBe("finance");
    expect(w.app.ivFacet).toBe("asset");
    expect(w.document.querySelector("#app .dgcur b")!.textContent).toBe("資產現況");
  });
});

describe("收入的彈性上限（問卷：再拚一年月收入可以到多少）", () => {
  it("沒填 → 走全域上限 CAP_INCOME_UP", () => {
    const c = fresh();
    expect(w.leverRange(c, "income").hi).toBe(w.CAP_INCOME_UP);
  });

  it("自述上限高於現況 → 以客戶自己說的為準（可以高過全域上限）", () => {
    const c = fresh();
    c.profile.incomeCeiling = 250000;                 // 300 萬/年 vs 現況工作年收 190 萬
    const hi = w.leverRange(c, "income").hi;
    expect(hi).toBeGreaterThan(w.CAP_INCOME_UP);
    expect(Math.round(hi * 10) / 10).toBe(57.9);
  });

  it("⚠️ 自述上限低於現況 → 不採用，退回全域上限（不可以把槓桿悄悄鎖死）", () => {
    const c = fresh();
    c.profile.incomeCeiling = 150000;                 // 180 萬/年，低於現況 190 萬
    expect(
      w.leverRange(c, "income").hi,
      "夾到 0 等於讓求解器少一根槓桿，而畫面上看不出來——教練只會覺得算不出方案",
    ).toBe(w.CAP_INCOME_UP);
  });

  it("沒有工作類別的收入可當基準時，一律退回全域上限", () => {
    const c = fresh();
    c.incomes = [];
    c.profile.incomeCeiling = 250000;
    expect(w.leverRange(c, "income").hi).toBe(w.CAP_INCOME_UP);
  });

  it("畫面會把「低於現況」當成要回頭確認的事，而不是照著算", () => {
    const c = fresh();
    c.profile.incomeCeiling = 150000;
    go("incomes");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/低於目前工作年收入/);
    expect(html).toMatch(/暫不採用/);
  });
});

describe("安全感預備金（問卷：身上有多少錢才有安全感）", () => {
  it("填了就跟系統算的並列，差距大會標出來", () => {
    const c = fresh();
    c.params.safetyCash = 3_000_000;                  // 遠高於「月支出 × 6」
    go("family");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/客戶自述的安全感門檻/);
    expect(html).toMatch(/心裡的門檻比系統算的高/);
  });

  it("沒填時不會硬湊一個差額出來", () => {
    const c = fresh();
    c.params.safetyCash = 0;
    go("family");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/系統算的/);
    expect(html).not.toMatch(/心裡的門檻比系統算的/);
  });
});

describe("子女的其他準備基金", () => {
  it("加到 goals 而不是 education（一次性的錢混進逐年會被乘開）", () => {
    const c = fresh();
    const eduBefore = (c.education || []).length;
    w.addChildFund("王小寶", "結婚基金");
    const c2 = w.activeCase();
    expect((c2.education || []).length, "不可以混進教育金").toBe(eduBefore);
    expect((c2.goals || []).slice(-1)[0].name).toBe("王小寶的結婚基金");
  });

  it("⚠️ 給付年齡換算成「本人幾歲」，不是直接填子女年齡", () => {
    fresh();
    w.addChildFund("王小寶", "結婚基金");             // 子女 6 歲、預設 30 歲給、本人 40 歲
    const g = w.activeCase().goals.slice(-1)[0];
    expect(g.start, "goals 的起訖歲一律是本人的時間軸，填子女年齡會整個錯位").toBe(40 + (30 - 6));
    expect(g.end).toBe(g.start);
    expect(g.freq, "一次性給出去，不是逐年").toBe(0);
  });

  it("標記得出是哪個子女的，子女教育頁才認得回來", () => {
    fresh();
    w.addChildFund("王小寶", "買房基金");
    expect(w.activeCase().goals.slice(-1)[0].childFundFor).toBe("王小寶");
  });
});

describe("訪談檢核清單", () => {
  // ⚠️ 2026-09-11 擴成 35 個面向。問卷骨幹（nw 未標記的那 20 題）順序仍然一個字都不能動，
  //    理由見 layoutChartsUI.test.ts 同名護欄的註解。
  it("問卷骨幹的人生目標段落順序不變（先講夢想，最後才問錢）", () => {
    const spine = w.INTERVIEW_STEPS.filter((s: { nw?: number }) => !s.nw);
    expect(spine.length).toBe(20);
    expect(spine.slice(2, 13).map((s: { name: string }) => s.name)).toEqual([
      "職涯規劃", "購屋規劃", "購車規劃", "婚姻規劃", "子女教養", "孝親規劃",
      "旅遊規劃", "休閒興趣", "奢侈品", "退休規劃", "傳承規劃",
    ]);
  });

  it("群組歸屬：①認識個案與財務行為、②未來的需求、③現在的狀況、④方案", () => {
    const g = (k: string) => w.INTERVIEW_STEPS.find((s: { k: string }) => s.k === k)?.g;
    expect(g("basic"), "認識個案在第一群").toBe(1);
    expect(g("money"), "財務行為併進第一群").toBe(1);
    expect(g("decide")).toBe(1);
    expect(g("ready")).toBe(1);
    expect(g("marry"), "人生目標在第二群").toBe(2);
    expect(g("income"), "財務現況在第三群").toBe(3);
    expect(g("risk"), "風險屬性從第一群搬到第三群，與保障中心作伴").toBe(3);
    expect(g("cover")).toBe(3);
    expect(g("doc"), "收斂與方案在第四群").toBe(4);
  });

  /**
   * 面向清單的結構完整性（2026-09-11 擴充為 35 個面向時新增）。
   *
   * 這份清單接下來要當分組列的資料來源：群組標籤的進度、下拉的項目與狀態點全部吃它。
   * 少一個欄位不會噴錯，只會讓某個面向在下拉裡長得跟別人不一樣——所以在這裡擋住。
   */
  it("每個面向都有完整的五件事：鍵、名稱、分頁、提示、自動偵測", () => {
    const bad: string[] = [];
    for (const st of w.INTERVIEW_STEPS) {
      if (!st.k || !st.name || !st.tab) bad.push(`${st.k || "(無鍵)"}：缺 k/name/tab`);
      else if (!st.hint || String(st.hint).length < 5) bad.push(`${st.k}：提示太短或沒有`);
      else if (typeof st.has !== "function") bad.push(`${st.k}：沒有自動偵測`);
    }
    expect(bad, bad.join("；")).toEqual([]);
  });

  it("面向的鍵不重複——重複的話下拉會有兩個一樣的項目，狀態也會打架", () => {
    const ks = w.INTERVIEW_STEPS.map((s: { k: string }) => s.k);
    expect(ks.length).toBe(new Set(ks).size);
  });

  it("has() 對空白新案一律安全（不可以丟例外，缺資料只是「還沒問」）", () => {
    const c = w.migrateCase(w.newCase());
    const threw: string[] = [];
    for (const st of w.INTERVIEW_STEPS) {
      try { st.has(c); } catch { threw.push(st.k); }
    }
    expect(threw, `這些面向的偵測在空白新案會爆：${threw.join(", ")}`).toEqual([]);
  });

  it("四群的面向數：①9 ②12 ③10 ④4", () => {
    const n = (g: number) => w.INTERVIEW_STEPS.filter((s: { g: number }) => s.g === g).length;
    expect([n(1), n(2), n(3), n(4)]).toEqual([9, 12, 10, 4]);
    expect(w.INTERVIEW_STEPS.length).toBe(35);
  });

  it("自動偵測「這一段有沒有東西」，教練不用自己維護", () => {
    const c = fresh();
    const pr = w.ivProgress(c);
    expect(pr.total).toBe(w.INTERVIEW_STEPS.length);
    expect(pr.done, "示範客戶大部分段落是有資料的").toBeGreaterThan(10);
    expect(w.ivDone(c, w.INTERVIEW_STEPS.find((s: { k: string }) => s.k === "income"))).toBe("auto");
  });

  it("偵測不到的可以手動勾（談過但決定不做）", () => {
    const c = fresh();
    const step = w.INTERVIEW_STEPS.find((s: { k: string }) => s.k === "career");
    expect(w.ivDone(c, step)).toBe("");
    w.toggleIvStep("career");
    expect(w.ivDone(w.activeCase(), step)).toBe("manual");
  });

  // ⚠️ Ray 回報第 1/3/6/13/20 項「前往」沒反應。真因：這五項的 tab 全部是 'intent'，
  //    而檢核清單本身就 render 在 intent 分頁上 → app.dataTab='intent' 等於原地不動。
  //    修法是 ivGoto() 切分頁後捲到錨點，所以「同分頁的步驟一定要有錨點」是這條的守門員。
  it("跟清單同一個分頁的步驟，一定要有錨點——否則按了畫面不會動", () => {
    const sameTab = w.INTERVIEW_STEPS.filter((s: { tab: string }) => s.tab === "intent");
    expect(sameTab.map((s: { k: string }) => s.k))
      .toEqual(["purpose", "values", "money", "ready", "career", "marry", "legacy", "doc"]);
    const noAnchor = sameTab.filter((s: { a?: string }) => !s.a).map((s: { k: string }) => s.k);
    expect(noAnchor, `這些步驟按「前往」會沒有任何反應：${noAnchor.join(", ")}`).toEqual([]);
  });

  it("每個錨點在它自己的分頁上真的找得到（未選的目標也要找得到）", () => {
    fresh();
    const withAnchor = w.INTERVIEW_STEPS.filter((s: { a?: string }) => s.a);
    expect(withAnchor.length).toBeGreaterThanOrEqual(8);
    const missing: string[] = [];
    for (const st of withAnchor) {
      go(st.tab);
      if (!w.document.querySelector(`#app ${st.a}`)) missing.push(`${st.k}(${st.a})`);
    }
    expect(missing, `這些錨點捲不到：${missing.join(", ")}`).toEqual([]);
  });

  it("ivGoto 會切到該步驟的分頁", () => {
    fresh();
    go("intent");
    w.ivGoto("house");
    expect(w.app.dataTab).toBe("goals");
    w.ivGoto("purpose");
    expect(w.app.dataTab).toBe("intent");
  });

  it("每一段都指得到一個真的分頁", () => {
    const known = new Set([
      ...w.BASE_TABS.map((b: string[]) => b[0]),
      "intent", "risk", "retire", "education", "goals", "lifestyle", "plan", "tracking",
    ]);
    const bad = w.INTERVIEW_STEPS.filter((s: { tab: string }) => !known.has(s.tab)).map((s: { k: string }) => s.k);
    expect(bad, `這些段落的「前往」會跳到不存在的分頁：${bad.join(", ")}`).toEqual([]);
  });

  it("清單畫得出來，而且每一段都有提示（提示才是不會漏問的關鍵）", () => {
    fresh();
    go("intent");
    openIv();
    // ⚠️ 守的是「每一個面向都有提示」，不是某個固定題數——提示才是不會漏問的關鍵。
    const total = w.INTERVIEW_STEPS.length;
    expect(w.document.querySelectorAll(".ivdbody .ivrow").length).toBe(total);
    const hints = [...w.document.querySelectorAll(".ivdbody .ivhint")].map((e: Element) => e.textContent!.trim());
    expect(hints.filter((t: string) => t.length > 4).length).toBe(total);
  });

  it("點清單裡的「前往」＝要去填資料，浮層自己讓開", () => {
    fresh();
    go("intent");
    openIv();
    expect(w.IVP.isOpen()).toBe(true);
    w.jumpTab("family");
    expect(w.IVP.isOpen()).toBe(false);
    expect(w.app.dataTab).toBe("family");
  });

  it("休閒與奢侈品的分類直接列在提示裡（不塞進下拉把層級打平）", () => {
    fresh();
    go("intent");
    const html = openIv().innerHTML as string;
    expect(html).toMatch(/體能／收藏／思考/);
    expect(html).toMatch(/豪宅／珠寶/);
  });
});

describe("健保三欄", () => {
  it("成員卡有健保投保類別／月投保薪資／負擔眷屬人數", () => {
    fresh();
    go("family");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/健保投保類別/);
    expect(html).toMatch(/健保月投保薪資/);
    expect(html).toMatch(/負擔眷屬人數/);
  });
});

describe("資產的「可變動」要能寫理由", () => {
  it("進階欄有可變動的說明欄位", () => {
    const c = fresh();
    // 刻意只給一半的鍵：四張表都有展開區之後，缺鍵不能讓渲染整個掛掉。
    w.app.finOpen = { assets: { 0: true } };
    go("finance");
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/可變動的說明/);
    expect(c.assets.length).toBeGreaterThan(0);
  });
});
