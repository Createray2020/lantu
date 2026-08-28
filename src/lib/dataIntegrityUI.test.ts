import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

/**
 * 資料完整性：那些「畫面上完全看不出來」的靜默壞掉。
 *
 * 這一支守的四件事都有共同的病徵——教練沒有做錯任何事，資料卻自己歪掉，
 * 而且畫面上不會出現任何錯誤：
 *   B5  uid() 撞號       → 兩位客戶共用同一個 id
 *   B6  actions[].ref    → 刪一列／拖曳重排之後，動作指到別人的明細
 *   B2  成員改名         → 八個以姓名為外鍵的欄位一次變孤兒
 *   B1  保障需求明細框   → 自己重算一次毛需求，跟同一頁的五欄表對不上
 *
 * 純正則的 drift test 看不出這些，所以用 jsdom 把 lantu-app.html 真的跑起來驅動。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
});

// 每個 describe 自己造一份乾淨的 case 並掛成 activeCase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useCase(): any {
  const c = w.migrateCase(w.newCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.role = "coach";
  w.app.activeTab = "data";
  return c;
}

describe("B5：uid() 不再撞號", () => {
  beforeAll(() => { try { w.localStorage.clear(); } catch { /* jsdom 可能沒有 */ } });

  it("連續 500 次 uid() 全部相異", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(w.uid());
    expect(seen.size).toBe(500);
  });

  it("不再依賴 performance.now() 與 app.cases.length（那兩個在同一個 tick／批次建立時都不變）", () => {
    expect(HTML).not.toContain("return 'c'+Math.floor(performance.now()*1000%1e9)+app.cases.length");
    expect(HTML).toContain("var _uidSeq=0;");
  });

  it("批次建立客戶時每一筆的 id 都不同（cases.length 不變也不會撞）", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(w.newCase().id);
    expect(ids.size).toBe(50);
  });
});

