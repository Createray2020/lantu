import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 「新增家庭成員」與子女教育之間的連動（2026/08/25 Ray 實測回報）。
 *
 * 三件事：
 *  1. 一按「＋ 新增家庭成員」就長出一位 0 歲子女 → 教育金當場自動生出幼兒園到大學的整套需求，
 *     使用者根本還沒開始填。
 *  2. ⚠️ 真正會留爛帳的是：把那位成員的角色改掉、或整個刪掉之後，`c.education` 裡
 *     `auto:true` 的列**沒有人負責清** —— 畫面上一個子女都沒有，教育金需求卻還在，
 *     而且找不到來源。
 *  3. 教育金分頁沒有子女時只丟一句「請去家庭分頁加人」，要人切走再切回來。
 *
 * ⚠️ 手動列（`auto!==true`）是既有客戶顧問一列一列填的，任何清理都不能碰。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
});

// 每個測試自己一份乾淨的 case（同一個 jsdom 實例的測試會互相污染）。
beforeEach(() => {
  const c = w.migrateCase(w.newCase());
  c.members = [{ name: "本人", role: "本人", gender: "男", age: 40, expRatio: 100, indepAge: "" }];
  c.education = [];
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.ensureMemberIds(c);
});

const auto = () => (w.activeCase().education || []).filter((e: { auto?: boolean }) => e.auto === true);

describe("新增家庭成員不再預設是子女", () => {
  it("剛加進來的成員角色是空的、年齡是空的", () => {
    w.addRow("members");
    const m = w.activeCase().members[1];
    expect(m.role).toBe("");
    expect(m.age).toBe("");
  });

  it("因此不會憑空生出教育金需求", () => {
    w.addRow("members");
    w.syncEduAll(w.activeCase());
    expect(auto()).toHaveLength(0);
    expect(w.eduTotal(w.activeCase())).toBe(0);
  });

  it("成員卡片會要求先選角色（不是靜靜沿用子女）", () => {
    w.addRow("members");
    const html = w.personCard(w.activeCase(), w.activeCase().members[1], 1, false);
    expect(html).toContain("請選擇角色");
  });
});

describe("選了子女、填了年齡才開始推算", () => {
  it("只選角色但沒填年齡 → 一列都不產生", () => {
    w.addRow("members");
    w.setMemberRole(1, "子女");
    w.syncEduAll(w.activeCase());
    expect(auto()).toHaveLength(0);
    // 卡片要講清楚在等什麼，不是顯示一張空表
    expect(w.eduChildCard(w.activeCase(), w.activeCase().members[1], 1)).toContain("尚未填年齡");
  });

  it("填了年齡就依學段自動帶入", () => {
    w.addRow("members");
    w.setMemberRole(1, "子女");
    w.activeCase().members[1].eduAuto = true;
    w.setEduChildAge(1, "6");
    w.syncEduAll(w.activeCase());
    expect(auto().length).toBeGreaterThan(0);
    expect(w.eduTotal(w.activeCase())).toBeGreaterThan(0);
  });
});

describe("⚠️ 子女沒了，自動列也要跟著消失", () => {
  function withKid() {
    w.addRow("members");
    w.setMemberRole(1, "子女");
    w.activeCase().members[1].eduAuto = true;
    w.setEduChildAge(1, "6");
    w.syncEduAll(w.activeCase());
    expect(auto().length).toBeGreaterThan(0);
  }

  it("角色從子女改成其他 → 自動列清空、教育金歸零", () => {
    withKid();
    w.setMemberRole(1, "其他");
    w.syncEduAll(w.activeCase());
    expect(auto()).toHaveLength(0);
    expect(w.eduTotal(w.activeCase())).toBe(0);
  });

  it("整位成員被刪掉 → 自動列清空", () => {
    withKid();
    w.activeCase().members.splice(1, 1);
    w.syncEduAll(w.activeCase());
    expect(auto()).toHaveLength(0);
  });

  it("手動列一列都不能被清掉", () => {
    withKid();
    const c = w.activeCase();
    c.education.push({ child: "老大", stage: "大學", schoolType: "公立", annual: 200000, years: 4, startIn: 3 });
    w.setMemberRole(1, "其他");
    w.syncEduAll(c);
    expect(auto()).toHaveLength(0);
    expect(c.education).toHaveLength(1);
    expect(c.education[0].child).toBe("老大");
    expect(w.eduTotal(c)).toBeGreaterThan(0);
  });
});

