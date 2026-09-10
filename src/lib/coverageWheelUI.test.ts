import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 保障中心 · 嵐途雙環風險需求圖（賓士圖）— 前端切口與後端結構的對拍（2026/09/10）。
 *
 * 這張圖是「呈現層」：教練在客戶面前談的是三個問句（走了誰接手／倒下了誰養／住院誰付），
 * 後端卻是保單健診那套完整結構。圖負責把後端照諮詢順序重排一次，**不重算任何東西**。
 *
 * Ray 2026/09/10 拍板的兩條收斂規則，就是這支測試在守的：
 *   ① 圖上有、後端沒有 → 增設欄位（盤點下來 12 格全部對得到，一格都沒增）。
 *   ② 後端有、圖上沒有 → 收進紀錄框的「進階」區，**一個都不能漏**。
 *
 * ⚠️⚠️ 最重要的是 `五格 + 進階 === grossLifeNeed` 那一條：責任環的五格在引擎裡
 * 合成一條壽險缺口，只要有人在 grossLifeNeed() 加一項卻忘了掛上圖，
 * 客戶就會看到「圖上五格加起來 1,712 萬、右邊需求寫 1,772 萬」——
 * 同一份資料兩個數字，而且不會噴任何錯。
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
  w.app.dataTab = "coverage";
  w.app.cases = [w.migrateCase(w.sampleCase())];
  w.app.activeId = w.app.cases[0].id;
  w.render();
});

const cur = () => w.app.cases[0];
const pane = () => (w.document.querySelector("#app") as HTMLElement).innerHTML as string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cells = (): any[] => w.COV_WHEEL.flatMap((r: any) => r.cells);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fieldKeys = (arr: any[] | undefined) => (arr || []).map((f: any) => f[0] as string);

describe("賓士圖的形狀", () => {
  it("三個內環，外環 5／3／4 共十二格", () => {
    expect(w.COV_WHEEL.map((r: { ring: string }) => r.ring)).toEqual(["責任", "重病重殘", "醫療"]);
    expect(w.COV_WHEEL.map((r: { cells: unknown[] }) => r.cells.length)).toEqual([5, 3, 4]);
    expect(cells()).toHaveLength(12);
  });

  it("重病重殘的順序＝長期照護金 → 意外傷殘 → 重大疾病（Ray 2026/09/10 對調）", () => {
    const ring = w.COV_WHEEL.find((r: { ring: string }) => r.ring === "重病重殘");
    expect(ring.cells.map((c: { key: string }) => c.key)).toEqual(["care", "disability", "critical"]);
  });

  it("圖畫在保障中心最上面，且整塊掛 data-calc 才會即時重算", () => {
    const h = pane();
    // 圖與總額永遠在；cwNums／cwDeriv 是紀錄框的衍生區，選了格子才會出現。
    ["cwWheel", "cwTots"].forEach((k) => {
      expect(h, k + " 這個衍生區不見了").toContain('data-calc="' + k + '"');
    });
    w.app.covCell = "醫療|misc";
    w.covRedraw();
    const h2 = pane();
    ["cwNums", "cwDeriv"].forEach((k) => {
      expect(h2, k + " 這個衍生區不見了").toContain('data-calc="' + k + '"');
    });
    w.app.covCell = "";
    w.covRedraw();
    // 賓士圖必須排在「保單檢查報告」那一區之前。
    // ⚠️ 不能比對裸字串「保單檢查報告」——ppband 的提示文字裡就有這四個字，
    //    位置比圖還前面，比對會恆假。要比的是那一區真正的 <h4>。
    expect(h.indexOf("嵐途雙環風險需求圖")).toBeGreaterThan(-1);
    expect(h.indexOf("嵐途雙環風險需求圖")).toBeLessThan(h.indexOf("<h4>保單檢查報告"));
  });

  it("下方九個既有區塊一個都沒被拿掉", () => {
    const h = pane();
    ["保單檢查報告", "全家保障地圖", "產險涵蓋", "產險比對", "生命資產表", "保費報表",
     "$領回報表", "主約效益分析", "現有保單", "保障需求", "已備保障"].forEach((t) => {
      expect(h, t + " 不見了").toContain(t);
    });
  });
});

describe("規則①：圖上的每個欄位，後端都真的有", () => {
  it("圖上引用的 needs 欄位全部存在於 NEED_BLOCKS", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backend = new Set<string>(w.NEED_BLOCKS.flatMap((b: any) => b.fields.map((f: any) => f[0])));
    const onWheel = [
      ...cells().flatMap((c) => [...fieldKeys(c.fields), ...fieldKeys(c.adv)]),
      // 內環自己帶的進階欄（責任：遺產稅／保障年數／家計負擔%）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...w.COV_WHEEL.flatMap((r: any) => fieldKeys(r.adv)),
    ];
    const ghost = onWheel.filter((k) => !backend.has(k) && k !== "depRatioOverride");
    expect(ghost, "圖上掛了不存在的欄位：" + ghost.join("、")).toEqual([]);
  });

  it("圖上引用的險種全部在 KINDS 之內", () => {
    const kinds = new Set<string>(w.KINDS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const used: string[] = cells().flatMap((c: any) => w.covCellKinds(c));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    w.COV_WHEEL.forEach((r: any) => { if (r.kind) used.push(r.kind); });
    const ghost = used.filter((k) => !kinds.has(k));
    expect(ghost, "圖上掛了不存在的險種：" + ghost.join("、")).toEqual([]);
  });
});