describe("B6：actions[].ref 用穩定 id，不是陣列位置", () => {
  it("migrateCase 把舊的位置式 ref 一次性轉成 id 式", () => {
    const c = w.migrateCase(w.newCase());
    c.expenses = [
      { name: "房租", cat: "生活", amount: 240000, start: 40, end: 85 },
      { name: "保母", cat: "生活", amount: 180000, start: 40, end: 46 },
      { name: "旅遊", cat: "消費", amount: 120000, start: 40, end: 80 },
    ];
    c.actions = [{ id: "a1", on: true, cat: "expense", name: "刪減旅遊", ref: "expenses:2" }];
    const m = w.migrateCase(c);
    // 轉成 id 式，而且解得到原本那一列
    expect(m.actions[0].ref).not.toBe("expenses:2");
    expect(m.actions[0].ref).toBe("expenses:" + m.expenses[2].eid);
    expect(w.refRow(m, m.actions[0].ref).name).toBe("旅遊");
  });

  it("migrateCase 冪等：跑第二次不會把 ref 或 eid 換掉", () => {
    const c = w.migrateCase(w.newCase());
    c.expenses = [{ name: "房租", cat: "生活", amount: 240000 }, { name: "旅遊", cat: "消費", amount: 120000 }];
    c.actions = [{ id: "a1", on: true, cat: "expense", ref: "expenses:1" }];
    w.migrateCase(c);
    const ref1 = c.actions[0].ref, eid1 = c.expenses[1].eid;
    w.migrateCase(c);
    w.migrateCase(c);
    expect(c.actions[0].ref).toBe(ref1);
    expect(c.expenses[1].eid).toBe(eid1);
  });

  it("刪掉前面一列、再拖曳重排，ref 仍指向原本那一列", () => {
    const c = useCase();
    c.expenses = [
      { name: "房租", cat: "生活", amount: 240000 },
      { name: "保母", cat: "生活", amount: 180000 },
      { name: "旅遊", cat: "消費", amount: 120000 },
    ];
    c.assets = [
      { name: "現金", owner: "本人", mainCat: "可投資資產", type: "現金", cls: "流動", currency: "台幣", fxRate: 1, value: 1_000_000 },
      { name: "自住房", owner: "本人", mainCat: "自用資產", type: "不動產", cls: "固定", currency: "台幣", fxRate: 1, value: 15_000_000 },
    ];
    w.ensureRowIds(c);
    c.actions = [
      { id: "a1", on: true, cat: "expense", name: "刪減旅遊", ref: "expenses:" + c.expenses[2].eid },
      { id: "a2", on: true, cat: "liquidate", name: "賣房", ref: "assets:" + c.assets[1].aid },
    ];

    // 刪掉最前面那一列（舊版的位置式 ref 會整批往前偏一格）
    w.delRow("expenses", 0);
    expect(w.refRow(c, c.actions[0].ref).name).toBe("旅遊");

    // 再手動拖曳重排一次（把最後一列搬到最前面）
    c.expenses.unshift(c.expenses.pop());
    expect(w.refRow(c, c.actions[0].ref).name).toBe("旅遊");

    // 資產側同理
    w.delRow("assets", 0);
    expect(w.refRow(c, c.actions[1].ref).name).toBe("自住房");
  });

  it("migrateCase → syncPremium 第一次接管保費時，ref 不會被打偏", () => {
    const c = w.migrateCase(w.newCase());
    // 舊資料：第 0 列是要被 syncPremium filter 掉的人身保費列
    c.expenses = [
      { name: "壽險保費", cat: "保險", subCat: "壽險保費", amount: 60000, start: 40, end: 85 },
      { name: "房租", cat: "生活", amount: 240000, start: 40, end: 85 },
      { name: "旅遊", cat: "消費", amount: 120000, start: 40, end: 80 },
    ];
    c.policies = [{ pid: "p1", insured: "本人", status: "有效", premium: 50000, subtype: "終身壽險", bigCat: "人身" }];
    c.actions = [{ id: "a1", on: true, cat: "expense", ref: "expenses:2" }];   // ← 指著「旅遊」
    const m = w.migrateCase(c);
    expect(w.refRow(m, m.actions[0].ref).name).toBe("旅遊");
  });

  it("下拉選項產出的是 id 式的 value（不是索引）", () => {
    const c = useCase();
    c.expenses = [{ name: "房租", cat: "生活", amount: 240000 }];
    w.ensureRowIds(c);
    const html = w.actRefOpts({ ref: "" }, "expenses") as string;
    expect(html).toContain('value="expenses:' + c.expenses[0].eid + '"');
    expect(html).not.toContain('value="expenses:0"');
  });
});

