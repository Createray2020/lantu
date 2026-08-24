import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 調整方案分頁的「看得懂」測試。
 *
 * 2026/08/23 Ray 的回饋：「有點難看得懂，很多東西不夠簡化，沒有圖表會看得很辛苦。」
 * 病因是把求解器的內部狀態整片攤成表格。這一支測試把修正後的**版面決策**釘住，
 * 免得日後有人「順手再加一張表」就把首屏塞回去：
 *   ・首屏只有三個區塊是展開的，其餘一律 <details> 收合
 *   ・主圖一定畫得出零線標籤與缺口區（這張圖的全部意義就是「有沒有掉到零以下」）
 *   ・六根槓桿的狀態不靠顏色，一定同時有圖示與文字
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
  w.app.dataTab = "plan";
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  w.render();
});

const cur = () => w.app.cases[0];
const pane = () => w.document.querySelector("#app").innerHTML as string;

describe("座標刻度：一定給得出好看的數字，而且零線一定在", () => {
  it("跨越零的區間必定包含 0", () => {
    expect(w.niceTicks(-8_900_000, 1_090_000, 3)).toContain(0);
    expect(w.niceTicks(-500, 500, 3)).toContain(0);
  });

  it("刻度是 1／2／2.5／5 × 10^k 的整數，不是把區間硬均分", () => {
    const ts: number[] = w.niceTicks(0, 45_000_000, 3);
    expect(ts.length).toBeGreaterThan(1);
    const step = ts[1] - ts[0];
    const mag = Math.pow(10, Math.floor(Math.log10(step)));
    expect([1, 2, 2.5, 5, 10]).toContain(+(step / mag).toFixed(4));
  });

  it("退化輸入（區間為 0）不會爆、不會回 NaN", () => {
    const ts = w.niceTicks(0, 0, 3);
    expect(Array.isArray(ts)).toBe(true);
    ts.forEach((v: number) => expect(Number.isFinite(v)).toBe(true));
  });
});

describe("主圖：一張圖說完「差多少」", () => {
  it("有缺口時畫得出零線標籤、缺口區與缺口金額", () => {
    const c = cur();
    const svg = w.gapChartSVG(c, {}, "dark", null) as string;
    expect(w.gapPV(c)).toBeGreaterThan(0);
    expect(svg).toContain(">0</text>");          // 零線的刻度標籤
    expect(svg).toContain("#ef6f6f");            // 缺口區的紅
    expect(svg).toContain("缺口 ");               // 缺口金額直接註記在圖上
    expect(svg).toContain("歲轉負");
  });

  it("兩條線都在線末端直接標名字，不靠顏色分辨", () => {
    const svg = w.gapChartSVG(cur(), { expense: 12 }, "dark", null) as string;
    expect(svg).toContain(">未調整</text>");
    expect(svg).toContain(">調整後</text>");
  });

  it("沒有套用任何槓桿時只畫一條線", () => {
    const svg = w.gapChartSVG(cur(), {}, "dark", null) as string;
    expect(svg).toContain(">未調整</text>");
    expect(svg).not.toContain(">調整後</text>");
  });

  it("深淺兩版是同一支函式，淺色版不會帶進深色的線色", () => {
    const light = w.gapChartSVG(cur(), { expense: 12 }, "light", null) as string;
    expect(light).toContain("#b07d3d");          // 淺色版的「調整後」
    expect(light).not.toContain("#f0c34e");      // 深色版的「調整後」不該出現
  });

  it("補不平的個案：缺口區塞滿整張圖也不會畫壞（座標仍是有限數）", () => {
    const c = cur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount * 0.3; });
    const svg = w.gapChartSVG(c, {}, "dark", null) as string;
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount / 0.3; });
  });
});