describe("教育金分頁就地新增子女", () => {
  it("沒有子女時給的是按鈕，不是「請去家庭分頁」", () => {
    const html = w.eduSec(w.activeCase());
    expect(html).toContain("addEduChild()");
    expect(html).toContain("＋ 新增子女");
  });

  it("按下去會建立一位角色為子女、年齡留空的成員", () => {
    w.addEduChild();
    const m = w.activeCase().members[1];
    expect(m.role).toBe("子女");
    expect(m.age).toBe("");
    expect(auto()).toHaveLength(0); // 年齡還沒填，先不算
  });

  it("卡片上就能改姓名與年齡（不用切回家庭分頁）", () => {
    w.addEduChild();
    const html = w.eduChildCard(w.activeCase(), w.activeCase().members[1], 1);
    expect(html).toContain("setEduChildAge(1,");
    expect(html).toContain("setMemberBirth(1,");
    expect(html).toContain("'name'");
  });
});

describe("婚禮預算是金額欄", () => {
  it("兩個預算欄都走 moneyCell（千分位＋amtRaw）", () => {
    for (const k of ["budget", "minBudget"]) {
      const box = w.ofld("marriage", k, "婚禮預算", "money");
      expect(box).toContain('inputmode="numeric"');
      expect(box).toContain("amtRaw(this.value)");
      expect(box).not.toContain('type="number"');
    }
    // 版面上宣告的型別也要是 money，不是 num——這是這次漏掉的那一層。
    const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
    expect(HTML).toContain("ofld('marriage','budget','婚禮預算(理想)','money')");
    expect(HTML).toContain("ofld('marriage','minBudget','婚禮預算(最低)','money')");
  });
});

/**
 * 「家庭」分頁加過的人，要在「子女教育」這一頁看得到（2026/08/31 Ray 實測回報）。
 *
 * 實測資料：家庭分頁加了黃一 15、黃二 9、黃三 6、黃四 1，前三位的角色欄留空
 * （新增成員時角色刻意留空，見 addRow）。eduChildren() 只認 role==='子女'，
 * 所以子女教育分頁只帶得出黃四 —— 看起來就是「明明加過了卻沒有」，
 * 於是在教育分頁又新增一次 ＝ 同一個小孩兩份資料。
 *
 * ⚠️ 修法不是把所有成員都當子女帶進來（配偶、父母會被拖進教育金），
 *    而是把「還沒指定角色」的人列出來，一鍵設為子女。
 */