describe("B2：成員改名，八個以姓名為外鍵的欄位一起換", () => {
  it("set() 走 onchange 這一條路徑時把八個欄位一次換過去", () => {
    const c = useCase();
    c.members = [{ name: "本人", role: "本人", age: 40, depRatio: 100, expRatio: 100 }];
    c.needs = [{ member: "本人", protectYears: 10, funeral: 600000 }];
    c.coverages = [{ member: "本人", kind: "壽險", comm: 1_000_000, social: 0 }];
    c.policies = [{ pid: "p1", insured: "本人", life: 3_000_000, premium: 50000, status: "有效" }];
    c.incomes = [{ owner: "本人", type: "工作", subType: "薪資", amount: 1_200_000 }];
    c.assets = [{ owner: "本人", name: "現金", mainCat: "可投資資產", type: "現金", cls: "流動", currency: "台幣", fxRate: 1, value: 1_000_000 }];
    c.liabilities = [{ owner: "本人", name: "房貸", currency: "台幣", fxRate: 1, balance: 8_000_000 }];
    c.guarantees = [{ owner: "本人", balance: 2_000_000 }];
    c.actions = [{ id: "a1", on: true, cat: "insure", member: "本人" }];

    w.set("members:0", "name", "王大明");

    expect(c.members[0].name).toBe("王大明");
    expect(c.needs[0].member).toBe("王大明");
    expect(c.coverages[0].member).toBe("王大明");
    expect(c.policies[0].insured).toBe("王大明");
    expect(c.incomes[0].owner).toBe("王大明");
    expect(c.assets[0].owner).toBe("王大明");
    expect(c.liabilities[0].owner).toBe("王大明");
    expect(c.guarantees[0].owner).toBe("王大明");
    expect(c.actions[0].member).toBe("王大明");
  });

  it("改名之後 memberDep() 不再退回預設 100（那是靜默失真的來源）", () => {
    const c = useCase();
    c.members = [{ name: "本人", role: "本人", age: 40, depRatio: 100, expRatio: 100 },
                 { name: "配偶", role: "配偶", age: 38, depRatio: 40, expRatio: 40 }];
    c.needs = [{ member: "配偶", protectYears: 10 }];
    w.set("members:1", "name", "王太太");
    expect(c.needs[0].member).toBe("王太太");
    expect(w.memberDep(c, c.needs[0].member)).toBe(40);
  });

  it("只換完全相同的舊名，不動別人", () => {
    const c = useCase();
    c.members = [{ name: "本人", role: "本人" }, { name: "本人的媽", role: "母" }];
    c.incomes = [{ owner: "本人" }, { owner: "本人的媽" }];
    w.set("members:0", "name", "王大明");
    expect(c.incomes[0].owner).toBe("王大明");
    expect(c.incomes[1].owner).toBe("本人的媽");
  });

  it("setLive（oninput）不做連動——打字中途的半截名字不可以拿去替換", () => {
    const c = useCase();
    c.members = [{ name: "本人", role: "本人" }];
    c.incomes = [{ owner: "本人" }];
    w.setLive("members:0", "name", "王");
    expect(c.members[0].name).toBe("王");
    expect(c.incomes[0].owner).toBe("本人");   // ← 還沒失焦，外鍵不動
    // 失焦（onchange）那一次才連動；此時舊名已被 setLive 改成「王」，所以先還原再走 set
    c.members[0].name = "本人";
    w.set("members:0", "name", "王大明");
    expect(c.incomes[0].owner).toBe("王大明");
  });
});

describe("B1：保障需求明細框的毛需求 === grossLifeNeed()", () => {
  it("明細框印出來的合計，逐位成員都等於 grossLifeNeed()", () => {
    const c = w.migrateCase(w.sampleCase());
    // 這兩項就是舊版漏掉的：父母奉養費（支出表「孝親」）與個人連帶保證
    c.expenses.push({ name: "孝親費", cat: "孝親", amount: 120000, infl: false, start: 40, end: 85, cut: 0 });
    c.guarantees = [{ owner: c.members[0].name, balance: 2_000_000 }];
    w.app.cases = [c]; w.app.activeId = c.id;

    const html = w.lifeNeedDetailHTML(c) as string;
    expect(html).toContain("父母奉養費");
    expect(html).toContain("個人連帶保證");

    c.needs.forEach((nd: Record<string, unknown>) => {
      const gross = w.grossLifeNeed(c, nd);
      expect(html).toContain(w.fmt(Math.round(gross)));
      // 淨缺口那一列也要對得上 lifeNeed()
      expect(html).toContain(w.fmt(Math.round(w.lifeNeed(c, nd))));
    });
  });

  it("明細框的毛需求 === 同一頁五欄表（coverageGaps）的壽險 need", () => {
    const c = w.migrateCase(w.sampleCase());
    c.expenses.push({ name: "孝親費", cat: "孝親", amount: 120000, infl: false, start: 40, end: 85, cut: 0 });
    c.guarantees = [{ owner: c.members[0].name, balance: 2_000_000 }];
    const html = w.lifeNeedDetailHTML(c) as string;
    const life = w.coverageGaps(c).filter((g: { kind: string }) => g.kind === "壽險");
    expect(life.length).toBeGreaterThan(0);
    life.forEach((g: { member: string; need: number }) => {
      expect(html, `${g.member} 的毛需求應為 ${g.need}`).toContain(w.fmt(Math.round(g.need)));
    });
  });

  it("html 端不再有第二份手寫的毛需求算式", () => {
    expect(HTML).not.toContain("var gross=living+liab+edu+n(nd.funeral)+n(nd.estateTax);");
    expect(HTML).toContain("var gross=grossLifeNeed(c,nd);");
  });

  it("engine 端的 grossLifeNeed 就是拆解的那幾項（明細框不可以自己再算一次）", () => {
    const c = E.sampleCase();
    c.expenses.push({ name: "孝親費", cat: "孝親", amount: 120000, infl: false, start: 40, end: 85, cut: 0 });
    const nd = c.needs[0];
    const before = E.grossLifeNeed(c, nd);
    c.guarantees = [{ owner: E.primaryMember(c).name, balance: 2_000_000 }];
    expect(E.grossLifeNeed(c, nd) - before).toBe(2_000_000);
  });
});

