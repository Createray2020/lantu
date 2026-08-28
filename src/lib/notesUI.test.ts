import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 區塊註記的 UI 測試。
 *
 * 這個功能會不會活下來，取決的不是「有沒有欄位」而是「有沒有人填」，
 * 而讓人願意填的是三件事——所以這裡釘住的是那三件事，不是欄位存在與否：
 *
 *   1. 系統先寫一句（吃真實引擎數字），人只要接下去。
 *      ⚠️ 這一項曾經整片壞掉過：MOUNTS 陣列在 pre 函式定義之前就建立，
 *         所有 pre 都是 undefined，畫面上那行 💬 完全不出現，而且不噴任何錯誤。
 *   2. 有異常（缺口）才醒目，其他時候收成一行不干擾諮詢當下的畫面。
 *   3. 掛點是手挑的少數區塊，不是全部 115 個 .sec —— 每個都掛＝沒人填。
 *
 * 另外釘住合規線：visible 預設關，且不是主責寫的一律不得為 true。
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

function go(tab: string) {
  w.app.activeTab = "data";
  w.app.dataTab = tab;
  w.render();
}
const bars = () => [...w.document.querySelectorAll("#app .lnwrap")];
const keys = () => (w.LN.mountedKeys ?? []) as string[];

describe("掛點：手挑的少數區塊，不是每個 .sec 都掛", () => {
  it("每個分頁掛上的數量遠少於該分頁的 .sec 數", () => {
    go("plan");
    const secs = w.document.querySelectorAll("#app .sec").length;
    expect(secs).toBeGreaterThan(10);
    expect(keys().length).toBeLessThan(secs / 2);
    expect(keys().length).toBeGreaterThan(0);
  });

  it.each([
    ["coverage", "coverage.five"],
    ["retire", "retire.flow"],
    ["incomes", "fin.income"],
    ["plan", "plan.actions"],
    ["goals", "goals.list"],
    ["tax", "tax.income"],
  ])("%s 分頁掛得到 %s", (tab, key) => {
    go(tab);
    expect(keys()).toContain(key);
  });

  it("16 個資料分頁全都至少掛上一個（掛點靠標題比對，改標題會靜默失聯）", () => {
    const tabs = [
      "family", "finance", "incomes", "expenses", "assets", "liabilities",
      "retire", "education", "goals", "lifestyle", "coverage", "tax",
      "intent", "plan", "risk", "credit",
    ];
    const dead = tabs.filter((t) => { go(t); return keys().length === 0; });
    expect(dead, `這些分頁一個掛點都沒掛上：${dead.join(", ")}`).toEqual([]);
  });
});

describe("系統先寫一句：每個掛點都吃得到真實引擎數字", () => {
  it("展開後一定有 💬 那一行，而且不是空的", () => {
    go("coverage");
    w.LN.open("coverage.five");
    const pre = w.document.querySelector("#app .lnpre");
    expect(pre, "預填句整片不見＝MOUNTS 又在 pre 函式定義前就建立了").toBeTruthy();
    expect(pre.textContent.replace(/\s/g, "").length).toBeGreaterThan(8);
  });

  it("保障的預填句印得出壽險的已備／需求／缺口三個數字", () => {
    go("coverage");
    w.LN.open("coverage.five");
    const t = w.document.querySelector("#app .lnpre").textContent as string;
    expect(t).toMatch(/壽險/);
    expect(t).toMatch(/已備/);
    expect(t).toMatch(/需求/);
    // 千分位的金額，不是 NaN 也不是 0
    expect(t).toMatch(/[1-9][\d,]{4,}/);
  });

  it("資產的預填句是真的總額，不是 0（欄位是 value 不是 amount，踩過一次）", () => {
    go("assets");
    w.LN.open("fin.asset");
    const t = w.document.querySelector("#app .lnpre").textContent as string;
    expect(t).toMatch(/資產總額/);
    expect(t).not.toMatch(/資產總額\s*0\s*元/);
  });

  it("缺口的預填句讀得到 shortPV（它住在 metrics().proj 底下，不在頂層）", () => {
    go("plan");
    w.LN.open("plan.gap");
    const pres = [...w.document.querySelectorAll("#app .lnpre")].map((e) => (e as HTMLElement).textContent);
    expect(pres.join("|")).toMatch(/缺口|資金/);
  });

  it("每個掛點的預填句都非空（逐一掃過，不是抽驗）", () => {
    const tabs = ["family", "incomes", "expenses", "assets", "liabilities", "retire", "coverage", "tax", "goals", "credit"];
    const empty: string[] = [];
    for (const t of tabs) {
      go(t);
      for (const k of keys()) {
        const s = String(w.LN.prefillOf ? w.LN.prefillOf(k) : "");
        if (!s.replace(/<[^>]+>/g, "").trim()) empty.push(k);
      }
    }
    expect(empty, `這些掛點的預填句是空的：${empty.join(", ")}`).toEqual([]);
  });
});

describe("有異常才醒目", () => {
  it("保障有缺口時，註記帶是 alert 態並提示「建議記一句」", () => {
    go("coverage");
    const bar = bars().find((e) => (e as HTMLElement).outerHTML.includes("建議記一句"));
    expect(bar, "示範客戶的保障是有缺口的，這裡應該要醒目").toBeTruthy();
    expect((bar as HTMLElement).className).toContain("alert");
  });

  it("沒有缺口的區塊收成一行，不是 alert 態", () => {
    go("incomes");
    const bar = bars()[0] as HTMLElement;
    expect(bar.className).not.toContain("alert");
    expect(bar.querySelector(".lnopen")!.className).toContain("hide");
  });
});

