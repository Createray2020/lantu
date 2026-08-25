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