describe("B7 / B8：孤兒回收", () => {
  it("B7：從家庭分頁刪掉未出生子女，那一胎也一起刪（不會再長回來）", () => {
    const c = useCase();
    c.birthPlan = [{ bid: "b1", atAge: 42 }];
    w.app.cases = [c]; w.app.activeId = c.id;
    w.applyBirthPlan(true);
    const idx = c.members.findIndex((m: { birthBid?: string }) => m.birthBid === "b1");
    expect(idx).toBeGreaterThan(-1);
    expect(c.goals.some((g: { birthBid?: string }) => g.birthBid === "b1")).toBe(true);

    w.delRow("members", idx);
    expect(c.birthPlan.some((k: { bid: string }) => k.bid === "b1")).toBe(false);
    // 下一次 applyBirthPlan 不會依 bid 把他長回來，連帶的目標／支出也被回收
    w.applyBirthPlan(true);
    expect(c.members.some((m: { birthBid?: string }) => m.birthBid === "b1")).toBe(false);
    expect(c.goals.some((g: { birthBid?: string }) => g.birthBid === "b1")).toBe(false);
    expect(c.expenses.some((e: { birthBid?: string }) => e.birthBid === "b1")).toBe(false);
  });

  it("B7：migrateCase 每次載入都做一次孤兒勾稽（冪等）", () => {
    const c = w.migrateCase(w.newCase());
    c.birthPlan = [];
    c.members.push({ name: "第1胎", role: "子女", unborn: true, birthBid: "dead" });
    c.goals.push({ name: "第1胎 生產與月子", birthBid: "dead", on: true });
    c.expenses.push({ name: "第1胎 育兒費用(0–2歲)", cat: "生活", amount: 100000, birthBid: "dead" });
    const m = w.migrateCase(c);
    expect(m.members.some((x: { birthBid?: string }) => x.birthBid === "dead")).toBe(false);
    expect(m.goals.some((x: { birthBid?: string }) => x.birthBid === "dead")).toBe(false);
    expect(m.expenses.some((x: { birthBid?: string }) => x.birthBid === "dead")).toBe(false);
  });

  it("B8：刪掉主約，指著它的附約 riderOf 一併放掉", () => {
    const c = useCase();
    c.policies = [
      { pid: "main1", name: "終身壽險", insured: "本人", policyKind: "主約", status: "有效", premium: 50000 },
      { pid: "r1", name: "醫療附約", insured: "本人", policyKind: "附約", riderOf: "main1", status: "有效", premium: 6000 },
      { pid: "r2", name: "意外附約", insured: "本人", policyKind: "附約", riderOf: "main1", status: "有效", premium: 3000 },
    ];
    w.delRow("policies", 0);
    expect(c.policies).toHaveLength(2);
    expect(c.policies[0].riderOf).toBe("");
    expect(c.policies[1].riderOf).toBe("");
  });

  it("B8：ensurePolicies 冪等回收懸空的 riderOf（舊資料載入時就清掉）", () => {
    const c = useCase();
    c.policies = [{ pid: "r9", name: "孤兒附約", insured: "本人", policyKind: "附約", riderOf: "已不存在", status: "有效" }];
    w.ensurePolicies(c);
    expect(c.policies[0].riderOf).toBe("");
    // 指得到的不動
    c.policies = [
      { pid: "m1", name: "主約", insured: "本人", policyKind: "主約", status: "有效" },
      { pid: "r1", name: "附約", insured: "本人", policyKind: "附約", riderOf: "m1", status: "有效" },
    ];
    w.ensurePolicies(c);
    expect(c.policies[1].riderOf).toBe("m1");
  });
});

