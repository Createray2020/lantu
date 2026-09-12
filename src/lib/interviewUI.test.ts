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

const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

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

/**
 * 聚焦模式（2026-09-12）。
 *
 * ⚠️ 折疊靠宿主上的 data-ivsec／既有錨點，不是 DOM 結構。宿主被刪掉不會噴任何錯，
 *    只會讓那個面向「聚焦沒反應」——所以這一組把宿主的存在性整批釘住。
 */
describe("聚焦模式", () => {
  /** 同一分頁有兩個以上面向的，折疊才有意義；單一面向的分頁聚焦是 no-op。 */
  function multiFacetTabs() {
    const cnt: Record<string, number> = {};
    for (const st of w.INTERVIEW_STEPS) cnt[st.tab] = (cnt[st.tab] ?? 0) + 1;
    return Object.keys(cnt).filter((t) => cnt[t] > 1);
  }

  it("多面向分頁的每一個面向，在它自己的分頁上都找得到宿主", () => {
    fresh();
    const tabs = new Set(multiFacetTabs());
    const missing: string[] = [];
    for (const st of w.INTERVIEW_STEPS) {
      if (!tabs.has(st.tab)) continue;
      go(st.tab);
      const sel = w.ivSecSel(st);
      if (!w.document.querySelector(`#app ${sel}`)) missing.push(`${st.k}(${sel})`);
    }
    expect(missing, `這些面向聚焦會沒反應：${missing.join(", ")}`).toEqual([]);
  });

  it("預設關閉——不強迫改變現役教練「直接點分頁、整頁捲」的動線", () => {
    fresh();
    w.app.ivFocusOn = false;
    go("finance");
    expect(w.app.ivFocusOn).toBeFalsy();
    expect(w.document.querySelectorAll("#app .ivfold").length).toBe(0);
    expect(w.document.querySelector("#ivFocusSw")!.className).not.toContain("on");
  });

  /** ⚠️ ivFocusOn 是 app 層狀態，fresh() 不會重設——每條測試自己把它設明確，不要用 toggle 累積。 */
  function focusOn(k: string) {
    fresh();
    w.ivGoto(k);
    w.app.ivFocusOn = true;
    w.render();
  }

  it("開了之後：目前這一段留著，同分頁其餘折起來", () => {
    focusOn("asset");
    expect(w.app.ivFocusOn).toBe(true);
    const hit = w.document.querySelector('#app [data-ivsec="asset"]')!;
    expect(hit.className).not.toContain("ivfold");
    for (const k of ["income", "expense", "debt", "shortterm"]) {
      const el = w.document.querySelector(`#app [data-ivsec="${k}"]`)!;
      expect(el.className, `${k} 應該被折起來`).toContain("ivfold");
      expect(el.getAttribute("data-ivname"), `${k} 少了折疊後要顯示的名稱`).toBeTruthy();
    }
  });

  it("折起來的區塊可以點開，而且不會關掉聚焦模式", () => {
    focusOn("asset");
    const el = w.document.querySelector('#app [data-ivsec="income"]')!;
    (el as HTMLElement).click();
    expect(el.className).not.toContain("ivfold");
    expect(w.app.ivFocusOn, "點開一塊不等於退出聚焦").toBe(true);
  });

  it("關掉聚焦立刻回到整頁", () => {
    focusOn("asset");
    expect(w.document.querySelectorAll("#app .ivfold").length).toBeGreaterThan(0);
    w.toggleIvFocus();
    expect(w.document.querySelectorAll("#app .ivfold").length).toBe(0);
  });

  it("⚠️ 不會折到包含目前區塊的外層（否則目標會跟著被藏掉）", () => {
    focusOn("coverbudget");
    const hit = w.document.querySelector('#app [data-ivsec="coverbudget"]')!;
    expect(hit.className).not.toContain("ivfold");
    const folded = [...w.document.querySelectorAll("#app .ivfold")];
    expect(folded.length, "保障中心有兩個面向，應該折到一個").toBeGreaterThan(0);
    expect(folded.every((el: Element) => !el.contains(hit)), "折到外層會把目標一起藏掉").toBe(true);
  });

  it("bg 與 basic 共用宿主（背景住在成員卡裡面，不是它的兄弟）", () => {
    const bg = w.INTERVIEW_STEPS.find((s: { k: string }) => s.k === "bg");
    expect(w.ivSecSel(bg)).toBe('[data-ivsec="basic"]');
  });

  it("折疊後那一行標題靠 CSS 的 attr(data-ivname) 產生，不在 DOM 上插節點", () => {
    const css = HTML.slice(0, HTML.indexOf("</style>"));
    expect(css).toContain('attr(data-ivname)');
    expect(css, "折疊後的一行標題要靠 ::before 產生").toMatch(/\.ivfold::before[\s\S]{0,120}attr\(data-ivname\)/);
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
  /**
   * ⚠️⚠️ 2026-09-11：清單從 20 題擴成 35 個面向（補進手冊有、問卷沒有的那幾段）。
   *
   * 這條護欄原本寫死「20 題、一個字都不能動」，守的是**問卷順序這個 know-how**——
   * 題目順序＝教練實際在問的順序，先講夢想、最後問錢。那件事仍然要守，
   * 但「不准成長」不是守它的正確方式（有意識的擴充與無意識的漂移是兩回事）。
   *
   * 改成守真正該守的：**問卷原本那 20 題的相對順序一個字都不能動**。
   * 新增的面向一律標 nw:1，濾掉之後必須逐字還原成下面這一串。
   *
   * ⚠️ 2026-09-12：這條原本住在 layoutChartsUI.test.ts 的「⑥ 訪談檢核浮層」裡，
   *    浮層移除後整組搬過來——它守的是清單本身，不是版面。
   */
  it("⚠️ 問卷骨幹 20 題的順序一個字都沒動（新增面向不得插進它們之間打亂順序）", () => {
    const spine = w.INTERVIEW_STEPS.filter((s: { nw?: number }) => !s.nw);
    expect(spine.length).toBe(20);
    expect(spine.map((s: { k: string }) => s.k).join(",")).toBe(
      "purpose,basic,career,house,car,marry,child,parent,travel,hobby,luxury," +
      "retire,legacy,income,expense,asset,debt,credit,cover,doc",
    );
  });

  it("問卷骨幹的人生目標段落順序不變（先講夢想，最後才問錢）", () => {
    const spine = w.INTERVIEW_STEPS.filter((s: { nw?: number }) => !s.nw);
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

  // ⚠️ 2026-09-12 浮層移除後，提示的家從 .ivhint 換成下拉上面向鈕的 title。
  //    守的仍然是同一件事：**每一個面向都有提示**，不是某個固定題數。
  it("每一段都有提示（提示才是不會漏問的關鍵）", () => {
    const bad = w.INTERVIEW_STEPS
      .filter((s: { hint?: string }) => !s.hint || s.hint.trim().length <= 4)
      .map((s: { k: string }) => s.k);
    expect(bad, `這些面向沒有提示，教練會漏問：${bad.join(", ")}`).toEqual([]);
  });

  it("提示跟著面向進下拉的 title——不必為了看題句再開一個容器", () => {
    fresh();
    go("intent");
    const items = [...w.document.querySelectorAll("#app .dmenu .ivt")];
    expect(items.length).toBeGreaterThan(0);
    const byK = new Map<string, string>(
      w.INTERVIEW_STEPS.map((s: { k: string; hint?: string }) => [s.k, s.hint || ""] as [string, string]),
    );
    const bad = items
      .filter((e: Element) => (e.getAttribute("title") || "").trim() !== (byK.get(e.getAttribute("data-ivk")!) || "").trim())
      .map((e: Element) => e.getAttribute("data-ivk"));
    expect(bad, `這些面向的 title 不是它的訪談題句：${bad.join(", ")}`).toEqual([]);
  });

  it("休閒與奢侈品的分類直接列在提示裡（不塞進下拉把層級打平）", () => {
    const hints = w.INTERVIEW_STEPS.map((s: { hint?: string }) => s.hint || "").join("\n");
    expect(hints).toMatch(/體能／收藏／思考/);
    expect(hints).toMatch(/豪宅／珠寶/);
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