describe("家庭分頁加過的人要能在子女教育頁挑進來", () => {
  function 加三個沒角色的人() {
    const c = w.activeCase();
    w.addRow("members"); c.members[1].name = "黃一"; c.members[1].age = 15;
    w.addRow("members"); c.members[2].name = "黃二"; c.members[2].age = 9;
    w.addRow("members"); c.members[3].name = "黃三"; c.members[3].age = 6;
    w.ensureMemberIds(c);
    return c;
  }

  it("角色空著的成員不會進 eduChildren，但會被列進可挑選名單", () => {
    const c = 加三個沒角色的人();
    expect(w.eduChildren(c)).toHaveLength(0);
    expect(w.eduPickable(c).map((x: { m: { name: string } }) => x.m.name)).toEqual(["黃一", "黃二", "黃三"]);
  });

  it("本人與已經指定角色的人不會出現在挑選名單", () => {
    const c = 加三個沒角色的人();
    w.setMemberRole(1, "配偶");
    w.setMemberRole(2, "子女");
    expect(w.eduPickable(c).map((x: { m: { name: string } }) => x.m.name)).toEqual(["黃三"]);
  });

  it("「其他」也列出來——最常被誤選的就是它", () => {
    const c = 加三個沒角色的人();
    w.setMemberRole(1, "其他");
    expect(w.eduPickable(c).map((x: { m: { name: string } }) => x.m.name)).toContain("黃一");
  });

  it("子女教育分頁會把這幾位列出來，並且叫人不要再新增一次", () => {
    加三個沒角色的人();
    const html = w.eduSec(w.activeCase());
    expect(html).toContain("黃一");
    expect(html).toContain("markAsChild(");
    expect(html).toContain("不要再新增一次");
  });

  it("按「設為子女」就地變成子女、填了年齡就長出教育金（不是新增第二個人）", () => {
    const c = 加三個沒角色的人();
    const before = c.members.length;
    w.markAsChild(3); // 黃三 6 歲
    expect(c.members).toHaveLength(before); // ⚠️ 沒有多長出一個人
    expect(c.members[3].role).toBe("子女");
    expect(c.members[3].indepAge).toBe(26);
    w.syncEduAll(c);
    expect(w.eduChildren(c)).toHaveLength(1);
    expect(auto().length).toBeGreaterThan(0);
    expect(w.eduTotal(c)).toBeGreaterThan(0);
  });

  it("已經填過的財務獨立歲不會被預設值蓋掉", () => {
    const c = 加三個沒角色的人();
    c.members[1].indepAge = 22;
    c.members[1].eduAuto = false;
    w.markAsChild(1);
    expect(c.members[1].indepAge).toBe(22);
    expect(c.members[1].eduAuto).toBe(false);
  });

  it("沒有待指定角色的人時，這一段整個不出現", () => {
    const c = w.activeCase();
    w.addRow("members"); c.members[1].name = "小孩"; c.members[1].age = 6;
    w.setMemberRole(1, "子女");
    expect(w.eduPickSec(c)).toBe("");
  });

  it("成員卡片會警告「未指定角色不會列入計算」", () => {
    加三個沒角色的人();
    const html = w.personCard(w.activeCase(), w.activeCase().members[1], 1, false);
    expect(html).toContain("不會列入子女教育");
    // 已指定角色的就不該再警告
    w.setMemberRole(1, "子女");
    expect(w.personCard(w.activeCase(), w.activeCase().members[1], 1, false)).not.toContain("不會列入子女教育");
  });

  it("待補齊清單會把「角色沒指定」列出來，指向家庭分頁", () => {
    加三個沒角色的人();
    const hit = w.pendingItems(w.activeCase()).filter((x: { id: string }) => x.id === "memrole");
    expect(hit).toHaveLength(1);
    expect(hit[0].tab).toBe("family");
    w.setMemberRole(1, "子女"); w.setMemberRole(2, "子女"); w.setMemberRole(3, "子女");
    expect(w.pendingItems(w.activeCase()).filter((x: { id: string }) => x.id === "memrole")).toHaveLength(0);
  });
});

/**
 * 頂列的「儲存」與存檔狀態（2026/08/31 Ray：「沒有特別儲存的動作，不確定是不是有存到」）。
 * ⚠️ embed（教練端規劃編輯器）模式下，iframe 這一端只知道訊息送出去了，
 *    寫進 DB 的是父層 —— 所以狀態一律以父層回報的 lantu:savestate 為準，自己不准報「已儲存」。
 */
describe("頂列儲存鍵", () => {
  it("按鈕與狀態列都在頂列上", () => {
    expect(w.document.getElementById("saveBtn")).toBeTruthy();
    expect(w.document.getElementById("saveState")).toBeTruthy();
  });

  it("按下去會存檔並顯示已儲存的時間", () => {
    w.saveNow();
    const el = w.document.getElementById("saveState");
    expect(el.textContent).toMatch(/^已儲存 \d{2}:\d{2}$/);
    expect(el.className).toContain("ok");
  });

  it("父層回報的狀態會顯示出來（儲存中／失敗）", () => {
    w.setSaveState("saving");
    expect(w.document.getElementById("saveState").textContent).toBe("儲存中…");
    w.setSaveState("error");
    const el = w.document.getElementById("saveState");
    expect(el.textContent).toBe("儲存失敗");
    expect(el.className).toContain("bad");
  });
});
