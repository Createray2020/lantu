/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * B-3（2026/10/27 Ray）：保單明細表可直接 key 入、健檢報告總覽→點開看細節、逐年綜合保障明細。
 *
 * 守的是：
 *  1. 明細表按被保人分組、附約接在主約下（└）、每組一列保費合計；格子改了就是改同一份 c.policies。
 *  2. 卡片沒有消失，只是收進「逐張保單詳細」折疊（預設收）；jumpPolicy 會把它展開。
 *  3. 總覽＝被保人 × 九類，已備數字等於 existingCover；點一格展開來源，列出湊出這個數字的保單。
 *  4. 逐年表：年度保費依繳費年期停、保障依到期年齡掉、意外身故＝一般身故＋意外傷殘。
 *  5. 三張五欄表仍在（折疊裡），健檢分頁所有 ckfold 預設不 open。
 */
let w: any;
beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  w.confirm = () => true;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
  w.app.dataTab = "coverage";
});
const pane = () => w.document.querySelector("#app").innerHTML as string;
const $ = (s: string) => w.document.querySelector(s);
const $$ = (s: string) => Array.from(w.document.querySelectorAll(s)) as any[];

function fresh() {
  const c = w.migrateCase(w.newCase());
  c.profile.age = 40;
  c.members = [{ name: "王大明", role: "本人", age: 40 }, { name: "王太太", role: "配偶", age: 38 }];
  const Y = new Date().getFullYear();
  c.policies = [
    { pid: "m1", insured: "王大明", owner: "王大明", insurer: "富邦", name: "終身壽險A", bigCat: "人身", subtype: "終身壽險", policyKind: "主約", status: "有效", premium: 30000, payYears: 20, payMode: "年繳", effDate: (Y - 5) + "/06/01", life: 2000000 },
    { pid: "r1", insured: "王大明", insurer: "富邦", name: "意外附約", bigCat: "人身", subtype: "意外身故/失能", policyKind: "附約", riderOf: "m1", status: "有效", premium: 1200, termEnd: "75", accident: 1000000 },
    { pid: "m2", insured: "王太太", owner: "王太太", insurer: "南山", name: "定期壽險B", bigCat: "人身", subtype: "定期壽險", policyKind: "主約", status: "有效", premium: 8000, payYears: 10, payMode: "年繳", effDate: (Y - 2) + "/01/01", termEnd: "65", life: 1000000 },
  ];
  w.app.cases = [c]; w.app.activeId = c.id;
  w.FOLD_OPEN = {}; w.CK_OPEN = {}; w.COV_TAB = "check";
  w.render();
  return c;
}

describe("保單明細表", () => {
  let c: any;
  beforeEach(() => { c = fresh(); });

  it("按被保人分組、附約在主約下、每組有合計列；卡片收進折疊", () => {
    const h = pane();
    expect($("#polGrid")).toBeTruthy();
    const grps = $$("#polGrid tr.pggrp").map((tr) => tr.textContent);
    expect(grps[0]).toContain("王大明");
    expect(grps[1]).toContain("王太太");
    const rows = $$("#polGrid tr.pgrow");
    expect(rows.length).toBe(3);
    expect(rows[0].getAttribute("data-pgidx")).toBe("0");
    expect(rows[1].classList.contains("rider")).toBe(true);          // 附約緊接主約
    expect(rows[1].getAttribute("data-pgidx")).toBe("1");
    const sums = $$("#polGrid tr.pgsum").map((tr) => tr.textContent);
    expect(sums[0]).toContain("31,200");
    expect(sums[1]).toContain("8,000");
    expect(h).toContain("年繳保費合計");
    // 卡片仍在，但在 polcards 折疊裡且預設收
    const fold = $('details[data-fk="polcards"]') as HTMLDetailsElement;
    expect(fold).toBeTruthy();
    expect(fold.hasAttribute("open")).toBe(false);
    expect(fold.querySelectorAll(".pcard").length).toBe(3);
  });

  it("格子改的是同一份資料；setPolicySub 從表上改細分會換保額欄；jumpPolicy 會展開卡片折疊", () => {
    w.set("policies:0", "premium", "36000", "num");
    expect(c.policies[0].premium).toBe(36000);
    w.set("policies:0", "life", "2500000", "num");
    expect(c.policies[0].life).toBe(2500000);
    expect(w.polAmtField(c.policies[0])).toBe("life");
    w.setPolicySub(1, "住院醫療(日額)");
    expect(w.polAmtField(c.policies[1])).toBe("medical");
    expect(pane()).toContain("年繳保費合計");
    w.jumpPolicy(1);
    expect(w.FOLD_OPEN["polcards"]).toBe(1);
    expect(w.FOLD_OPEN["riders:m1"]).toBe(1);
  });

  it("「＋ 新增一列」帶被保人；沒保單的成員有自己的新增鈕", () => {
    c.members.push({ name: "小孩", role: "子女", age: 8 });
    w.render();
    expect(pane()).toContain("小孩 的第一張保單");
    w.addPolicyFor("王太太");
    const p = c.policies[c.policies.length - 1];
    expect(p.insured).toBe("王太太");
    expect(p.policyKind).toBe("主約");
    expect($$("#polGrid tr.pgrow").length).toBe(4);
  });
});