describe("規則②：後端的每個欄位都有家，一個都不能漏", () => {
  it("NEED_BLOCKS 的每一個欄位，不是主欄就是進階欄", () => {
    const homed = new Set<string>([
      ...cells().flatMap((c) => [...fieldKeys(c.fields), ...fieldKeys(c.adv)]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...w.COV_WHEEL.flatMap((r: any) => fieldKeys(r.adv)),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backend: string[] = w.NEED_BLOCKS.flatMap((b: any) => b.fields.map((f: any) => f[0]));
    const orphan = backend.filter((k) => !homed.has(k));
    expect(orphan, "需求卡有這些欄位，但賓士圖上下都找不到：" + orphan.join("、")).toEqual([]);
  });

  it("十個險種每一個都對得到圖上某一格（缺口不會有孤兒）", () => {
    const covered = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cells().forEach((c: any) => w.covCellKinds(c).forEach((k: string) => covered.add(k)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    w.COV_WHEEL.forEach((r: any) => { if (r.kind) covered.add(r.kind); });
    const orphan = (w.KINDS as string[]).filter((k) => !covered.has(k));
    expect(orphan, "這些險種在圖上沒有位置：" + orphan.join("、")).toEqual([]);
  });
});

describe("圖不重算：數字必須與既有引擎同源", () => {
  it("⚠️ 責任五格 ＋ 遺產稅 ＋ 個人連帶保證 ＝ grossLifeNeed（一塊錢都不能差）", () => {
    const c = cur();
    const nd = c.needs[0];
    const ring = w.COV_WHEEL[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const five = ring.cells.reduce((a: number, cl: any) => a + w.covCellAmt(c, nd, cl), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auto = ring.advAuto.reduce((a: number, x: any) => a + x.calc(c, nd), 0);
    expect(five + Number(nd.estateTax || 0) + auto).toBeCloseTo(w.grossLifeNeed(c, nd), 6);
  });

  it("病房費＋自付差額＋看護費 ＝ medicalDailyNeed", () => {
    const c = cur();
    const nd = c.needs[0];
    const med = w.COV_WHEEL[2];
    const room = med.cells.find((x: { key: string }) => x.key === "room");
    const nurse = med.cells.find((x: { key: string }) => x.key === "nursing");
    expect(w.covCellAmt(c, nd, room) + Number(nd.selfPay || 0) + w.covCellAmt(c, nd, nurse))
      .toBe(w.medicalDailyNeed(nd));
  });

  it("圓心與三個總額走 gapTotals()，三種單位不相加", () => {
    const c = cur();
    const gt = w.gapTotals(c);
    const h = w.covTotsHTML(c) + w.covWheelSVG(c, c.needs[0]);
    expect(h).toContain(w.fmt(gt.lump));
    expect(h).toContain(w.fmt(gt.daily));
    expect(h).toContain(w.fmt(gt.monthly));
  });

  it("格子狀態直接讀 coverageGaps()：示範案的醫療雜費是「已備超過需求」", () => {
    const c = cur();
    const nd = c.needs[0];
    const gm = w.covGapMap(c, nd);
    const misc = w.COV_WHEEL[2].cells.find((x: { key: string }) => x.key === "misc");
    expect(gm["醫療雜費"].gap).toBeLessThan(0);
    expect(w.covCellState(c, nd, misc, gm)).toBe("high");
    const life = w.COV_WHEEL[0].cells.find((x: { key: string }) => x.key === "living");
    expect(w.covCellState(c, nd, life, gm)).toBe("gap");
  });
});

describe("點格子與改欄位", () => {
  it("點一次開、再點一次關；紀錄框長在圖旁邊而不是遮罩彈窗", () => {
    w.app.covCell = "";
    w.covPick("責任", "funeral");
    expect(w.app.covCell).toBe("責任|funeral");
    const pad = w.document.querySelector(".cwpad") as HTMLElement;
    expect(pad).toBeTruthy();
    expect(pad.innerHTML).toContain("生命禮儀費");
    // 沒有全螢幕遮罩：紀錄框必須是版面的一欄，不是蓋在圖上面
    expect(w.document.querySelector(".cwmask")).toBeNull();
    w.covPick("責任", "funeral");
    expect(w.app.covCell).toBe("");
  });

  it("自動帶入的四格不給輸入框，改成來源說明＋跳頁鈕", () => {
    const c = cur();
    w.app.covCell = "責任|loan";
    const h = w.covPadHTML(c, c.needs[0], 0);
    expect(h).toContain("自動帶入");
    expect(h).toContain("負債表餘額合計");
    expect(h).toContain("jumpTab(&#039;finance&#039;)".replace(/&#039;/g, "'"));
    expect(h).not.toContain('class="cwf"');
  });

  it("責任的責任開關關掉，那一格就歸零、壽險需求同步變小", () => {
    const c = cur();
    const nd = c.needs[0];
    const before = w.grossLifeNeed(c, nd);
    const loan = w.COV_WHEEL[0].cells.find((x: { key: string }) => x.key === "loan");
    expect(w.covCellAmt(c, nd, loan)).toBeGreaterThan(0);
    nd.payDebt = false;
    expect(w.covCellAmt(c, nd, loan)).toBe(0);
    expect(w.grossLifeNeed(c, nd)).toBeLessThan(before);
    delete nd.payDebt;
  });

  it("紀錄框的輸入框走 setLive/set，與需求卡同一條寫入路徑", () => {
    const c = cur();
    w.app.covCell = "醫療|room";
    const h = w.covPadHTML(c, c.needs[0], 0);
    expect(h).toContain("setLive('needs:0','room'");
    expect(h).toContain("set('needs:0','room'");
    w.app.covCell = "";
  });

  it("SVG 的 max-width 與 viewBox 同值（不同會讓字級等比放大）", () => {
    const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
    expect(html).toContain(".cwwheel svg{display:block;max-width:600px");
    expect(w.covWheelSVG(cur(), cur().needs[0])).toContain('viewBox="0 0 600 620"');
  });
});

describe("syncCalcNodes 的重入鎖", () => {
  /**
   * ⚠️ 這一條守的是「打第二個字，前面打的全部被蓋掉」那個 bug。
   * 還原焦點的 x.focus() 會讓剛被換掉的舊 input 補噴一次 change → set() → syncDerived()
   * → syncCalcNodes 重入，外層拿到的節點已經脫離 DOM，游標還原就打在空氣上。
   * 賓士圖的紀錄框是第一個同時掛 oninput 與 onchange 的 data-calc 區塊，所以是它先踩到。
   */
  it("重入時直接返回，不會把外層正在還原的節點再換掉一次", () => {
    const orig = w.CALC.cwTots;
    let hits = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    w.CALC.cwTots = (c: any) => { hits++; w.syncCalcNodes(); return orig(c); };
    try {
      w.syncCalcNodes();
      expect(hits, "內層那一次沒有被擋掉").toBe(1);
    } finally {
      w.CALC.cwTots = orig;
    }
  });

  it("鎖用 try/finally 釋放：丟例外之後下一次仍然能跑", () => {
    const orig = w.CALC.cwTots;
    w.CALC.cwTots = () => { throw new Error("boom"); };
    try { w.syncCalcNodes(); } catch { /* CALC 的例外本來就被 syncCalcNodes 吞掉 */ }
    let hits = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    w.CALC.cwTots = (c: any) => { hits++; return orig(c); };
    w.syncCalcNodes();
    w.CALC.cwTots = orig;
    expect(hits, "鎖沒有被釋放，之後所有衍生數字都不會再更新").toBe(1);
  });
});

describe("輸入框不能住在會被 innerHTML 換掉的容器裡", () => {
  /**
   * ⚠️⚠️ 這是本專案踩過四次的同一個坑（購置試算的利率、需求卡的保障年數、
   * 產險比對的保額覆寫，現在是賓士圖的紀錄框）：syncCalcNodes() 用 innerHTML
   * 換掉整個 data-calc 容器，正在打字的 input 會被換走——值被模型值正規化、
   * 游標掉、而且舊 input 在被換掉的瞬間還會補噴一次 change。
   * 所以四個衍生區裡一個 <input> 都不能有。
   */
  it("cwWheel／cwTots／cwNums／cwDeriv 的輸出都沒有輸入框", () => {
    const c = cur();
    w.app.covCell = "責任|funeral";
    const i = w.covNeedIdx(c);
    [w.CALC.cwWheel(c), w.CALC.cwTots(c), w.CALC.cwNums(c), w.CALC.cwDeriv(c)].forEach((h: string) => {
      expect(h).not.toMatch(/<input|<select|<textarea/);
    });
    // 外殼本身當然要有輸入框，否則這一格根本不能填
    expect(w.covPadHTML(c, c.needs[i], i)).toContain("<input");
    w.app.covCell = "";
  });

  it("紀錄框裡的輸入框，都落在 data-calc 容器之外", () => {
    w.app.covCell = "醫療|room";
    w.covRedraw();
    const pad = w.document.querySelector(".cwpad") as HTMLElement;
    const ins = [...pad.querySelectorAll("input")];
    expect(ins.length).toBeGreaterThan(0);
    ins.forEach((el: Element) => {
      expect(el.closest("[data-calc]"), (el.getAttribute("oninput") || "") + " 掉進衍生區了").toBeNull();
    });
    w.app.covCell = "";
    w.covRedraw();
  });
});