describe("B3 / B4：sel 下拉的舊值不會被靜默吃掉", () => {
  it("四個產生器都走 selOpts（舊值保留並標『（舊值）』）", () => {
    // ofld：傳承／職涯／婚姻／理財模式／信用／海外
    expect(HTML).toContain("if(type&&type.indexOf('sel:')===0){var opts=selOpts(type.slice(4).split(','),v);");
    // fFld 帶 opts：需求卡的被保人、成員投保類型、性別、保單職業等級、保費折扣
    expect(HTML).toContain(" if(opts){var os=selOpts(opts,val);");
    // finSel：負債攤還方式、資產流動性/地區/主分類/幣別/布局
    expect(HTML).toContain("function finSel(arr,i,k,val,list){return '<select onchange=\"set(\\''+arr+':'+i+'\\',\\''+k+'\\',this.value)\">'+selOpts(list,val)+'</select>';}");
    // finMem / memsel：所有「持有人／被保人」選單
    expect(HTML).toContain("function finMem(c,arr,i,k,val){var o=memSelOpts(c,val);");
    expect(HTML).toContain("if(ty==='memsel'){var opts=memSelOpts(c,row[k]);");
    expect(HTML).toContain("if(ty==='memsel'){var o1=memSelOpts(c,row[k]);");
  });

  it("memSelOpts：非成員的舊值留著並標「（舊值）」，不可以被吃掉", () => {
    const c = useCase();
    c.members = [{ name: "王大明", role: "本人" }, { name: "王太太", role: "配偶" }];
    const html = w.memSelOpts(c, "本人") as string;   // 「本人」已經不是成員了（改名後的孤兒）
    expect(html).toContain("本人（舊值）");
    expect(html).toContain("王大明");
    // 舊值那一項要是被選中的那一個（不然瀏覽器會靜靜選第一個）
    expect(/<option selected value="本人">/.test(html)).toBe(true);
  });

  it("memSelOpts：值就在成員清單裡時不標舊值", () => {
    const c = useCase();
    c.members = [{ name: "王大明", role: "本人" }];
    const html = w.memSelOpts(c, "王大明") as string;
    expect(html).not.toContain("（舊值）");
    expect(html).toContain('<option selected value="王大明">');
  });

  it("B4：incomes[].subType 走 selOpts，且保留開頭那個空選項", () => {
    expect(HTML).toContain("var sSel='<option value=\"\" '+(!x.subType?'selected':'')+'></option>'+selOpts(INC_SUB,x.subType);");
    const c = useCase();
    c.incomes = [{ owner: "本人", type: "工作", subType: "執行業務所得", amount: 1_200_000, period: "年" }];
    w.app.dataTab = "finance";
    w.render();
    const h = w.document.querySelector("#app").innerHTML as string;
    expect(h).toContain("執行業務所得");
    // 稅額分流的依據沒有被改掉
    expect(c.incomes[0].subType).toBe("執行業務所得");
  });
});