describe("健檢報告總覽", () => {
  let c: any;
  beforeEach(() => { c = fresh(); });

  it("被保人 × 九類；已備等於 existingCover；三張五欄表在折疊裡、全部預設不 open", () => {
    expect($("#ckOverview")).toBeTruthy();
    const rows = w.checkupOverviewRows(c);
    const me = rows.find((r: any) => r.member === "王大明");
    expect(me).toBeTruthy();
    expect(me.cells.length).toBe(w.KINDS.length);
    const life = me.cells.find((x: any) => x.kind === "壽險");
    expect(life.have).toBe(w.existingCover(c, "王大明", "壽險") + w.actionCover(c, "王大明", "壽險"));
    const acc = me.cells.find((x: any) => x.kind === "意外傷殘");
    expect(acc.have).toBe(1000000);
    expect(me.hasNeed).toBe(false);          // 沒需求卡 → 只列已備
    const h = pane();
    expect(h).toContain("1 保費"); expect(h).toContain("2 保障"); expect(h).toContain("3 $領回");
    expect(h).toContain("HAVE"); expect(h).toContain("READJUST");
    w.document.querySelectorAll("details.ckfold").forEach((d: HTMLDetailsElement) => expect(d.hasAttribute("open")).toBe(false));
  });

  it("點一格展開來源：列出湊出已備的保單；有需求卡時狀況三值跟五欄表同一把尺", () => {
    w.ckCellToggle("王大明|意外傷殘");
    const det = $("#ckOverview tr.ckdetail");
    expect(det).toBeTruthy();
    expect(det.textContent).toContain("意外附約");
    expect(det.textContent).toContain("1,000,000");
    const items = w.coverContributors(c, "王大明", "意外傷殘");
    expect(items.length).toBe(1);
    expect(items[0].src).toBe("policy");
    // 加需求卡：壽險需求遠大於已備 → low
    c.needs = [{ member: "王大明", years: 10, livingMonthly: 100000 }];
    w.render();
    const me = w.checkupOverviewRows(c).find((r: any) => r.member === "王大明");
    expect(me.hasNeed).toBe(true);
    expect(w.ckStateOf(1000, 1000)).toBe("mid");
    expect(w.ckStateOf(1000, 500)).toBe("low");
    expect(w.ckStateOf(1000, 2000)).toBe("high");
    expect(w.ckStateOf(0, 100)).toBe("high");
  });
});

describe("逐年綜合保障明細", () => {
  it("保費依繳費年期停、保障依到期年齡掉、意外身故＝一般身故＋意外傷殘", () => {
    const c = fresh();
    const rows = w.coverageByYear(c, "王大明");
    expect(rows[0].age).toBe(40);
    expect(rows[0].premium).toBe(31200);
    expect(rows[0].life).toBe(2000000);
    expect(rows[0].accident).toBe(3000000);
    expect(rows[0].cum).toBe(31200);
    const at60 = rows.find((r: any) => r.age === 60);   // 壽險繳 20 年：生效 5 年前 → 55 歲繳完；附約無年期＝一直繳到 75 到期
    expect(at60.premium).toBe(1200);
    const at76 = rows.find((r: any) => r.age === 76);   // 附約 75 歲到期 → 意外保額掉、附約保費停
    expect(at76.accident).toBe(2000000);
    expect(at76.premium).toBe(0);
    const sp = w.coverageByYear(c, "王太太");
    expect(sp.find((r: any) => r.age === 66).life).toBe(0);
    expect(sp.find((r: any) => r.age === 65).life).toBe(1000000);
    expect(pane()).toContain("逐年綜合保障明細");
    expect(($('details[data-fk="ckByYear"]') as HTMLDetailsElement).hasAttribute("open")).toBe(false);
  });
});
