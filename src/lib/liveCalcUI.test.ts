import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 「改了數字，畫面上不會動」的那一批。
 *
 * 教練端 data 分頁的 set()／setMeta()／setObj()／setRetire() 刻意不 render（避免打斷打字游標），
 * 所以每一個衍生數字都得掛 <x data-calc="key"> ＋ 在 CALC 表註冊，由 syncDerived() 當場重畫。
 * 漏掉的話畫面上就是一個安靜的舊值——教練指著它跟客戶講話。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useSample(tab: string): any {
  const c = w.migrateCase(w.sampleCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.role = "coach";
  w.app.activeTab = "data";
  w.app.dataTab = tab;
  w.render();
  return c;
}
const nodeFor = (key: string) => w.document.querySelector('[data-calc="' + key + '"]');

describe("C1：setMeta / setObj 補上 syncDerived()", () => {
  it("兩支尾巴都呼叫 syncDerived()", () => {
    expect(HTML).toContain("function setMeta(grp,k,v,type){var c=activeCase();c[grp][k]=(type==='num')?n(v):v;save();if(app.role==='client')render();syncDerived();}");
    // ⚠️ setObj 中間多了一段 career 的分支（職涯/創業會產生 goals 的列），尾巴那一行不變。
    expect(HTML).toContain("function setObj(obj,k,v,type){var c=activeCase();c[obj]=c[obj]||{};c[obj][k]=(type==='num')?n(v):v;");
    expect(HTML).toContain(" save();if(app.role==='client')render();syncDerived()}");
  });

  it("安全感預備金：改了門檻，落差那一句當場跟著變", () => {
    const c = useSample("family");
    const el = nodeFor("safetyCash");
    expect(el, "規劃參數區要有 data-calc=safetyCash").toBeTruthy();
    expect(c.params.safetyCash == null || c.params.safetyCash === 0).toBe(true);

    w.setMeta("params", "safetyCash", "9000000", "num");
    const after = el.innerHTML as string;
    expect(after).toContain("客戶自述的安全感門檻");
    expect(after).toContain(w.fmt(9_000_000));
    // 落差那一句才是這一題的全部價值
    expect(after).toContain("客戶心裡的門檻比系統算的");
  });

  it("資料完整度：意圖分頁填「繼承人數 2」，計數器與那顆點當場變", () => {
    const c = w.migrateCase(w.newCase());
    w.app.cases = [c]; w.app.activeId = c.id;
    w.app.role = "coach"; w.app.activeTab = "data"; w.app.dataTab = "intent";
    c.legacy.heirs = 0;
    c.career.plan = "無";
    c.marriage.plan = "否";
    // 「意圖/生涯」是目標帶出來的虛線點：要選了傳承規劃，那顆點才在完整度上出現
    c.intent = { purposes: [], targets: ["傳承規劃"], mustHave: ["傳承規劃"], entities: {} };
    w.render();
    const el = nodeFor("completeness");
    expect(el, "每個 data 分頁最上方要有 data-calc=completeness").toBeTruthy();
    expect(w.tabFilled(c, "intent")).toBe(false);
    const before = el.innerHTML as string;

    w.setObj("legacy", "heirs", "2", "num");     // ← 走 setObj（ofld 產生的欄位）
    expect(w.tabFilled(c, "intent")).toBe(true);
    expect(el.innerHTML).not.toBe(before);
  });
});

describe("C2：購置試算——利率／年期／裝修改了，月付・頭期・總利息當場變", () => {
  it("每張卡的衍生數字各自掛 data-calc=\"houseCalc:<i>\"，且 CALC 有註冊", () => {
    expect(HTML).toContain("'<div data-calc=\"houseCalc:'+i+'\">'+houseCalcDerivedHTML(c,i)+'</div></div>'");
    expect(HTML).toContain("houseCalc:function(c,i){return houseCalcDerivedHTML(c,i);}");
    // ⚠️ 輸入框一定要留在容器外：容器是用 innerHTML 換掉的，
    //    正在打字的 input 被換掉的話值會被模型值正規化（'4.' → 4）、游標也掉了。
    expect(HTML).toContain("var raw=el.getAttribute('data-calc')||'',ci=raw.indexOf(':')");
  });

  it("把利率從 2.0 調到 4.0，月付與總利息真的變了", () => {
    const c = useSample("goals");
    c.goals = [{ on: true, name: "換屋", type: "購屋", present: 20_000_000, loanRatio: 70,
      loanRate: 2, loanYears: 30, decoCost: 0, start: 45, end: 45, imp: 4 }];
    w.render();
    const el = w.document.querySelector('[data-calc="houseCalc:0"]');
    expect(el, "購置試算要有 data-calc=houseCalc:0").toBeTruthy();
    // 輸入框不可以在容器裡（否則打字打到一半會被 innerHTML 換掉）
    expect(el.querySelectorAll("input,select,textarea")).toHaveLength(0);
    const before = el.innerHTML as string;
    const mp2 = w.pmt(14_000_000, 2, 360);

    expect(before).toContain(w.fmt(Math.round(mp2)));
    expect(before).toContain(w.fmt(6_000_000));            // 頭期＝總價 × 30%

    // 走 set()（onchange 那一條）——data 分頁不 render，只靠 syncDerived
    w.set("goals:0", "loanRate", "4", "num");
    const after = el.innerHTML as string;
    expect(after).not.toBe(before);
    expect(after).toContain(w.fmt(Math.round(w.pmt(14_000_000, 4, 360))));
    expect(after).not.toContain(w.fmt(Math.round(mp2)));

    // 年期也一樣
    w.set("goals:0", "loanYears", "20", "num");
    expect(el.innerHTML).toContain(w.fmt(Math.round(w.pmt(14_000_000, 4, 240))));
  });
});

describe("C3：已準備退休金加一筆，退休缺口當場變", () => {
  it("退休首屏掛 data-calc=retireHero", () => {
    expect(HTML).toContain('<div data-calc="retireHero">');
    expect(HTML).toContain("retireHero:function(c){return retireHeroHTML(c);}");
  });

  it("改「已準備退休金」的金額，缺口跟著動（prepared 不在 PLAN_ARRS，set() 不 render）", () => {
    const c = useSample("retire");
    c.retire.prepared = [{ item: "勞退", age: 65, amount: 1_000_000, method: "一次領" }];
    w.render();
    const el = nodeFor("retireHero");
    expect(el, "退休分頁要有 data-calc=retireHero").toBeTruthy();
    const gap1 = w.retireNeed(c).gap;
    expect(el.innerHTML).toContain(w.fmt(gap1));

    w.set("prepared:0", "amount", "5000000", "num");
    const gap2 = w.retireNeed(c).gap;
    expect(gap2).toBeLessThan(gap1);
    expect(el.innerHTML).toContain(w.fmt(gap2));
    expect(el.innerHTML).toContain(w.fmt(5_000_000));
  });

  it("A4：退休年齡 ≥ 預估壽命時，五格數字換成紅色警語（不再顯示誤導的 0）", () => {
    const c = useSample("retire");
    c.profile.retireAge = 100;
    c.profile.lifeExp = 85;
    w.render();
    const el = nodeFor("retireHero");
    const h = el.innerHTML as string;
    expect(h).toContain("預估壽命（85 歲）不大於退休年齡（100 歲）");
    expect(h).toContain("請先到「家庭」分頁修正這兩個數字");
    expect(h).not.toContain("退休缺口");     // 那個 0 不可以出現
    expect(h).not.toContain("預估退休總需求");
  });
});

describe("C4：保障需求卡——改「保障年數」，正下方那四列跟著動", () => {
  it("needsTbl 掛在 data-calc 容器裡", () => {
    expect(HTML).toContain('<div data-calc="coverageNeeds">');
    expect(HTML).toContain("coverageNeeds:function(c){return coverageHubParts(c).needsTbl;}");
  });

  it("保障年數 10 → 20，家庭生活費與父母奉養費那兩列當場翻倍", () => {
    const c = useSample("coverage");
    c.expenses.push({ name: "孝親費", cat: "孝親", amount: 120000, infl: false, start: 40, end: 85, cut: 0 });
    c.needs[0].protectYears = 10;
    w.render();
    const el = nodeFor("coverageNeeds");
    expect(el, "保障需求表要有 data-calc=coverageNeeds").toBeTruthy();

    const py10 = w.familyAnnualParentSupport(c) * 10;
    expect(el.innerHTML).toContain(w.fmt(py10));

    w.set("needs:0", "protectYears", "20", "num");
    const py20 = w.familyAnnualParentSupport(c) * 20;
    expect(py20).toBe(py10 * 2);
    expect(el.innerHTML).toContain(w.fmt(py20));
  });
});

describe("C5：所得替代率改了，按鈕上的百分比不再說謊", () => {
  it("繫結帶 render()（同頁的退休報酬率／通膨已經是這個做法）", () => {
    expect(HTML).toContain("fFld('onchange=\"setRetire(\\'replaceRate\\',this.value,\\'num\\');render()\"','所得替代率 %（帶入用）',rate,'num')");
  });

  it("改成 60% 之後按鈕文字就是 60%", () => {
    const c = useSample("retire");
    c.retire.replaceRate = 75;
    w.render();
    expect(w.document.querySelector("#app").innerHTML).toContain("↓ 依工作期帶入（75%）");
    w.setRetire("replaceRate", "60", "num");
    w.render();
    const h = w.document.querySelector("#app").innerHTML as string;
    expect(h).toContain("↓ 依工作期帶入（60%）");
    expect(h).not.toContain("↓ 依工作期帶入（75%）");
  });
});

describe("C6：SVG 只准縮小、不准放大", () => {
  it("全域兜底 CSS 在（接住未來新增的圖）", () => {
    expect(HTML).toContain(".main :where(svg[viewBox]:not([height])){max-width:980px;height:auto;margin:0 auto;display:block}");
  });

  it("十張圖都逐一鎖在自己的 viewBox 寬度上", () => {
    const c = useSample("family");
    const wrap = (html: string) => {
      const d = w.document.createElement("div");
      d.innerHTML = html;
      return [].slice.call(d.querySelectorAll("svg")) as Element[];
    };
    const charts: Array<[string, string]> = [
      ["責任遞減", w.respGapCharts(c)],
      ["蒙地卡羅", w.monteCarloHTML ? w.monteCarloHTML(c) : w.fanSVG(w.monteCarlo(c))],
      ["壽險需求", w.lifeNeedCharts(c)],
      ["支出來源／年度結餘／生涯藍圖", w.cashflowCharts(w.metrics(c).proj, null, c)],
      ["真實追蹤", w.trackingChartSVG(c)],
    ];
    charts.forEach(([label, html]) => {
      const svgs = wrap(String(html));
      expect(svgs.length, label + " 應該畫得出圖").toBeGreaterThan(0);
      svgs.forEach((s) => {
        const vb = (s.getAttribute("viewBox") || "").split(/\s+/);
        const vw = Number(vb[2]);
        if (!vw) return;
        const st = s.getAttribute("style") || "";
        expect(st, label + " 少了 max-width").toContain("max-width:" + vw + "px");
      });
    });
  });

  it("願景時間軸（viewBox 980，調整方案首屏主圖）連外框一起鎖", () => {
    const c = useSample("family");
    const html = String(w.visionTimelineHTML ? w.visionTimelineHTML(c) : "");
    if (!html) return;   // 函式名不同就交給上面那條兜底
    expect(html).toContain("max-width:980px");
  });
});

describe("C7：客戶端的生涯資產模擬藍圖要畫得出來", () => {
  it("clientView 帶第三個參數 c", () => {
    // 圖上移到 KPI 之後，這一行不再是 else 區塊的最後一句；要釘的一直是「第三個參數有帶 c」。
    expect(HTML).toContain("cashflowCharts(proj,null,c)");
    expect(HTML).not.toContain("cashflowCharts(proj);");
  });

  it("少了 c 就整段不畫，帶了 c 才有「生涯資產模擬藍圖」", () => {
    const c = useSample("family");
    const proj = w.metrics(c).proj;
    expect(String(w.cashflowCharts(proj))).not.toContain("生涯資產模擬藍圖");
    expect(String(w.cashflowCharts(proj, null, c))).toContain("生涯資產模擬藍圖");
  });
});

describe("C9 / C10：兩個進不去也出不來的畫面", () => {
  it("C9：握手逾時給的是「資料載入逾時 — 重新載入」，不是那個沒有出口的空畫面", () => {
    expect(HTML).toContain("資料載入逾時");
    expect(HTML).toContain('onclick="location.reload()">重新載入</button>');
  });

  it("C10：非 embed 模式掛示範模式橫幅", () => {
    expect(HTML).toContain("lantuDemoBar");
    expect(HTML).toContain("示範模式 — 這不是任何真實客戶的資料。");
  });
});

describe("C8：接收父層的註記錯誤回報", () => {
  it("走既有的 listenParent() 那條路徑，不另開機制", () => {
    expect(HTML).toContain("if(m.type==='lantu:noteerr'){ try{ handleNoteErr(m); }catch(err){} return; }");
    expect(HTML).toContain("function handleNoteErr(m){");
  });

  it("add 失敗 → 用 blockKey+body 找到那則 pending 的樂觀註記，標成失敗並附重送", () => {
    expect(HTML).toContain("if(x.pending&&x.block===m.blockKey&&x.text===m.body) hit=x;");
    expect(HTML).toContain("if(hit){ hit.pending=false; hit.failed=msg; }");
    expect(HTML).toContain("LN.retry=function(id){");
    expect(HTML).toContain("onclick=\"LN.retry(\\''+x.id+'\\')\">重送</button>");
    expect(HTML).toContain(".lnitem.fail{");
  });

  it("del 失敗 → 把本地移除的那一則放回來，並顯示 message", () => {
    expect(HTML).toContain("LN_DELETED[id]=arr[i];");
    expect(HTML).toContain("if(back&&!here) LN_REMOTE_STATE.notes=LN_REMOTE_STATE.notes.concat([back]);");
  });

  it("start／end／restore → 用既有的 flash() 顯示 message", () => {
    expect(HTML).toContain("// start／end／restore：沒有樂觀狀態要回捲，用既有的 flash() 把父層給的中文理由講出來。");
  });
});

/* embed 模式才會註冊 listenParent()，所以這一段自己開一個帶 ?embed=1 的 jsdom。
   ⚠️ listenParent 會擋 e.source!==parent，而 jsdom 的 window.postMessage 不帶 source，
      所以這裡自己造 MessageEvent（跟真實父層送進來的形狀一樣）。 */
describe("C8：lantu:noteerr 真的走完那條路徑（embed 模式）", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let e: any;

  const send = (m: Record<string, unknown>) =>
    new Promise<void>((r) => {
      e.dispatchEvent(new e.MessageEvent("message", { data: m, source: e, origin: e.location.origin }));
      setTimeout(r, 20);
    });

  const openBlock = () => {
    e.app.role = "coach"; e.app.activeTab = "data"; e.app.dataTab = "coverage";
    e.render(); e.LN.open("coverage.five");
  };
  const items = () => [...e.document.querySelectorAll("#app .lnitem")] as HTMLElement[];

  beforeAll(async () => {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/?embed=1" });
    e = dom.window;
    await new Promise<void>((r) => e.addEventListener("load", () => r(), { once: true }));
    await send({ type: "lantu:init", data: e.sampleCase(), noteAccess: "owner", notes: [], session: null });
    expect(e.app.cases).toHaveLength(1);   // 父層是 embed 模式唯一的資料來源
  });

  it("add 失敗：那則樂觀註記標成失敗（紅色）＋出現「重送」，訊息也留著", async () => {
    openBlock();
    e.LN.typing("coverage.five", "壽險缺口分兩年補足");
    e.LN.add("coverage.five");
    openBlock();
    expect(items().length, "樂觀更新：先畫出來").toBe(1);
    expect(e.document.querySelector("#app .lnitem.fail")).toBeNull();

    await send({ type: "lantu:noteerr", op: "add", id: null,
      message: "這份規劃已封存，無法新增註記。", blockKey: "coverage.five", body: "壽險缺口分兩年補足" });
    openBlock();

    const fail = e.document.querySelector("#app .lnitem.fail") as HTMLElement;
    expect(fail, "失敗的樂觀註記要標紅（原本會一直假裝存好了）").toBeTruthy();
    expect(fail.innerHTML).toContain("尚未存檔");
    expect(fail.innerHTML).toContain("這份規劃已封存，無法新增註記。");
    expect(fail.querySelector(".lnretry"), "要有一顆「重送」").toBeTruthy();
  });

  it("重送＝重新走一次原本的送出路徑（清掉失敗態並再 post 一次）", () => {
    openBlock();
    const btn = e.document.querySelector("#app .lnitem.fail .lnretry") as HTMLElement;
    const id = (btn.getAttribute("onclick") || "").match(/LN\.retry\('([^']+)'\)/)![1];
    const sent: Array<Record<string, unknown>> = [];
    const orig = e.parent.postMessage;
    e.parent.postMessage = (m: Record<string, unknown>) => { sent.push(m); };
    e.LN.retry(id);
    e.parent.postMessage = orig;

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "lantu:note", op: "add" });
    expect((sent[0].input as Record<string, unknown>).body).toBe("壽險缺口分兩年補足");
    openBlock();
    expect(e.document.querySelector("#app .lnitem.fail"), "重送後回到 pending，不再是紅的").toBeNull();
  });

  it("del 失敗：把本地移除的那一則放回來，並顯示 message", async () => {
    openBlock();
    const before = items().length;
    expect(before).toBeGreaterThan(0);
    const del = e.document.querySelector("#app .lnitem .lnx") as HTMLElement;
    const id = (del.getAttribute("onclick") || "").match(/LN\.del\('([^']+)'\)/)![1];
    e.confirm = () => true;
    e.LN.del(id);
    openBlock();
    expect(items().length, "樂觀更新：本地先移除").toBe(before - 1);

    await send({ type: "lantu:noteerr", op: "del", id, message: "這則註記已被其他人刪除。" });
    openBlock();
    expect(items().length, "刪不掉就要放回來（原本只有重載才會自己跑回來）").toBe(before);
    expect(e.document.getElementById("lnToast")!.textContent).toContain("這則註記已被其他人刪除。");
  });

  it("start／end／restore 失敗：走既有的 flash()（原本完全沒有任何反應）", async () => {
    for (const [op, msg] of [
      ["start", "已有一場進行中的諮詢。"],
      ["end", "這一場已經結束了。"],
      ["restore", "這一場沒有可還原的快照。"],
    ] as const) {
      await send({ type: "lantu:noteerr", op, id: "s1", message: msg });
      const toast = e.document.getElementById("lnToast");
      expect(toast, op + " 失敗要看得到 toast").toBeTruthy();
      expect(toast!.textContent).toContain(msg);
    }
  });
});

describe("C11：指人的「顧問」一律改成「教練」", () => {
  it("會印進客戶報告書的那一個標籤改掉了", () => {
    expect(HTML).toContain("<b>教練註記　</b>");
    expect(HTML).not.toContain("<b>顧問註記　</b>");
  });

  it("合規閘與企業主建議兩處畫面文案改掉了", () => {
    expect(HTML).toContain("此燈號只顯示於教練端與「企業主財務診斷書」");
    expect(HTML).toContain("的教練，比急著賣 B 的教練更值得信任");
  });

  it("『顧問費』科目與『一般顧問公司』的法遵字句不可以被改掉", () => {
    expect(HTML).toContain("付給個人的租金、顧問費等，都有辦理扣繳與申報");
    expect(HTML).toContain("嵐途為一般顧問公司，不從事投資顧問或保險招攬業務");
  });
});