describe("合規：客戶可見預設關，且只有主責能勾", () => {
  it("勾選框預設沒有 checked", () => {
    go("coverage");
    w.LN.open("coverage.five");
    const cb = w.document.querySelector('#app .lnchk input[type="checkbox"]');
    expect(cb).toBeTruthy();
    expect(cb.checked).toBe(false);
  });

  it("唯讀協作教練：勾選框是鎖住的（disabled），而且寫的註記標作者", () => {
    w.LN.setRole("viewer");
    go("coverage");
    w.LN.open("coverage.five");
    const cb = w.document.querySelector("#app .lnchk input");
    expect(cb.disabled).toBe(true);
    w.LN.typing("coverage.five", "退休年齡的假設偏樂觀，建議也做 65 的版本對照。");
    w.LN.add("coverage.five");
    const added = w.app.cases[0].notes.at(-1);
    expect(added.access).toBe("viewer");
    expect(added.visible, "協作教練寫的註記絕不可對客戶公開").toBe(false);
    expect(added.by).toBeTruthy();
    w.LN.setRole("owner");
  });

  it("客戶端：只寫得到事實層的區塊，寫的註記永遠不可見", () => {
    w.LN.setRole("client");
    go("incomes");
    w.LN.open("fin.income");
    w.LN.typing("fin.income", "租金是我父親的房子，他只收半價。");
    w.LN.add("fin.income");
    const added = w.app.cases[0].notes.at(-1);
    expect(added.access).toBe("client");
    expect(added.visible).toBe(false);
    w.LN.setRole("owner");
  });
});

describe("一場諮詢", () => {
  it("開場前寫的註記歸「日常維護」（sessId 為 null）", () => {
    go("coverage");
    w.LN.typing("coverage.five", "開場前先記的一句");
    w.LN.add("coverage.five");
    expect(w.app.cases[0].notes.at(-1).sessId).toBeNull();
  });

  it("開場後寫的自動歸屬這一場；結束後產出摘要並保留場次", () => {
    w.confirm = () => true;
    w.LN.session();
    const sid = w.app.cases[0].sess.id;
    expect(sid).toBeTruthy();
    expect(w.app.cases[0].sess.snap, "開場一定要釘住還原快照").toBeTruthy();
    w.LN.typing("coverage.five", "這一場談出來的決定");
    w.LN.draft["coverage.five"].kind = "decision";
    w.LN.add("coverage.five");
    expect(w.app.cases[0].notes.at(-1).sessId).toBe(sid);

    w.LN.session();   // 結束 → 批次勾選
    w.LN.finish();
    expect(w.app.cases[0].sess).toBeNull();
    expect(w.app.cases[0].sessions[0].id).toBe(sid);
  });

  it("還原只回復規劃資料，不會把這一場談出來的註記一起抹掉", () => {
    const c = w.app.cases[0];
    const sid = c.sessions[0].id;
    const before = c.incomes[0].amount;
    const noteCount = c.notes.length;
    c.incomes[0].amount = 9_999_999;
    w.confirm = () => true;
    w.LN.restore(sid);
    const after = w.app.cases[0];
    expect(after.incomes[0].amount).toBe(before);
    expect(after.notes.length, "按一次還原就失去這一場的註記＝誰都不想要的結果").toBe(noteCount);
  });
});

describe("客戶報告書：註記貼在對應章節，不集中成一章", () => {
  it("勾了客戶可見的註記會出現在對應章節底下", () => {
    const c = w.app.cases[0];
    c.notes = [
      { id: "n1", block: "coverage.five", kind: "decision", text: "壽險缺口分兩年補足，今年先補 150 萬。", visible: true, by: null, access: "owner", sessId: null, at: "" },
      { id: "n2", block: "retire.flow", kind: "basis", text: "這句是對內的，不該印出去。", visible: false, by: null, access: "owner", sessId: null, at: "" },
    ];
    w.app.activeTab = "report";
    w.app.reportDoc = "family";
    w.render();
    const html = w.document.querySelector("#app").innerHTML as string;
    expect(html).toMatch(/教練註記/);   // 2026/08/28 術語統一：指人的一律用「教練」
    expect(html).toMatch(/壽險缺口分兩年補足/);
    expect(html, "沒勾客戶可見的絕不能印進客戶文件").not.toMatch(/這句是對內的/);
  });

  it("貼在章節結尾（下一章的標題之前），不是全部堆在同一處", () => {
    w.app.activeTab = "report";
    w.render();
    const root = w.document.querySelector("#app");
    const note = root.querySelector(".lnrpn");
    expect(note).toBeTruthy();
    // 往後找到的第一個 h2，就是「下一章」——代表這則註記確實落在某一章的內部
    let el = note.parentElement.nextElementSibling as Element | null;
    while (el && el.tagName !== "H2") el = el.nextElementSibling;
    expect(el, "註記後面應該還有下一章，表示它貼在章節之間而不是文末").toBeTruthy();
  });

  it("重畫兩次不會把註記貼成兩份", () => {
    w.app.activeTab = "report";
    w.render();
    w.render();
    const n = w.document.querySelectorAll("#app .lnrpn").length;
    expect(n).toBe(1);
  });

  it("報告分頁沒有可見註記時，不留下空的殼", () => {
    w.app.cases[0].notes = [];
    w.app.activeTab = "report";
    w.render();
    expect(w.document.querySelectorAll("#app .lnrp").length).toBe(0);
  });
});