describe("六根槓桿量表：狀態不靠顏色", () => {
  it("每一根都同時有圖示與文字說明，而且列出上限", () => {
    const solo = w.soloSolve(cur());
    const h = w.leverBarsHTML(cur(), solo, "dark", false) as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    w.LEVERS.forEach((L: any) => expect(h).toContain(L.name));
    expect(h).toContain("上限");
    expect(/🟢|🔴|⚪/.test(h)).toBe(true);
  });

  it("階段閘門鎖住的那一根會寫出理由，不是只有變灰", () => {
    const c = cur();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount * 0.3; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.expenses.forEach((e: any) => { e.amount = e.amount * 1.4; });
    const solo = w.soloSolve(c);
    expect(solo.gate.grade).toBe("D");
    const h = w.leverBarsHTML(c, solo, "dark", false) as string;
    expect(h).toContain("整裝期");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.incomes.forEach((i: any) => { if (i.type === "工作") i.amount = i.amount / 0.3; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.expenses.forEach((e: any) => { e.amount = e.amount / 1.4; });
  });
});

describe("缺口組成與變化卡", () => {
  it("組成用長條，依金額由大到小", () => {
    const c = cur();
    const led = w.gapLedger(c);
    const h = w.gapBarsHTML(led, "dark") as string;
    const idx = led.flow.map((f: { name: string }) => h.indexOf(f.name));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
  });

  it("變化卡用箭頭表達方向，並把調整前的數字劃掉", () => {
    const h = w.deltaCardsHTML(cur(), { expense: 12 }, "dark") as string;
    expect(h).toContain("現值缺口");
    expect(h).toContain("願景達成度");
    expect(/[↗↘＝]/.test(h)).toBe(true);
    expect(h).toContain("line-through");
  });
});

describe("版面（v2）：首屏必須是圖，不是報表", () => {
  it("首屏只有主圖＋三個數字＋判語＋動作開關，其餘一律收合", () => {
    w.app.dataTab = "plan"; w.render();
    const h = pane();
    const firstFold = h.indexOf("<details");
    expect(firstFold).toBeGreaterThan(0);
    const head = h.slice(0, firstFold);
    // 首屏該有的
    expect(head).toContain("願景歷程");
    expect(head).toContain("一生願景需要的資金");
    expect(head).toContain("缺口改善");
    expect(head).toContain("願景達成");
    expect(head).toContain("開開看");
    expect(head).toContain("<svg");
    // ⚠️ 首屏不該有的：任何表格、任何拉桿。
    //    v1 的拉桿／處方／該解什麼全部保留，但收進 <details>——見 feedback_圖表優先。
    expect(head).not.toContain("<table");
    expect(head).not.toContain('type="range"');
  });

  it("v1 的診斷區塊沒有被刪掉，只是收進收合區", () => {
    const h = pane();
    const firstFold = h.indexOf("<details");
    ["該解什麼", "三個處方", "曲線掉到零線以下", "配置與對帳", "方案比較"].forEach((t) => {
      const i = h.indexOf(t);
      expect(i, t + " 不該消失").toBeGreaterThan(0);
      expect(i, t + " 應該在收合區裡").toBeGreaterThan(firstFold);
    });
    expect(h.indexOf('type="range"')).toBeGreaterThan(firstFold);
  });

  it("收合區塊的順序照定案企劃：配額 → 動作清單 → 勾稽 → 流程 → 願景選定 → v1 診斷", () => {
    const h = pane();
    // 用各區塊 hint 的獨特字串，避免撞到首屏文案裡出現的同名詞
    const order = [
      "這條線大概要生出多少錢",
      "補缺口的手段，一條一條具體動作",
      "客戶到底有沒有錢做這些動作",
      "定案後輸出到調整方案書",
      "先決定要執行哪些願景",
      "六根槓桿的反解",
    ];
    let prev = h.indexOf("<details");
    order.forEach((t) => {
      const i = h.indexOf(t);
      expect(i, t).toBeGreaterThan(prev);
      prev = i;
    });
  });

  it("主圖的旗子一定同時有符號與顏色（綠紅在色盲下 ΔE 僅 7.8）", () => {
    const h = pane();
    expect(/[✓✕]/.test(h)).toBe(true);
    expect(h).toContain("✓ 願景做得到");
    expect(h).toContain("✕ 做不到");
  });

  it("動作 chips 緊貼主圖下方（點了要當場看到線動）", () => {
    const h = pane();
    const svg = h.indexOf("<svg");
    const chips = h.indexOf("v2chips");
    const firstFold = h.indexOf("<details");
    expect(chips).toBeGreaterThan(svg);
    expect(chips).toBeLessThan(firstFold);
  });
});

describe("配置表的按鈕真的接得上（不是繞過按鈕直接呼叫函式）", () => {
  const secOf = (title: string) => {
    const h = [...w.document.querySelectorAll("h4")].find((e: Element) => (e.textContent || "").includes(title));
    return h ? h.closest(".sec") : null;
  };

  it("兩張表的「＋ 新增」按鈕，按下去真的會多一列", () => {
    w.app.dataTab = "plan"; w.render();
    const c = cur();
    ([["投資型配置", "invest"], ["保障型配置", "protect"]] as [string, string][]).forEach(([title, key]) => {
      const sec = secOf(title);
      expect(sec, title + " 這一區塊要存在").toBeTruthy();
      const btn = sec!.querySelector("button.add") as HTMLElement;
      expect(btn, title + " 要有新增鈕").toBeTruthy();
      const before = (c.plan[key] || []).length;
      // 直接執行按鈕上掛的那段字串——鍵名對不上的話這裡就會爆或沒有效果
      w.eval(btn.getAttribute("onclick") as string);
      expect((cur().plan[key] || []).length, title + " 應該多一列").toBe(before + 1);
    });
  });

  it("表格欄位的 onchange 寫得進 c.plan 底下的陣列", () => {
    w.app.dataTab = "plan"; w.render();
    const sec = secOf("投資型配置")!;
    const inputs = sec.querySelectorAll("input, select");
    expect(inputs.length).toBeGreaterThan(0);
    // 找「每年投入」那一欄（money 欄位帶 data-money）
    const row0 = sec.querySelectorAll("table tr")[1];
    const cells = row0.querySelectorAll("input");
    expect(cells.length).toBeGreaterThan(2);
    const oc = (cells[2] as HTMLElement).getAttribute("onchange") as string;
    expect(oc).toContain("planInvest:");        // ⚠️ 鍵名必須是 PLAN_ARRS 認得的那一個
    expect(() => w.eval(oc.replace(/this\.value/g, "'12345'"))).not.toThrow();
  });

  it("刪除鈕刪的是 c.plan 底下那一列，不是頂層陣列", () => {
    w.app.dataTab = "plan"; w.render();
    const c = cur();
    const before = (c.plan.invest || []).length;
    expect(before).toBeGreaterThan(0);
    const sec = secOf("投資型配置")!;
    const del = sec.querySelector("button.del") as HTMLElement;
    w.eval(del.getAttribute("onclick") as string);
    expect((cur().plan.invest || []).length).toBe(before - 1);
  });

  it("PLAN_ARRS 的每一個鍵都要有 addRow 範本，否則按鈕會靜靜地沒反應", () => {
    Object.keys(w.PLAN_ARRS).forEach((k) => {
      w.app.dataTab = "plan"; w.render();
      const c = cur();
      const path = w.PLAN_ARRS[k];
      const before = (c.plan[path] || []).length;
      w.addRow(k);
      expect((cur().plan[path] || []).length, k + " 沒有 addRow 範本").toBe(before + 1);
    });
  });
});

/**
 * 2026/08/23 Ray 實測回報：「拉桿動了之後，上面的數據沒有任何改變。」
 * 接線其實是好的（draft 有寫入、金線有出現），錯在**三個大數字吃的是現況的 gapLedger**。
 * 教練盯著看的就是「現值缺口」那個數字，它不動就等於整頁沒反應。
 *
 * ⚠️ 這一組一律**透過畫面上真正的 <input type="range"> 派發 change 事件**，
 * 不呼叫 setLever()——上一次就是繞過元件才漏掉 bug 的。
 */
describe("拉桿要能當場改變上面的數字（用真的拉桿，不呼叫函式）", () => {
  // ⚠️ v2 之後首屏第一組 .big3 是「一生需求／缺口改善／願景達成」，
  //    拉桿連動的是 v1 gapHeroHTML 那一組（現值缺口／保守情境／願景達成度），
  //    它現在住在「拉桿與處方（v1 診斷）」收合區裡 → 要跳過首屏那一組。
  const bigs = () =>
    [...w.document.querySelectorAll(".big3")]
      .filter((g: Element) => !g.classList.contains("v2big"))[0]
      ?.querySelectorAll(".b")
      ? [...([...w.document.querySelectorAll(".big3")]
          .filter((g: Element) => !g.classList.contains("v2big"))[0]
          .querySelectorAll(".b"))].slice(0, 3)
          .map((e: Element) => (e.querySelector(".v")?.textContent || "").trim())
      : [];

  const pull = (idx: number, val: string) => {
    const ranges = w.document.querySelectorAll('input[type=range]');
    const r = ranges[idx] as HTMLInputElement;
    expect(r, "第 " + idx + " 根拉桿要存在").toBeTruthy();
    r.value = val;
    r.dispatchEvent(new w.Event("change", { bubbles: true }));
  };

  it("拉「減少支出」之後，現值缺口／保守情境／願景達成度三個都要變", () => {
    w.clearDraft();
    w.app.dataTab = "plan"; w.render();
    const before = bigs();
    expect(before[0]).not.toBe("0");          // 範例個案本來就有缺口
    pull(1, "15");                            // 0=增加收入 1=減少支出
    expect(w.n(cur().plan.draft.expense)).toBe(15);
    const after = bigs();
    expect(after[0], "現值缺口要跟著變").not.toBe(before[0]);
    expect(after[2], "願景達成度要跟著變").not.toBe(before[2]);
  });

  it("有拉桿時會標示「調整後」，並把調整前的數字用刪除線留著當參照", () => {
    const h = pane();
    expect(h).toContain("調整後");
    expect(h).toContain("line-through");
    expect(h).toContain("下面這些數字已套用");
  });

  it("歸零之後三個數字回到現況", () => {
    const withDraft = bigs();
    w.clearDraft();
    const back = bigs();
    expect(back[0]).not.toBe(withDraft[0]);
    expect(back[0]).toBe(w.fmt(w.gapPV(cur())));
  });

  it("「該解什麼」刻意不跟拉桿走（它是診斷，不是結果），而且畫面上要講明白", () => {
    w.clearDraft(); w.render();
    // 有草稿時會多一行說明（baseNote），那行本來就只在有拉桿時出現——
    // 要比的是「反解出來的六根條子有沒有變」，所以先把那行剝掉。
    const strip = (s: string) =>
      s.replace(/<div class="hint"[^>]*>以下以[\s\S]*?<\/div>/, "");
    const soloBefore = strip(w.soloHTML(cur(), w.soloSolve(cur()), true));
    pull(1, "15");
    const soloAfter = strip(w.soloHTML(cur(), w.soloSolve(cur()), true));
    expect(soloAfter).toBe(soloBefore);        // 反解基準不變
    expect(pane()).toContain("未調整的現況");    // 但畫面上有說
    w.clearDraft();
  });

  it("六根拉桿都能透過真實事件寫進 draft", () => {
    w.clearDraft(); w.app.dataTab = "plan"; w.render();
    const ranges = w.document.querySelectorAll('input[type=range]');
    expect(ranges.length).toBe(w.LEVERS.length);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    w.LEVERS.forEach((L: any, i: number) => {
      const r = w.document.querySelectorAll('input[type=range]')[i] as HTMLInputElement;
      if (r.disabled) return;                  // 階段閘門鎖住的那根跳過
      const mid = (Number(r.min) + Number(r.max)) / 2;
      r.value = String(mid);
      r.dispatchEvent(new w.Event("change", { bubbles: true }));
      expect(w.n(cur().plan.draft[L.id]), L.name + " 沒寫進 draft").toBeCloseTo(mid, 6);
    });
    w.clearDraft();
  });
});
