import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import * as EngineExports from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = EngineExports;

const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 雙實作對拍。
 *
 * src/lib/engine.ts 算的是「寫進 DB 的快照」（planSnapshot → plans.health_grade / net_worth），
 * public/lantu-app.html 算的是「使用者在 iframe 看到的數字」。兩份是同一套邏輯的兩個實作。
 *
 * 2026/08/18 的稽核發現這兩邊已經默默漂移：
 *   - health() 的信用分數正規化：engine 用 cs/100（700 分算成 7.0，safety 飆到 183），
 *     html 用 (cs-200)/600 clamp 0~1。隨機 2000 例 safety 100% 不一致、等級 1.9% 不一致，
 *     而且方向永遠是 DB 快照偏樂觀 → 該判「整裝期」的客戶，列表上顯示「啟程期」。
 *   - coverageGaps() 的壽險「已備」：html 會加上家庭可變現流動資產，engine 沒有
 *     （primaryMember() 整個函式都沒被移植）→ totalGap 差到 32 倍。
 *   - ratios()：html 已改成協會 25 項，engine 還停在舊的 11 項。
 *
 * 這組測試就是不讓它再發生：以正則比對關鍵公式字串 + 對同一份 sampleCase 斷言具體數字。
 * 兩邊任何一邊改了計算而沒同步，這裡就會紅。
 *
 * （src/lib/intent.test.ts 用同樣的手法守常數，是這個 repo 裡最早也最正確的做法。）
 */
describe("雙實作對拍：engine.ts ↔ lantu-app.html", () => {
  it("health()：信用分數正規化公式兩邊一致，且 credit 值域為 0~1", () => {
    // html 端的公式（改動時這裡要一起改，而且要確認 engine 也改了）
    expect(HTML).toContain("var credit=cs>=200?Math.min(1,Math.max(0,(cs-200)/600)):0");

    const c = E.sampleCase(); // profile.credit = 700
    const h = E.health(c);
    expect(h.raw.credit).toBeCloseTo((700 - 200) / 600, 6);
    expect(h.parts.信用).toBe(83);
    expect(h.safety).toBeLessThanOrEqual(100);
    expect(h.safety).toBeGreaterThanOrEqual(0);
  });

  it.each([
    [0, 0],
    [199, 0],
    [200, 0],
    [500, 0.5],
    [800, 1],
    [900, 1],
    [-100, 0],
  ])("信用 %i 分 → credit %f（永遠落在 0~1）", (score, expected) => {
    const c = E.sampleCase();
    c.credit.score = score;
    c.profile.credit = 0;
    expect(E.health(c).raw.credit).toBeCloseTo(expected, 6);
  });

  it("coverageGaps()：本人壽險的『已備』要納入家庭可變現流動資產", () => {
    // html 端多的那一行（engine.ts 曾經整段缺席）
    expect(HTML).toContain("if(k==='壽險'&&nd.member===(primaryMember(c)||{}).name)ex+=liquidMovable(c)");

    const c = E.sampleCase();
    const row = E.coverageGaps(c).find((r: { kind: string }) => r.kind === "壽險");
    // 保單壽險 3,000,000 + liquidMovable 11,480,000
    expect(row.have).toBe(3_000_000 + E.liquidMovable(c));
    expect(row.have).toBe(14_480_000);
  });

  it("coverageGaps()：非本人成員的壽險不加流動資產", () => {
    const c = E.sampleCase();
    c.needs.push({
      member: "王太太", funeral: 600000, protectYears: 5, estateTax: 0,
      room: 0, selfPay: 0, nursing: 0, firstCancer: 0, cancerHosp: 0, critical: 0, monthCare: 0,
    });
    const row = E.coverageGaps(c).find(
      (r: { kind: string; member: string }) => r.kind === "壽險" && r.member === "王太太",
    );
    expect(row.have).toBe(0);
  });

  // 2026/08/22 企業主模組：連帶保證進 lifeNeed()，兩份實作必須同時改。
  // 這一項會經由 totalGap() 影響 health() → plans.health_grade，漂移的代價很直接。
  it("lifeNeed()：本人簽的個人連帶保證要加進壽險需求", () => {
    // 2026/08/24 起這條分子的唯一真相是 grossLifeNeed()；lifeNeed() 只在它外面扣已備。
    expect(HTML).toContain("+guaranteeFor(c,nd.member);}");
    expect(HTML).toContain("function guaranteeFor(c,member){var pm=(primaryMember(c)||{}).name;");

    const c = E.sampleCase();
    const nd = c.needs[0];
    const before = E.lifeNeed(c, nd);
    c.guarantees = [{ owner: nd.member, bank: "A 銀行", item: "公司借款", limit: 30_000_000, balance: 20_000_000 }];
    expect(E.lifeNeed(c, nd)).toBe(before + 20_000_000);
  });

  it("lifeNeed()：別人簽的連帶保證不算在這個人頭上；沒填保證人的舊列歸「本人」", () => {
    const c = E.sampleCase();
    const nd = c.needs[0];
    const before = E.lifeNeed(c, nd);
    c.guarantees = [{ owner: "王太太", bank: "A 銀行", item: "公司借款", limit: 0, balance: 9_000_000 }];
    expect(E.lifeNeed(c, nd)).toBe(before);
    c.guarantees = [{ bank: "A 銀行", item: "公司借款", limit: 0, balance: 9_000_000 }]; // 無 owner
    expect(E.lifeNeed(c, nd)).toBe(before + 9_000_000);
  });

  it("沒有 guarantees 欄位的舊案子不會炸，也不會改變任何既有數字", () => {
    const c = E.sampleCase();
    delete c.guarantees;
    expect(() => E.health(c)).not.toThrow();
    const c2 = E.sampleCase();
    c2.guarantees = [];
    expect(E.health(c).grade).toBe(E.health(c2).grade);
  });

  it("ratios()：兩邊都是協會 25 項體檢（分組＋理想值＋紅黃綠燈）", () => {
    const r = E.ratios(E.sampleCase());
    const names = Object.keys(r);
    expect(names.length).toBe(25);
    // 每一項都要有 group / ideal / status，不能退回舊的 {v,f,ok} 形狀
    for (const k of names) {
      expect(["收支流量", "資產負債"]).toContain(r[k].group);
      expect(typeof r[k].ideal).toBe("string");
      expect(["good", "warn", "bad", "na"]).toContain(r[k].status);
    }
    // 抽驗幾個只存在於新版的項目，確認不是舊的 11 項
    for (const k of ["所得穩定度", "支出收入比", "保費支出比", "償債壓力指數", "資產成長動力比"]) {
      expect(names).toContain(k);
      expect(HTML).toContain(`'${k}'`);
    }
    // 舊版的 11 項裡已被協會版取代的，不該再出現
    for (const k of ["年儲蓄率", "消費比率", "財務負擔率", "願景成就率"]) {
      expect(names).not.toContain(k);
    }
  });

  // ── 2026/08 對齊 Excel 那一輪新增的共用語意 ──
  // 2026/08/29 B1：「薪資補償」拆成日額／月額兩個險種，KINDS 從 9 變 10。
  it("KINDS 與 POLICY_MAP：險種清單與保單欄位對照兩邊一致", () => {
    expect(HTML).toContain("var KINDS=['壽險','意外傷殘','住院醫療','醫療雜費','薪資補償（日）','薪資補償（月）','初次罹癌','癌症住院','重病給付','每月照護'];");
    expect(HTML).toContain("var POLICY_MAP={'壽險':'life','意外傷殘':'accident','住院醫療':'medical','醫療雜費':'medMisc','薪資補償（日）':'incomeCompDay','薪資補償（月）':'incomeCompMonth','初次罹癌':'firstCancer','癌症住院':'cancerHosp','重病給付':'critical','每月照護':'monthCare'};");
    expect(E.KINDS).toEqual(["壽險", "意外傷殘", "住院醫療", "醫療雜費", "薪資補償（日）", "薪資補償（月）", "初次罹癌", "癌症住院", "重病給付", "每月照護"]);
  });

  // 單位表是 gapTotals() 分三堆與五欄表單位欄的唯一依據，兩邊逐字對拍。
  it("KIND_UNIT：每個險種的給付單位兩邊一致", () => {
    expect(HTML).toContain("var KIND_UNIT={'壽險':'元','意外傷殘':'元','住院醫療':'元/日','醫療雜費':'元',");
    expect(HTML).toContain(" '薪資補償（日）':'元/日','薪資補償（月）':'元/月','初次罹癌':'元','癌症住院':'元/日',");
    expect(HTML).toContain(" '重病給付':'元','每月照護':'元/月'};");
    expect(HTML).toContain("function kindUnit(k){return KIND_UNIT[kindNorm(k)]||'元';}");
    for (const k of E.KINDS) expect(["元", "元/日", "元/月"]).toContain(E.kindUnit(k));
    expect(E.kindUnit("薪資補償（日）")).toBe("元/日");
    expect(E.kindUnit("薪資補償（月）")).toBe("元/月");
    // 舊值先過 kindNorm 再查表
    expect(E.kindUnit("薪資補償")).toBe("元/月");
  });

  it("KIND_ALIAS：舊的『薪資補償』一律歸到月額（兩邊同一條）", () => {
    expect(HTML).toContain("var KIND_ALIAS={'意外險':'意外傷殘','薪資補償':'薪資補償（月）'};");
    expect(E.kindNorm("薪資補償")).toBe("薪資補償（月）");
  });

  // 舊的單一欄位 incomeComp 讀成月額：engine.ts 跑在伺服器端、拿到的是沒過 migrateCase 的
  // plans.data 原始資料，相容一定要做在讀取這一層。
  it("coverAmt：舊 incomeComp 讀成月額，日額不沾（兩邊逐字相同）", () => {
    expect(HTML).toContain("function coverAmt(x,f){");
    expect(HTML).toContain(" if(f==='incomeCompMonth'){var v=x&&x.incomeCompMonth;return (v==null||v==='')?n(x&&x.incomeComp):n(v);}");
    expect(E.coverAmt({ incomeComp: 40000 }, "incomeCompMonth")).toBe(40000);
    expect(E.coverAmt({ incomeComp: 40000 }, "incomeCompDay")).toBe(0);
    // 明確填了新欄位就以新欄位為準
    expect(E.coverAmt({ incomeComp: 40000, incomeCompMonth: 1000 }, "incomeCompMonth")).toBe(1000);
  });

  // 2026/08/29 B3：三種給付單位分開總計，刻意不相加。
  it("gapTotals / totalGap：三個總額分開，totalGap 收斂成一次性給付（兩邊同一條）", () => {
    expect(HTML).toContain("function gapTotals(c){");
    expect(HTML).toContain("  if(u==='元/日')t.daily+=v;else if(u==='元/月')t.monthly+=v;else t.lump+=v;");
    expect(HTML).toContain("function totalGap(c){return gapTotals(c).lump}");

    const c = E.sampleCase();
    const gt = E.gapTotals(c);
    const rows = E.coverageGaps(c);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pos = (u: string) => rows.filter((g: any) => E.kindUnit(g.kind) === u)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .reduce((a: number, g: any) => a + Math.max(0, g.gap), 0);
    expect(gt.lump).toBeCloseTo(pos("元"), 6);
    expect(gt.daily).toBeCloseTo(pos("元/日"), 6);
    expect(gt.monthly).toBeCloseTo(pos("元/月"), 6);
    expect(E.totalGap(c)).toBeCloseTo(gt.lump, 6);
  });

  // riskCover 只吃 lump——這是唯一與保額同維度、可以直接比的數字。
  it("health().riskCover 只吃一次性給付缺口（兩邊同一條）", () => {
    expect(HTML).toContain(" var need=gapTotals(c).lump,needBase=gapNeedBase(c).lump||1;");

    const c = E.sampleCase();
    const before = E.health(c).raw.riskCover;
    // 把日額／月額的需求整個拉高：riskCover 一位都不能動
    c.needs[0].room = 99999;
    c.needs[0].monthCare = 999999;
    c.needs[0].incomeCompDay = 88888;
    c.needs[0].incomeCompMonth = 77777;
    expect(E.health(c).raw.riskCover).toBeCloseTo(before, 10);
    // 一次性給付的需求拉高才會動
    c.needs[0].funeral = E.n(c.needs[0].funeral) + 5_000_000;
    expect(E.health(c).raw.riskCover).toBeLessThan(before);
  });

  it("existingCover 兩邊都經 kindNorm 正規化（舊資料的『意外險』不能對不上）", () => {
    expect(HTML).toContain("kindNorm(cv.kind)===kindNorm(kind)");
    expect(E.kindNorm("意外險")).toBe("意外傷殘");
    expect(E.kindNorm("壽險")).toBe("壽險");
  });

  // 2026/08/28：existingCover 的保單側漏了 policyActive()——同檔的 annualPremiumBy()、
  // policyBenefitRows() 都有過，只有這一支沒有，標「失效／停效」的保額仍被算成已備。
  it("existingCover：失效／停效的保單不算已備（兩邊同一條）", () => {
    // 2026/08/29 B1：欄位查表前先過 kindNorm（舊值『薪資補償』要對得上月額那一欄），
    // 取值改走 coverAmt（舊的單一 incomeComp 欄位讀成月額）。policyActive 那一段沒動。
    expect(HTML).toContain(
      "var f=POLICY_MAP[kindNorm(kind)];var fromPol=f?sum(c.policies,function(p){return (policyActive(p)&&p.insured===member)?coverAmt(p,f):0}):0;",
    );

    const c = E.sampleCase();
    const pm = E.primaryMember(c).name;
    const before = E.existingCover(c, pm, "壽險");
    expect(before).toBeGreaterThan(0);
    c.policies.forEach((p: { insured: string; status?: string }) => {
      if (p.insured === pm) p.status = "失效";
    });
    expect(E.existingCover(c, pm, "壽險")).toBe(0);
    // 停效同理；手動 coverages[] 那一半不受影響
    c.policies.forEach((p: { status?: string }) => { p.status = "停效"; });
    expect(E.existingCover(c, pm, "壽險")).toBe(0);
    c.coverages = [{ member: pm, kind: "壽險", comm: 1_000_000, social: 0 }];
    expect(E.existingCover(c, pm, "壽險")).toBe(1_000_000);
    // 留空＝有效（刻意的，不要改）
    c.coverages = [];
    c.policies.forEach((p: { status?: string }) => { delete p.status; });
    expect(E.existingCover(c, pm, "壽險")).toBe(before);
  });

  // 2026/08/28：advice() 的「可調整資產」直接讀原幣 a.value，外幣資產少乘匯率。
  it("advice()：可調整資產走 aVal（換匯），兩邊逐字相同", () => {
    expect(HTML).toContain("var movable=sum(c.assets,function(a){return a.movable?aVal(a):0});");

    const c = E.sampleCase();
    c.assets = c.assets.map((a: { movable?: boolean }) => ({ ...a, movable: false }));
    c.assets.push({ name: "美股", owner: "本人", mainCat: "可投資資產", type: "股票",
      cls: "流動", currency: "美金", fxRate: 32, value: 100000, movable: true });
    const row = E.advice(c).find((x: string[]) => x[0] === "資產活化配置");
    expect(row, "應該要有『資產活化配置』這一條").toBeTruthy();
    // 100,000 美金 × 32 ＝ 3,200,000（漏乘匯率的話這裡會是 100,000）
    expect(row[1]).toContain(E.fmt(3_200_000));
  });

  // 2026/08/28：唯一的真實引擎漂移。html 的 allocInvest 會把調整動作裡的
  // 定期定額／單筆投入 map 成投資列再 concat，engine 只有 own 那一半
  // → plan.useAllocReturn 打開時 effReturn 與 allocPV 兩邊不同，
  //   寫進 DB 的 shortPV／願景達成度／health_grade 與教練畫面上的不是同一個數字。
  // 以 html 版為準移植進 engine.ts。
  it("allocInvest：手填的 plan.invest ＋ 動作帶來的投資列，兩邊一致", () => {
    expect(HTML).toContain(
      "var fromAct=planActionsOn(c).filter(function(a){return a.cat==='regular'||a.cat==='lump'}).map(function(a){",
    );
    expect(HTML).toContain("years:Math.max(1,to-from+(a.cat==='lump'?1:0)),");
    expect(HTML).toContain("fromAction:true,actionId:a.id};");
    expect(HTML).toContain("function allocInvestOwn(c){return ((c.plan||{}).invest)||[]}");

    const c = E.sampleCase();
    c.plan = { invest: [{ name: "手填", src: "新增投入", principal: 0, yearly: 120000, years: 10, ret: 5 }] };
    c.actions = [
      { id: "a1", on: true, cat: "regular", name: "每月定期定額", tool: "ETF",
        payFrom: 41, payTo: 60, payMonthly: 10000, growth: 6 },
      { id: "a2", on: true, cat: "lump", name: "年終單筆", tool: "ETF",
        payFrom: 42, payTo: 42, payLump: 500000, growth: 6 },
      { id: "a3", on: true, cat: "income", name: "加薪", getMonthly: 5000 },
      { id: "a4", on: false, cat: "regular", name: "關掉的", payMonthly: 99999 },
    ];
    const rows = E.allocInvest(c);
    // 手填 1 列 ＋ regular/lump 各 1 列；income 與關掉的都不算
    expect(rows).toHaveLength(3);
    expect(E.allocInvestOwn(c)).toHaveLength(1);
    const reg = rows[1], lump = rows[2];
    expect(reg.fromAction).toBe(true);
    expect(reg.actionId).toBe("a1");
    expect(reg.yearly).toBe(120000);
    expect(reg.years).toBe(19);          // 定期定額：60−41（單筆才 +1）
    expect(reg.ret).toBe(6);
    expect(lump.principal).toBe(500000);
    expect(lump.years).toBe(1);          // 單筆：42→42，+1
    // 動作沒填名稱時退回類別預設名（actCat 也一起移植過來了）
    c.actions[0].name = "";
    expect(E.allocInvest(c)[1].name).toBe("定期定額");
    expect(E.actCat("lump").n).toBe("單筆投入");

    // useAllocReturn 打開時，加權報酬率必須吃得到動作那幾列
    c.plan.useAllocReturn = true;
    expect(E.effReturn(c)).toBeGreaterThan(5);
  });

  it("lifeNeed 兩邊都把父母奉養費 × 保障年數 算進責任", () => {
    expect(HTML).toContain("familyAnnualParentSupport(c)*n(nd.protectYears)");
    const c = E.sampleCase();
    const nd = c.needs[0];
    const before = E.lifeNeed(c, nd);
    const c2 = JSON.parse(JSON.stringify(c));
    c2.expenses.push({ name: "加碼孝親", cat: "孝親", amount: 100000, infl: false, start: 40, end: 70, cut: 0 });
    expect(E.lifeNeed(c2, c2.needs[0]) - before).toBe(100000 * E.n(nd.protectYears));
  });

  it("貸款壓力比：兩邊都是『負債表反推 + 支出側手動貸款列』", () => {
    expect(HTML).toContain("var loanPay=annualDebtPay(c)+manualLoanPay(c);");
  });

  it("有效儲蓄率：兩邊都優先吃 c.savings[]，沒有才退回舊參數欄", () => {
    expect(HTML).toContain("var saveActive=m.saveInvest>0?m.saveInvest:(n(c.params.planYearly)||Math.max(0,m.save));");
  });

  it("assetLayer：資產布局的推導規則兩邊一致", () => {
    expect(HTML).toContain("return isRiskAsset(a)?'衛星':'核心';");
    expect(HTML).toContain("if(a.mainCat==='自用資產')return '生活用';");
  });

  it("crossTable：貸款／撫育／儲蓄理財投入的分列兩邊一致", () => {
    // 2026/08/29：crossTable 的每一列都改吃「現齡有效」（activeNow），合計才對得上分項。
    expect(HTML).toContain("var expOther=sum(c.expenses,function(e){return (activeNow(c,e)&&['生活','消費','稅賦','保險','孝親','貸款'].indexOf(e.cat)<0)?n(e.amount):0});");
    const ct = E.crossTable(E.sampleCase());
    for (const k of ["expLoan", "expSupport", "expOther", "saveInvest"]) {
      expect(ct[k], k).toBeTypeOf("number");
    }
  });

  // ── 2026/08 退休期三段式金流 ──
  it("三段權重 retiredWeight()：公式與降級路徑兩邊一致", () => {
    expect(HTML).toContain("var done=0;pts.forEach(function(p){if(age>p.at)done+=p.share;});");
    expect(HTML).toContain("return done/tot;");
    // 支出比例全空時退回「本人退休即全面切換」，不可除以零
    expect(HTML).toContain("var p0=null;pts.forEach(function(p){if(p.primary)p0=p;});p0=p0||pts[0];");
  });

  it("退休時點換算成本人年齡的算式兩邊一致", () => {
    expect(HTML).toContain("out.push({name:m.name||'',primary:isP,share:Math.max(0,n(m.expRatio)),at:a0+(ra-ma)});");
    const c = E.sampleCase();
    c.members[1].retireAge = 60; // 配偶 38 歲
    const spouse = E.earnerRetirePoints(c).find((p: { primary: boolean }) => !p.primary);
    expect(spouse.at).toBe(E.n(c.profile.age) + (60 - E.n(c.members[1].age)));
  });

  it("工作期支出只縮減生活＋消費兩類，兩邊一致", () => {
    expect(HTML).toContain("s+=isLivingCat(e.cat)?v*(1-w):v;");
    expect(HTML).toContain("function isLivingCat(cat){return cat==='生活'||cat==='消費';}");
  });

  it("projection／monteCarlo 的退休期支出都是 retireAnnual×w（不再是 monthLiving 硬加）", () => {
    expect(HTML).toContain("var retireDraw=retireAnnual(c,age,inflF)*w;");
    expect(HTML).toContain("var retireDraw=retireAnnual(c,age,cumI)*wMC;");
    expect(HTML).not.toContain("age>n(c.profile.retireAge))? n(c.retire&&c.retire.monthLiving)*12");
  });

  // 2026/09/01：口徑從「表有沒有列」的隱式判斷，改成明確的 retire.mode（simple / detail）。
  // Ray 回報：月生活費那格改了數字完全不動，畫面卻還讓人填。判定結果與舊行為等價。
  it("簡易口徑時退回 monthLiving×12", () => {
    expect(HTML).toContain("if(retireMode(c)!=='detail')return n(c.retire&&c.retire.monthLiving)*12*inflFactor;");
    const c = E.sampleCase();
    c.retireExpenses = [];
    c.retire.mode = "";
    expect(E.retireAnnual(c, 70, 1)).toBe(E.n(c.retire.monthLiving) * 12);
  });

  it("⚠️ mode 是 detail 但明細表被清空時退回簡易，不會算成 0", () => {
    const c = E.sampleCase();
    c.retireExpenses = [];
    c.retire.mode = "detail";
    expect(E.retireMode(c)).toBe("simple");
    expect(E.retireAnnual(c, 70, 1)).toBe(E.n(c.retire.monthLiving) * 12);
  });

  it("⚠️ retireNeed 與 retireAnnual 必須走同一個 retireMode（不能一個看表、一個看 mode）", () => {
    expect(HTML).toContain("var hasList=retireMode(c)==='detail';");
    const c = E.sampleCase();
    c.retire.mode = "simple";
    // 明細表還在，但口徑是簡易 → 分子必須是 monthLiving，不是明細合計
    expect(E.retireAnnual(c, E.n(c.profile.retireAge), 1)).toBe(E.n(c.retire.monthLiving) * 12);
  });

  it("retireNeed：有明細表走逐年折現、沒有走封閉式年金，兩邊一致", () => {
    expect(HTML).toContain("total+=retireAnnual(c,ra+1+k,Math.pow(1+infl,years)*Math.pow(1+g,k))/Math.pow(1+rr,k+1);");
    expect(HTML).toContain("else{total=annualFV*(1-Math.pow((1+g)/(1+rr),m))/(rr-g);}");
  });

  // 2026/08/28：valid 原本只有 engine 端有，html 連回傳都沒有。
  // 真實資料裡有一位客戶是 retireAge=100 / lifeExp=85，這個分支一定會被看到。
  it("retireNeed：valid 兩邊逐字一致，且 html 有把它接上警語", () => {
    // 2026/08/29 C5：回傳多了 preparedRows（每一列的領取方式換算），斷言字串跟著更新。
    expect(HTML).toContain(
      "return {years:years,余年:m,monthFV:monthFV,total:total,prepared:prepared,preparedRows:preparedRows,gap:Math.max(0,total-prepared),valid:m>0};",
    );
    // 警語本體與四個落點（退休分頁 big3／需求明細／分析頁 retire 模組／報告書退休段）
    expect(HTML).toContain("function retireInvalidHTML(c,light){");
    expect(HTML).toContain("退休需求無法計算——請先到「家庭」分頁修正這兩個數字。");
    expect(HTML).toContain("if(rn.valid===false)return retireInvalidHTML(c);");                    // retireHeroHTML
    expect(HTML).toContain("if(rn.valid===false)return detailBox('退休需求計算明細',retireInvalidHTML(c));");
    expect(HTML).toContain("if(x.valid===false)return retireInvalidHTML(c);");                     // 分析頁模組
    expect(HTML).toContain("(rn.valid===false");                                                   // 報告書

    const c = E.sampleCase();
    expect(E.retireNeed(c).valid).toBe(true);
    c.profile.retireAge = 100;
    c.profile.lifeExp = 85;
    const rn = E.retireNeed(c);
    expect(rn.valid).toBe(false);
    expect(rn.余年).toBe(0);
    expect(rn.gap).toBe(0);   // ← 這個 0 就是會被誤讀成「沒有退休缺口」的那個
  });

  it("health()：safety 的 0~100 clamp 兩邊都要有", () => {
    expect(HTML).toContain(
      "var safety=Math.max(0,Math.min(100,Math.round((balScore*25+reserve*15+credit*15+debtBal*15+riskCover*30))));",
    );
  });

  it("riskQScore()：題目索引越界時回 0，兩邊都要有防護", () => {
    expect(HTML).toContain("function riskQScore(qi,list){var Q=RISK_Q[qi],mx=0;if(!Q)return 0;");
    expect(E.riskQScore(999, [0])).toBe(0);
  });

  it("延後退休會推每位賺薪成員的退休年齡，兩邊一致", () => {
    // 2026/08/23：這段從 scenario() 抽成 applyRetireDelay()，scenario 與六根槓桿共用同一份。
    expect(HTML).toContain("(c.members||[]).forEach(function(m){if(m&&m.role!=='本人'&&n(m.retireAge)>0)m.retireAge=n(m.retireAge)+years});");
    const c = E.sampleCase();
    c.members.push({ name: "配偶", role: "配偶", age: 38, retireAge: 60, expRatio: 40 });
    const after = E.applyLevers(c, { retire: 5 });
    expect(after.profile.retireAge).toBe(E.n(c.profile.retireAge) + 5);
    expect(after.members[after.members.length - 1].retireAge).toBe(65);
  });

  it("現值缺口的封閉解：兩邊是同一條公式", () => {
    // shortPV = max over t ( −raw_t ÷ (1+r)^(t+1) )
    // ⚠️ 2026/08/24 起缺口看的是「主池＋分離池」的合計（rawTot），不是只看主池。
    expect(HTML).toContain("var rawTot=raw+potSum;");
    expect(HTML).toContain("if(rawTot<0){if(negAge===null)negAge=age;var need_=-rawTot/df;if(need_>shortPV){shortPV=need_;shortAge=age;}}");
    expect(HTML).toContain("raw=raw*(1+ret)+bal;");
  });

  it("願景達成度：兩邊都改成 1 −（現值缺口 ÷ 一生需求現值）", () => {
    expect(HTML).toContain("return Math.round(Math.max(0,Math.min(1,1-proj.shortPV/proj.needPV))*100);");
    expect(HTML).toContain("var vision=visionRateOf(m.proj);");
    // 舊公式不可以再存在於任何一邊
    expect(HTML).not.toContain("var vision=Math.round(Math.min(1,m.net/(m.visionNeed||1))*100);");
  });

  it("願景彈性度沿用既有欄位（minPresent / minAmount / imp），兩邊一致", () => {
    expect(HTML).toContain("function goalFloor(g){var v=n(g.minPresent);if(v>0)return Math.min(v,n(g.present));return n(g.imp)>=5?n(g.present):0}");
    expect(HTML).toContain("function wishFloor(w){var v=n(w.minAmount);if(v>0)return Math.min(v,n(w.amount));return n(w.imp)>=5?n(w.amount):0}");
  });

  it("願景選定閘 visionOn()：兩邊公式一致，且六個攔截點都接上了", () => {
    // ⚠️ 這條公式是「既有客戶數字一位不動」的保證：舊資料沒有 on 欄位（undefined），
    //    必須視為已選定。寫成 !!x.on 會讓所有既有客戶的願景一夜消失。
    const F = "function visionOn(x){return !x||x.on!==false}";
    expect(HTML).toContain(F);
    expect(E.visionOn.toString().replace(/\s+/g, "")).toContain("x.on!==false");

    // 六個攔截點（html 端逐一釘住，engine 端由下面的數字斷言守）
    // 2026/08/29：起訖判斷搬到共用的 inSpan()（留空＝全期間有效），攔截點本身沒有搬家。
    expect(HTML).toContain("(arr||[]).forEach(function(it){if(!visionOn(it))return;if(inSpan(it,age))");
    // 2026/08/30：purchase-loan 之後 goalOut 從 sum() 換成帶索引的 forEach（要認得出「這一筆有沒有貸款」），
    // 攔截點本身沒有搬家——projection 與 monteCarlo 各一處。
    expect(HTML.match(/if\(!visionOn\(gg\)\)return;if\(!inSpan\(gg,age\)\)return;/g)?.length).toBe(2);
    expect(HTML).toContain("return visionOn(g)?Math.max(0,n(g.present)-goalFloor(g)):0");
    expect(HTML).toContain("(a.goals||[]).forEach(function(g){if(!visionOn(g))return;var f=goalFloor(g)");
    expect(HTML).toContain("function legacyNeed(c){var lg=c.legacy||{};if(lg.on===false)return 0;");
  });

  // ── 2026/08/29 A1｜收支加總只算「現齡有效」 ──
  it("metrics()：incTotal / expTotal 只加總現齡有效的列，兩邊逐字一致", () => {
    expect(HTML).toContain("var incTotal=sum(c.incomes,function(i){return activeNow(c,i)?n(i.amount):0});");
    expect(HTML).toContain("var expTotal=sum(c.expenses,function(e){return activeNow(c,e)?n(e.amount):0})+annualDebtPay(c);");
    // 表面總額另外留一份給真的需要它的地方用
    expect(HTML).toContain("var incTotalRaw=sum(c.incomes,function(i){return n(i.amount)});");
    expect(HTML).toContain("var expTotalRaw=sum(c.expenses,function(e){return n(e.amount)})+annualDebtPay(c);");
    expect(HTML).toContain("incTotalRaw:incTotalRaw,expTotalRaw:expTotalRaw,retireAgeAssumed:retireAgeAssumed(c),");
    // ratios 的分子也要同一個口徑，否則分子/分母兩套會算出 190000% 這種比率
    expect(HTML).toContain("var incWork=sum(c.incomes,function(i){return (i.type==='工作'&&activeNow(c,i))?n(i.amount):0});");

    // 示範案（現齡 40、收入列 40–65／40–60）：現齡有效 ＝ 表面總額
    const c = E.sampleCase();
    expect(E.metrics(c).incTotal).toBe(E.metrics(c).incTotalRaw);
    // 把現齡推到 70：兩條收入列都已結束 → 現齡有效 0，表面總額仍是 190 萬
    c.profile.age = 70;
    const m = E.metrics(c);
    expect(m.incTotalRaw).toBe(1_900_000);
    expect(m.incTotal).toBe(0);
    // 與 projection 第 0 年同一個口徑
    expect(m.proj.rows[0].work).toBe(0);
    expect(E.health(c).grade).toBe("D");
  });

  it("A1 的兩個除以零破口：兩邊的防護逐字一致", () => {
    // 沒有有效支出 → 財務自由度不可以讀成 100%
    expect(HTML).toContain("var freedom=m.expTotal>0?Math.round(Math.min(1,m.incFinancial/m.expTotal)*100):0;");
    expect(HTML).toContain("add(g1,'財務自由度',m.expTotal>0?pct(m.incFinancial/m.expTotal):'—（現齡沒有有效支出）'");
    // 有收入列但沒有一列涵蓋現齡 → 以收入為分母的比率一律「—」
    expect(HTML).toContain(" if(m.incTotal<=0&&m.incTotalRaw>0){");
    expect(HTML).toContain("   if(r[k]){r[k].v='—（現齡沒有有效收入）';r[k].status='na';r[k].ok=false;}");
    // 舊寫法不可以再存在於任何一邊
    expect(HTML).not.toContain("var freedom=Math.round(Math.min(1,m.incFinancial/(m.expTotal||1))*100);");
  });

  it("A4b｜起訖留空＝全期間有效：inSpan() 兩邊逐字一致", () => {
    expect(HTML).toContain("function inSpan(x,age){");
    expect(HTML).toContain(" var s=n(x&&x.start),e=n(x&&x.end);");
    expect(HTML).toContain(" if(s>0&&age<s)return false;");
    expect(HTML).toContain(" if(e>0&&age>e)return false;");
    expect(HTML).toContain("function nowAge(c){return n((c&&c.profile||{}).age)||40;}");
    expect(HTML).toContain("function activeNow(c,x){return inSpan(x,nowAge(c));}");
    // 三個依起訖過濾的地方都改走同一支
    expect(HTML).toContain("  if(!inSpan(e,age))return;");                       // workPhaseExpense
    expect(HTML).toContain("(i.type==='工作'&&inSpan(i,age))");                  // projection 收入
    // 舊的逐列寫法不可以再存在於任何一邊
    expect(HTML).not.toContain("if(age<n(e.start)||age>n(e.end))return;");

    expect(E.inSpan({ start: "", end: "" }, 40)).toBe(true);
    expect(E.inSpan({ start: 0, end: 0 }, 999)).toBe(true);
    expect(E.inSpan({ start: 50, end: "" }, 40)).toBe(false);
    expect(E.inSpan({ start: "", end: 50 }, 60)).toBe(false);
    expect(E.inSpan({ start: 40, end: 65 }, 40)).toBe(true);
  });

  it("A2｜模擬到幾歲綁死預估壽命＋可覆寫：effHorizon() 兩邊逐字一致", () => {
    expect(HTML).toContain("function horizonManual(c){");
    expect(HTML).toContain(" if(p.horizonManual===true)return true;");
    expect(HTML).toContain(" if(p.horizonManual===false)return false;");
    expect(HTML).toContain(" return h>0&&le>0&&h!==le;");
    expect(HTML).toContain("function effHorizon(c){");
    expect(HTML).toContain(" if(horizonManual(c))return n(p.horizon)||85;");
    expect(HTML).toContain(" return n(pr.lifeExp)||n(p.horizon)||85;");
    expect(HTML).toContain("var a0=n(c.profile.age)||40,aEnd=effHorizon(c),infl=n(c.params.inflation)/100;");
    expect(HTML).toContain("var a0=n(c.profile.age)||40,aEnd=effHorizon(c),years=Math.max(0,aEnd-a0+1);");
  });

  it("A3｜沒人填退休年齡時退回 65：retirePoints() 兩邊逐字一致", () => {
    expect(HTML).toContain("var DEFAULT_RETIRE_AGE=65;");
    expect(HTML).toContain("function retireAgeAssumed(c){return earnerRetirePoints(c).length===0;}");
    expect(HTML).toContain(" return [{name:((primaryMember(c)||{}).name)||'',primary:true,share:0,at:DEFAULT_RETIRE_AGE,assumed:true}];");
    expect(HTML).toContain(" var pts=retirePoints(c);");
  });

  it("求解上限常數：兩邊的預設值一致，且都吃得到後台覆蓋", () => {
    expect(HTML).toContain("var CAP_RATE=8;");
    expect(HTML).toContain("var PLAN_DISCOUNT=2.5;");
    expect(HTML).toContain("function applyPlanCaps(values){");
    expect(E.CAP_RATE).toBe(8);
    expect(E.PLAN_DISCOUNT).toBe(2.5);
  });

  it("effReturn：預設不跟著配置走（既有客戶的數字一位都不能動）", () => {
    expect(HTML).toContain("function effReturn(c){");
    const c = E.sampleCase();
    c.plan = { allocations: [{ name: "股票", pct: 100, ret: 12 }] };
    expect(E.effReturn(c)).toBe(E.n(c.params.invReturn));   // 沒打開開關 → 還是參數頁那個值
    c.plan.useAllocReturn = true;
    expect(E.effReturn(c)).toBe(12);
  });

  it("負債一律換匯（lBal），不可直接讀 l.balance", () => {
    // 兩邊的 grossLifeNeed 都要用 lBal，否則外幣房貸在「缺口」與「準備度」兩頁會差一個匯率
    expect(HTML).toContain("+(needCoversDebt(c,nd)?sum(c.liabilities,function(l){return lBal(l)}):0)");

    const c = E.sampleCase();
    c.liabilities = [{ name: "美金房貸", currency: "美金", fxRate: 32, balance: 100000, rate: 2, pay: 500, months: 240, startAge: 38 }];
    const nd = c.needs[0];
    // 需求裡的負債部分＝ 100,000 × 32
    expect(E.lBal(c.liabilities[0])).toBe(3_200_000);
    expect(E.lifeNeed(c, nd)).toBeGreaterThanOrEqual(0);
  });

  it("剩餘本金用攤還公式，不是線性遞減", () => {
    expect(HTML).toContain("function lRemain(l,age,a0){");
    // 2% 的 1000 萬房貸、月繳 42,000，第 10 年的剩餘本金應明顯高於「餘額 − 月繳×12×10」
    const l = { balance: 10_000_000, fxRate: 1, rate: 2, pay: 42000, months: 300, startAge: 40 };
    const linear = 10_000_000 - 42000 * 12 * 10;
    const amortised = E.lRemain(l, 50, 40);
    expect(amortised).toBeGreaterThan(linear);
    expect(amortised).toBeLessThan(10_000_000);
  });

  it("財務階段 STAGE 的名稱與課題兩邊一致", () => {
    for (const g of ["D", "C", "B", "A"] as const) {
      expect(HTML).toContain(`${g}:{name:'${E.STAGE[g].name}',task:'${E.STAGE[g].task}'`);
    }
  });

  // 2026/08/28 改版：第 12 題從「臨時需要動用的可能性」換成「緊急預備金可支應幾個月」。
  // ⚠️ ans 是用題目索引當 key，所以題號、選項數、配分都不能動——這條守住兩邊題目逐字一致。
  it("第 12 題（緊急預備金）兩邊逐字一致，且題數與配分不變", () => {
    const Q = E.RISK_Q[11];
    expect(Q.q).toBe("您目前的緊急預備金（可隨時動用的現金）大約可以支應幾個月的生活支出？");
    expect(HTML).toContain(`{q:'${Q.q}'`);
    for (const [label, pt] of Q.o) expect(HTML).toContain(`['${label}',${pt}]`);
    expect(E.RISK_Q.length).toBe(12);
    expect(E.RISK_Q.reduce((s: number, q: { o: [string, number][] }) =>
      s + Math.max(...q.o.map((x) => x[1])), 0)).toBe(60);
  });

  // 2026/08/28：資產的流動性有時間性（債權還款、租約到期）。全站吃 cls 的地方
  // 一律走 aCls()，兩份實作都要有——漏改一邊，教練端與報告書會看到不同的流動資產。
  it("aCls：到期年齡過了就轉流動，兩邊都要有", () => {
    expect(E.aCls({ cls: "固定", matureAge: 41 }, 42)).toBe("流動");
    expect(E.aCls({ cls: "固定", matureAge: 41 }, 39)).toBe("固定");
    expect(E.aCls({ cls: "流動" }, 30)).toBe("流動");
    expect(HTML).toContain("function aCls(a,curAge){");
    expect(HTML).toContain("function aLiquid(c,a){");
    expect(HTML).toContain("function aMatured(c,a){");
    // ⚠️ 不可以再有人直接讀 a.cls——只剩 aCls 自己那一行
    expect((HTML.match(/cls==='流動'/g) || []).length, "html 只剩 aCls 內部那一處").toBe(1);
  });

  it("到期之後被動現金流停算（本金不動，它本來就在資產總額裡）", () => {
    const c = E.sampleCase();
    c.profile.age = 42;
    c.assets = [{ name: "債權", mainCat: "可投資資產", type: "應收帳款/借出款", cls: "固定", currency: "台幣", fxRate: 1, value: 6_000_000, income: 216_000, matureAge: 41 }];
    expect(E.assetPassive(c)).toBe(0);
    c.profile.age = 39;
    expect(E.assetPassive(c)).toBe(216_000);
  });

  it("KYC 複選題：兩邊都把第 7、8 題標成 multi，且計分取最高分", () => {
    expect(E.RISK_Q[6].multi).toBe(true);
    expect(E.RISK_Q[7].multi).toBe(true);
    expect((HTML.match(/multi:true/g) || []).length).toBe(2);

    const c = E.sampleCase();
    c.riskQuiz = { ans: { 0: 1, 1: 2, 2: 2, 3: 2, 4: 1, 5: 2, 6: [2, 3], 7: 2, 8: 2, 9: 2, 10: 2, 11: 2 } };
    const r = E.riskScore(c);
    expect(r.answered).toBe(12);
    expect(r.unanswered).toEqual([]);
    // 第 7 題勾了索引 2(3分) 與 3(4分) → 取 4 分
    expect(r.score).toBe(2 + 3 + 3 + 3 + 2 + 3 + 4 + 3 + 3 + 3 + 3 + 3);
  });

  it("riskScore：越界索引不丟例外（舊版直接 TypeError）", () => {
    const c = E.sampleCase();
    c.riskQuiz = { ans: { 0: 99 } };
    expect(() => E.riskScore(c)).not.toThrow();
    expect(E.riskScore(c).score).toBe(0);
  });

  it("PURPOSES / TARGETS 只有一份真相（engine 由 intent.ts re-export）", async () => {
    const intent = await import("./intent");
    expect(E.PURPOSES).toBe(intent.PURPOSES);
    expect(E.TARGETS).toBe(intent.TARGETS);
    // 已廢止的舊值不該再出現
    expect(E.PURPOSES).not.toContain("想買車、買房，進行置產");
    expect(E.TARGETS).not.toContain("人生模擬");
    expect(E.TARGETS).toContain("婚姻規劃");
  });

  it("財務階段：判定條件／定義文案三份對照表一致（engine.ts ↔ lantu-app.html ↔ format.ts）", async () => {
    const fmt = await import("@/app/dashboard/format");
    for (const k of ["D", "C", "B", "A"] as const) {
      const st = E.STAGE[k];
      expect(st.gate, `STAGE.${k}.gate 未定義`).toBeTruthy();
      expect(st.desc, `STAGE.${k}.desc 未定義`).toBeTruthy();
      // html 端
      expect(HTML).toContain(st.gate);
      expect(HTML).toContain(st.desc);
      // format.ts（React 端顯示層）
      expect(fmt.STAGE_GATE[k]).toBe(st.gate);
      expect(fmt.STAGE_DESC[k]).toBe(st.desc);
      expect(fmt.STAGE_LABEL[k]).toBe(st.name);
      expect(fmt.STAGE_TASK[k]).toBe(st.task);
    }
    // 三項指標的算法說明
    expect(E.STAGE_METRICS).toHaveLength(3);
    E.STAGE_METRICS.forEach((m: [string, string], i: number) => {
      expect(HTML).toContain(m[1]);
      expect(fmt.STAGE_METRICS[i][0]).toBe(m[0]);
      expect(fmt.STAGE_METRICS[i][1]).toBe(m[1]);
    });
  });

  it("財務階段：判定條件文字要對得上 health() 實際的門檻值", () => {
    // 這裡守的是「說明別跟程式漂移」：grade 判定式改了，下面的字串就得跟著改。
    expect(HTML).toContain("var grade=(safety<60||balScore<1)?'D':(freedom<20?'C':(vision<60?'B':'A'))");
    expect(E.STAGE.D.gate).toContain("60");
    expect(E.STAGE.C.gate).toContain("20%");
    expect(E.STAGE.B.gate).toContain("60%");
  });

  it("國民年金常數：engine.ts（來自 taiwan.ts）與 lantu-app.html 兩邊一致", () => {
    expect(HTML).toContain("var NP_INSURED_MONTHLY=" + E.NP_INSURED_MONTHLY);
    expect(HTML).toContain("NP_RATE_A=" + E.NP_RATE_A);
    expect(HTML).toContain("NP_BONUS_A=" + E.NP_BONUS_A);
    expect(HTML).toContain("NP_RATE_B=" + E.NP_RATE_B);
    expect(HTML).toContain("var NP_YEAR=" + E.NP_YEAR);
    // 工作類別與「沒有雇主」的判定
    expect(HTML).toContain("var JOB_TYPES=['" + E.JOB_TYPES.join("','") + "']");
    expect(HTML).toContain("var NO_EMPLOYER_JOBS=['" + E.NO_EMPLOYER_JOBS.join("','") + "']");
    expect(HTML).toContain("var LABOR_LIKE_INS=['" + E.LABOR_LIKE_INS.join("','") + "']");
  });

  it("estimateSocialPension：國民年金身分走 A／B 擇優、且不給勞退新制", () => {
    const c = E.sampleCase();
    const pm = c.members.find((m: { role: string }) => m.role === "本人");
    pm.insType = "國民年金";
    pm.insSalary = E.NP_INSURED_MONTHLY;
    pm.worked = 15;
    const r = E.estimateSocialPension(c);
    expect(r.kind).toBe("np");
    expect(r.fund).toBe(0); // 沒有雇主提繳 → 沒有勞退
    expect(r.monthly).toBeCloseTo(Math.max(r.npA, r.npB), 6);
    expect(r.npA).toBeCloseTo(E.NP_INSURED_MONTHLY * r.years * E.NP_RATE_A + E.NP_BONUS_A, 6);
    expect(r.npB).toBeCloseTo(E.NP_INSURED_MONTHLY * r.years * E.NP_RATE_B, 6);
    expect(["A", "B"]).toContain(r.pick);
    expect(r.total).toBeCloseTo(r.lump, 6);
  });

  it("estimateSocialPension：勞保身分走 A/B 式擇優 ＋ 勞退新制；公保等身分不概算", () => {
    const c = E.sampleCase();
    const labor = E.estimateSocialPension(c);
    expect(labor.kind).toBe("labor");
    expect(labor.fund).toBeGreaterThan(0);
    // 正常分級表（≥29,500）且年資已滿 15 年時 B 式必勝，所以這裡仍應等於 1.55% 那條。
    expect(labor.pick).toBe("B");
    expect(labor.monthly).toBeCloseTo(labor.ins * labor.years * 0.0155, 6);
    // 舊名要還能用（export 契約相容）
    expect(E.estimateLaborPension(c).total).toBeCloseTo(labor.total, 6);

    const pm = c.members.find((m: { role: string }) => m.role === "本人");
    pm.insType = "公保";
    const other = E.estimateSocialPension(c);
    expect(other.kind).toBe("other");
    expect(other.total).toBe(0);
  });
});

/**
 * 勞保/勞退的雙實作對拍。
 *
 * 這一段用 jsdom 把 lantu-app.html 真的跑起來，拿同一份 case 餵兩邊的
 * estimateSocialPension，逐欄比對。年資、A/B 擇優、15 年門檻、勞退專戶滾存
 * 這四件事任何一邊改了沒同步，這裡就會紅。
 */
describe("雙實作對拍：estimateSocialPension（engine.ts ↔ lantu-app.html）", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;

  beforeAll(async () => {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const build = (over: Record<string, any>) => {
    const c = E.sampleCase();
    c.profile.age = over.age ?? 40;
    c.profile.retireAge = over.retireAge ?? 65;
    const pm = c.members[0];
    pm.insType = over.insType ?? "勞保";
    pm.insSalary = over.insSalary ?? 45800;
    pm.worked = over.worked ?? 0;
    pm.pensionBalance = over.pensionBalance ?? 0;
    pm.pensionYears = over.pensionYears ?? 0;
    return c;
  };

  const CASES: Array<[string, Record<string, number | string>]> = [
    ["沒填年資的一般受僱者", {}],
    ["已投保 15 年", { worked: 15 }],
    ["年資未滿 15 年（只能領一次金）", { age: 57, worked: 0, insSalary: 40100 }],
    ["部分工時低投保薪資（A 式勝）", { age: 45, insSalary: 11100 }],
    ["有勞退專戶餘額", { worked: 12, pensionBalance: 800000 }],
    ["專戶餘額由提繳年資回推", { worked: 12, pensionYears: 10 }],
    ["國民年金", { insType: "國民年金", insSalary: 21103, worked: 9 }],
    ["公保（不概算）", { insType: "公保" }],
  ];

  it.each(CASES)("%s：兩邊每一欄都相同", (_label, over) => {
    const c = build(over);
    const a = E.estimateSocialPension(c);
    const b = w.estimateSocialPension(JSON.parse(JSON.stringify(c)));
    for (const k of ["kind", "years", "past", "future", "pick", "eligible", "onceMonths", "fundEstimated"]) {
      expect(b[k], k).toEqual(a[k]);
    }
    for (const k of ["ins", "pensionBase", "monthly", "lump", "fund", "fundNow", "fundNew", "insA", "insB", "npA", "npB", "total"]) {
      expect(b[k], k).toBeCloseTo(a[k], 6);
    }
  });
});

/**
 * 2026/08/29「死欄位」接線（C1–C11）的雙實作對拍。
 *
 * 這一批動到 lRemain／annualDebtPay／assetPassive／retireNeed／grossLifeNeed／
 * estateTax／masterAnalysis／applyLevers／leverRange／coverageGaps／savingInvest——
 * 幾乎每一支都同時餵 DB 快照（engine.ts）與畫面（lantu-app.html）。
 * 任何一邊改了計算而沒同步，這一組就會紅。
 *
 * ⚠️ 行為釘在 src/lib/deadFields.test.ts，這裡只做「兩邊逐字一致 ＋ 同一份個案同一個數字」。
 */
describe("雙實作對拍：死欄位接線（C1–C11）", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  beforeAll(async () => {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  });

  it("C1 可刪減%：rowCutPct / expenseCutCap / applyLevers 兩邊逐字一致", () => {
    expect(HTML).toContain("function rowCutPct(e,leverPct){");
    expect(HTML).toContain(" var cap=n(e&&e.cut);\n return cap>0?Math.min(leverPct,cap):leverPct;");
    expect(HTML).toContain("cap=Math.max(cap,rc>0?Math.min(rc,CAP_EXPENSE_CUT):CAP_EXPENSE_CUT);");
    expect(HTML).toContain("if(cut)(a.expenses||[]).forEach(function(e){if(isLivingCat(e.cat))e.amount=n(e.amount)*(1-rowCutPct(e,cut)/100)});");
    expect(HTML).toContain("if(id==='expense')return {lo:0,hi:expenseCutCap(c)};");

    const c = E.sampleCase();
    expect(w.expenseCutCap(JSON.parse(JSON.stringify(c)))).toBe(E.expenseCutCap(c));
    const a = E.applyLevers(c, { expense: 30 });
    const b = w.applyLevers(JSON.parse(JSON.stringify(c)), { expense: 30 });
    expect(b.expenses.map((e: { amount: number }) => e.amount))
      .toEqual(a.expenses.map((e: { amount: number }) => e.amount));
  });

  it("C2 照護月數：careMonthsOf / careNeedRows 兩邊逐字一致，且 120 的預設兩邊相同", () => {
    expect(HTML).toContain("var DEFAULT_CARE_MONTHS=120;");
    expect(HTML).toContain("function careMonthsOf(nd){");
    expect(HTML).toContain(" return m>0?{months:m,assumed:false}:{months:DEFAULT_CARE_MONTHS,assumed:true};");
    expect(HTML).toContain("row.needTotal=need*cm.months;row.haveTotal=ex*cm.months;");

    const c = E.sampleCase();
    expect(w.DEFAULT_CARE_MONTHS).toBe(E.DEFAULT_CARE_MONTHS);
    expect(w.careNeedRows(JSON.parse(JSON.stringify(c)))).toEqual(E.careNeedRows(c));
  });

  it("C3 攤還方式／寬限期：repayMode / graceMonths / lRemain / debtPayAt 兩邊逐字一致", () => {
    expect(HTML).toContain("function repayMode(l){var r=(l&&l.repay)||'';return (r==='只付利息'||r==='暫緩還款')?r:'本息攤還';}");
    expect(HTML).toContain("function graceMonths(l){var g=n(l&&l.grace);return g>0?Math.round(g):0;}");
    expect(HTML).toContain(" if(mode==='只付利息')return P;");
    expect(HTML).toContain(" if(mode==='暫緩還款')return (i<=0)?P:P*Math.pow(1+i,k);");
    expect(HTML).toContain(" var g=graceMonths(l); if(g>0)k=Math.max(0,k-g);");
    expect(HTML).toContain("function debtPayAt(l,age,a0){");
    expect(HTML).toContain(" if(el<graceMonths(l))return lRemain(l,age,a0)*n(l.rate)/100;");
    // 三個呼叫端一律走 debtPayAt（annualDebtPay / projection / monteCarlo）
    expect(HTML).toContain("function annualDebtPay(c){var a0=n(c.profile.age);return sum(c.liabilities,function(l){return debtPayAt(l,a0,a0)})}");
    // 2026/08/30：projection 與 monteCarlo 的 debt 都多接了購置貸款那一段（goalLoans）。
    expect(HTML.match(/var debt=sum\(c\.liabilities,function\(l\)\{return debtPayAt\(l,age,a0\)\}\)\+sum\(gLoans(MC)?,function\(L\)\{return debtPayAt\(L\.liab,age,a0\)\}\);/g)?.length).toBe(2);
    expect(HTML).not.toContain("(age>=sa&&(n(l.months)-el)>0)?lPay(l)*12:0");

    for (const mode of ["本息攤還", "只付利息", "暫緩還款", ""]) {
      for (const grace of [0, 24]) {
        const l = { name: "x", balance: 10_000_000, rate: 2, pay: 44_000, months: 360, startAge: 40, repay: mode, grace };
        for (const age of [40, 42, 50, 60]) {
          expect(w.lRemain(l, age, 40), mode + "/" + grace + "/" + age).toBeCloseTo(E.lRemain(l, age, 40), 6);
          expect(w.debtPayAt(l, age, 40), mode + "/" + grace + "/" + age).toBeCloseTo(E.debtPayAt(l, age, 40), 6);
        }
      }
    }
  });

  it("C4 資產報酬率：assetPassive 兩邊逐字一致，且範本都改成 income:''", () => {
    expect(HTML).toContain(" var inc=aInc(a);\n if(inc>0)return inc;\n return n(a.ret)>0?aVal(a)*n(a.ret)/100:0;})}");
    expect(HTML).toContain("cost:0,value:0,ret:0,income:'',movable:true}");
    const c = E.sampleCase();
    expect(w.assetPassive(JSON.parse(JSON.stringify(c)))).toBeCloseTo(E.assetPassive(c), 6);
  });

  it("C5 領取方式：growingAnnuityPV / preparedPV / 守門員 兩邊逐字一致", () => {
    expect(HTML).toContain("function growingAnnuityPV(annual,rr,g,m){");
    expect(HTML).toContain(" if(Math.abs(rr-g)<1e-6)return annual*m/(1+rr);\n return annual*(1-Math.pow((1+g)/(1+rr),m))/(rr-g);");
    expect(HTML).toContain("var PREPARED_MONTHLY_MAX=300000;");
    expect(HTML).toContain(" return ((p&&p.method)||'')==='月領'&&!(p&&p.monthlyOk)&&n(p&&p.amount)>PREPARED_MONTHLY_MAX;");
    expect(HTML).toContain(" var pv=growingAnnuityPV(amt*12,rr,g,Math.max(0,le-from));");
    expect(HTML).toContain(" return (back>0&&rr>-1)?pv/Math.pow(1+rr,back):pv;");
    // ⚠️ 名字不可以撞到追蹤表那支 annuityPV(pmt,yrs,ratePct)——html 是同一個全域命名空間
    expect(HTML).toContain("function annuityPV(pmt,yrs,ratePct){");
    expect(w.PREPARED_MONTHLY_MAX).toBe(E.PREPARED_MONTHLY_MAX);

    const c = E.sampleCase();
    c.profile.retireAge = 65; c.profile.lifeExp = 85;
    c.retire.prepared = [
      { item: "一次領", age: 65, amount: 1_000_000, method: "一次領" },
      { item: "月領", age: 65, amount: 25_000, method: "月領" },
      { item: "晚領", age: 70, amount: 20_000, method: "月領" },
      { item: "自提", age: 65, amount: 5_000_000, method: "自提" },
      { item: "疑似總額", age: 65, amount: 3_600_000, method: "月領" },
      { item: "確認月額", age: 65, amount: 400_000, method: "月領", monthlyOk: true },
    ];
    const a = E.retireNeed(c), b = w.retireNeed(JSON.parse(JSON.stringify(c)));
    expect(b.prepared).toBeCloseTo(a.prepared, 6);
    expect(b.gap).toBeCloseTo(a.gap, 6);
    expect(b.preparedRows.map((r: { pv: number }) => Math.round(r.pv)))
      .toEqual(a.preparedRows.map((r: { pv: number }) => Math.round(r.pv)));
    expect(b.preparedRows.map((r: { suspect: boolean }) => r.suspect))
      .toEqual(a.preparedRows.map((r: { suspect: boolean }) => r.suspect));
  });

  it("C6 財務獨立歲：indepDeps / protectYearsEff / grossLifeNeed 兩邊逐字一致", () => {
    expect(HTML).toContain("function indepDeps(c,name){");
    expect(HTML).toContain("  return !!x&&x.name!==name&&n(x.indepAge)>0&&n(x.expRatio)>0;});");
    expect(HTML).toContain("function protectYearsEff(c,nd){");
    expect(HTML).toContain("  for(var j=0;j<deps.length;j++){var d=deps[j];if(n(d.age)+y>=n(d.indepAge))frac+=n(d.expRatio)/100;}");
    expect(HTML).toContain("/100*famLiving*protectYearsEff(c,nd)");
    // 責任遞減圖與需求數字現在吃同一支 indepDeps（改版前是兩份手寫篩選）
    expect(HTML).toContain(" var deps=indepDeps(c,mb.name);");

    const c = E.sampleCase();
    c.needs[0].protectYears = 30;
    expect(w.protectYearsEff(JSON.parse(JSON.stringify(c)), c.needs[0]))
      .toBeCloseTo(E.protectYearsEff(c, c.needs[0]), 6);
    expect(w.grossLifeNeed(JSON.parse(JSON.stringify(c)), c.needs[0]))
      .toBeCloseTo(E.grossLifeNeed(c, c.needs[0]), 6);
  });

  it("C7 傳承進遺產稅：estateTax 兩邊逐字一致", () => {
    expect(HTML).toContain(" var legacyFed=lg.feedEstate?legacyNeed(c):0;\n var net=netBase+legacyFed;");
    expect(HTML).toContain("net:net,netBase:netBase,legacyFed:legacyFed,heirs:heirs");
    for (const on of [true, false]) {
      const c = E.sampleCase();
      c.legacy.feedEstate = on;
      const a = E.estateTax(c), b = w.estateTax(JSON.parse(JSON.stringify(c)));
      expect(b.tax, "feedEstate=" + on).toBeCloseTo(a.tax, 6);
      expect(b.legacyFed).toBeCloseTo(a.legacyFed, 6);
      expect(b.net).toBeCloseTo(a.net, 6);
    }
  });

  it("C8 已繳年數備援：masterAnalysis 兩邊逐字一致", () => {
    expect(HTML).toContain("  if(polY<=0)polY=Math.max(0,Math.round(n(p.paidYears)));");
    const c = E.sampleCase();
    c.policies = [
      { name: "無生效日", policyKind: "主約", premium: 50_000, payYears: 20, life: 3_000_000, effDate: "", paidYears: 8 },
      { name: "有生效日", policyKind: "主約", premium: 50_000, payYears: 20, life: 3_000_000, effDate: "2020/01/01", paidYears: 99 },
      { name: "都沒填", policyKind: "主約", premium: 50_000, payYears: 20, life: 3_000_000, effDate: "", paidYears: "" },
    ];
    const a = E.masterAnalysis(c, 2026), b = w.masterAnalysis(JSON.parse(JSON.stringify(c)), 2026);
    expect(b.map((x: { polYear: number }) => x.polYear)).toEqual(a.map((x: { polYear: number }) => x.polYear));
    expect(b.map((x: { paid: number }) => x.paid)).toEqual(a.map((x: { paid: number }) => x.paid));
  });

  it("C9 自由儲蓄%：兩邊的範本都不再帶這個欄位", () => {
    expect(HTML).not.toContain("freeSaving:1");
    expect(HTML).not.toContain("'freeSaving'");
    expect(E.sampleCase().params.freeSaving).toBeUndefined();
    expect(w.sampleCase().params.freeSaving).toBeUndefined();
  });

  it("C10 儲蓄起訖：savingInvest 兩邊逐字一致", () => {
    expect(HTML).toContain("function savingInvest(c){return sum(c.savings,function(x){return activeNow(c,x)?n(x.amount):0})}");
    const c = E.sampleCase();
    c.savings = [
      { name: "全期間", amount: 120_000 },
      { name: "已結束", amount: 60_000, start: 30, end: 35 },
      { name: "未開始", amount: 90_000, start: 50, end: 65 },
      { name: "只設起", amount: 30_000, start: 30, end: 0 },
    ];
    expect(w.savingInvest(JSON.parse(JSON.stringify(c)))).toBe(E.savingInvest(c));
    expect(E.savingInvest(c)).toBe(150_000);
  });

  it("整份示範案：健康度／缺口／退休／遺產稅 兩邊仍然一位不差", () => {
    const c = E.sampleCase();
    const j = () => JSON.parse(JSON.stringify(c));
    expect(w.health(j()).grade).toBe(E.health(c).grade);
    expect(w.health(j()).safety).toBe(E.health(c).safety);
    expect(w.gapTotals(j())).toEqual(E.gapTotals(c));
    expect(w.retireNeed(j()).gap).toBeCloseTo(E.retireNeed(c).gap, 6);
    expect(w.estateTax(j()).tax).toBeCloseTo(E.estateTax(c).tax, 6);
    expect(w.metrics(j()).proj.shortPV).toBeCloseTo(E.metrics(c).proj.shortPV, 6);
  });
});

/**
 * 雙實作對拍：D1 二代健保費 ／ D2 產險比對線（2026/08/29）。
 *
 * 兩件事一起守：
 *   ① 制度常數的三份同步 —— src/lib/taiwan.ts（一般保費）與 src/lib/bizTax.ts（補充保費／產險基準）
 *      是唯一真相，public/lantu-app.html 另存一份鏡像，這裡逐字比對。
 *   ② 計算兩邊等價 —— 同一份個案餵給 engine.ts 與 html，數字必須一位不差。
 *
 * ⚠️ 常數的年度（NHI_YEAR / NHI_SUPP_YEAR / PROP_INS_YEAR）也一併釘住：
 *    跨年沒回頭查健保署／金管會公告，taiwan.test.ts 那條「今年 ≤ 年度＋1」的護欄會先紅。
 */
describe("雙實作對拍：D1 二代健保費 ／ D2 產險比對線", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let w: any;
  beforeAll(async () => {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window;
    await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  });

  it("健保一般保費常數（taiwan.ts → html）兩邊一致", () => {
    expect(HTML).toContain("var NHI_YEAR=" + E.NHI_YEAR);
    expect(HTML).toContain("var NHI_RATE=" + E.NHI_RATE);
    expect(HTML).toContain("var NHI_SALARY_MIN=" + E.NHI_SALARY_MIN);
    expect(HTML).toContain("var NHI_SALARY_MAX=" + E.NHI_SALARY_MAX);
    expect(HTML).toContain("var NHI_SALARY_GRADES=" + E.NHI_SALARY_GRADES);
    expect(HTML).toContain("var NHI_DEP_CAP=" + E.NHI_DEP_CAP);
    // 每一個投保類別與它的自付比率都要在 html 那份鏡像裡逐字出現
    for (const [k, v] of E.NHI_CATS) expect(HTML).toContain("['" + k + "'," + v + "]");
    expect(w.NHI_CATS.length).toBe(E.NHI_CATS.length);
  });

  it("補充保費與產險基準常數（bizTax.ts → html）兩邊一致", () => {
    expect(HTML).toContain("var NHI_SUPP_RATE=" + E.NHI_SUPP_RATE);
    expect(HTML).toContain("var NHI_SUPP_MIN=" + E.NHI_SUPP_MIN);
    expect(HTML).toContain("var NHI_SUPP_YEAR=" + E.NHI_SUPP_YEAR);
    expect(HTML).toContain("var NHI_SUPP_CAP=" + E.NHI_SUPP_CAP);
    expect(HTML).toContain("var NHI_SUPP_BONUS_MULT=" + E.NHI_SUPP_BONUS_MULT);
    expect(HTML).toContain("var NHI_SUPP_WAGE_MIN=" + E.NHI_SUPP_WAGE_MIN);
    expect(HTML).toContain("var PROP_INS_YEAR=" + E.PROP_INS_YEAR);
    expect(HTML).toContain("var QUAKE_BASIC_SUM=" + E.QUAKE_BASIC_SUM);
    expect(HTML).toContain("var QUAKE_LODGING=" + E.QUAKE_LODGING);
    expect(HTML).toContain("var PROP_PING_COST=" + E.PROP_PING_COST);
    expect(HTML).toContain("var PROP_BUILDING_RATIO=" + E.PROP_BUILDING_RATIO);
    expect(HTML).toContain("var CAR_LIAB_BODILY=" + E.CAR_LIAB_BODILY);
    expect(HTML).toContain("var CAR_LIAB_PROPERTY=" + E.CAR_LIAB_PROPERTY);
    expect(HTML).toContain("var CALI_DEATH=" + E.CALI_DEATH);
    expect(HTML).toContain("var CALI_MEDICAL=" + E.CALI_MEDICAL);
    expect(HTML).toContain("var EMPLOYER_COMP_MONTHS=" + E.EMPLOYER_COMP_MONTHS);
    expect(HTML).toContain("var PUBLIC_LIAB_STD=[" + E.PUBLIC_LIAB_STD.join(",") + "]");
  });

  it("⚠️ 兼職所得門檻與健保投保金額第 1 級是同一個數（分屬兩個檔，兩邊都要改）", () => {
    expect(E.NHI_SUPP_WAGE_MIN).toBe(E.NHI_SALARY_MIN);
    expect(w.NHI_SUPP_WAGE_MIN).toBe(w.NHI_SALARY_MIN);
  });

  it("一般保費公式與進位順序兩邊逐字一致", () => {
    expect(HTML).toContain(" var perUnit=(raw>0)?Math.round(salary*NHI_RATE*(r/100)):0;");
    expect(HTML).toContain(" var monthly=perUnit*(1+depsCounted);");
    expect(HTML).toContain(" var depsCounted=Math.min(deps,NHI_DEP_CAP);");
  });

  it("補充保費：六類白名單與計費基礎兩邊逐字一致（薪資不在名單裡＝不重複扣）", () => {
    expect(HTML).toContain("{key:'bonus',label:'高額獎金',mode:'excess',subs:['年終獎金','三節獎金','績效/季獎金','佣金/業績獎金','股票/員工分紅']},");
    expect(HTML).toContain("function nhiPayTimes(x){return (x&&x.period==='月')?12:1;}");
    expect(HTML).toContain("function nhiSuppMinOf(k){return (k&&k.key==='parttime')?NHI_SUPP_WAGE_MIN:NHI_SUPP_MIN;}");
    expect(w.NHI_SUPP_KINDS.map((k: { key: string }) => k.key))
      .toEqual(E.NHI_SUPP_KINDS.map((k: { key: string }) => k.key));
    for (let i = 0; i < E.NHI_SUPP_KINDS.length; i++) {
      expect(w.NHI_SUPP_KINDS[i].subs).toEqual(E.NHI_SUPP_KINDS[i].subs);
      expect(w.NHI_SUPP_KINDS[i].mode).toBe(E.NHI_SUPP_KINDS[i].mode);
    }
  });

  it("同一份個案：一般保費／補充保費／全家合計，兩邊一位不差", () => {
    const c = E.sampleCase();
    c.members[0].nhiCat = "第一類 受雇者";
    c.members[0].nhiSalary = 53_000;
    c.members[0].nhiDeps = 5;                       // 眷口上限要在兩邊都生效
    c.members[1].nhiCat = "第一類 雇主/自營業主/專技自行執業";
    c.members[1].nhiSalary = 57_800;
    c.members[1].nhiDeps = 1;
    c.incomes.push(
      { owner: "王大明", type: "工作", subType: "年終獎金", period: "年", amount: 400_000 },
      { owner: "王大明", type: "理財", subType: "租金收入", period: "月", amount: 360_000 },
      { owner: "王太太", type: "理財", subType: "股利/利息", period: "年", amount: 19_999 },
      { owner: "王大明", type: "工作", subType: "薪資", period: "年", amount: 1_200_000 },
    );
    const j = () => JSON.parse(JSON.stringify(c));
    expect(w.nhiFamily(j()).generalAnnual).toBe(E.nhiFamily(c).generalAnnual);
    expect(w.nhiFamily(j()).suppAnnual).toBe(E.nhiFamily(c).suppAnnual);
    expect(w.nhiFamily(j()).annual).toBe(E.nhiFamily(c).annual);
    // 王大明 53,000 × 5.17% × 30% ＝ 822/口，眷屬 5 口被上限壓成 3 口 → 4 口 ＝ 3,288/月；
    // 王太太（雇主）57,800 × 5.17% × 100% ＝ 2,988/口 × 2 口 ＝ 5,976/月；王小寶沒填 → 0。
    expect(E.nhiFamily(c).generalAnnual).toBe((3_288 + 5_976) * 12);
    // 補充保費：獎金 400,000 − 53,000×4 ＝ 188,000／租金月 30,000 × 12 全額 360,000／
    // 股利 19,999 未達門檻 0／薪資 1,200,000 不重複扣。
    expect(E.nhiFamily(c).suppAnnual).toBe(Math.round(188_000 * 0.0211) + Math.round(360_000 * 0.0211));
  });

  it("syncNHI()：兩邊產生的支出列一模一樣（金額／起訖／標記）", () => {
    const c = E.sampleCase();
    c.members[0].nhiCat = "第一類 受雇者";
    c.members[0].nhiSalary = 45_800;
    c.members[0].nhiDeps = 2;
    const a = JSON.parse(JSON.stringify(c));
    const b = JSON.parse(JSON.stringify(c));
    E.syncNHI(a); w.syncNHI(b);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pick = (x: any) => x.expenses.filter((e: { nhiAuto?: boolean }) => e.nhiAuto);
    expect(pick(a).length).toBe(1);
    expect(pick(b)).toEqual(pick(a));
    expect(HTML).toContain("var NHI_AUTO_NAME='全民健康保險（系統試算）';");
  });

  it("產險骨幹（PKINDS／PPOLICY_MAP／PNEED_FIELD）兩邊一致，且與 KINDS 不交集", () => {
    expect(w.PKINDS).toEqual(E.PKINDS);
    expect(w.PGROUPS).toEqual(E.PGROUPS);
    expect(w.PKIND_GROUP).toEqual(E.PKIND_GROUP);
    expect(w.PPOLICY_MAP).toEqual(E.PPOLICY_MAP);
    expect(w.PNEED_FIELD).toEqual(E.PNEED_FIELD);
    for (const k of E.PKINDS) expect(w.KINDS).not.toContain(k);
  });

  it("同一份個案：產險比對表與缺口總額兩邊一位不差", () => {
    const c = E.sampleCase();
    c.propNeed = { ping: 45, pingPrice: 82_000 };
    c.companies = [{ cid: "co1", name: "甲公司", employees: 12 }];
    c.assets.push({
      name: "自用車", owner: "王大明", mainCat: "自用資產", type: "自用車輛", cls: "固定",
      currency: "台幣", fxRate: 1, cost: 900_000, value: 700_000, ret: 0, income: 0, movable: false,
    });
    c.policies.push(
      { insured: "王大明", name: "住宅火險", bigCat: "產物", subtype: "住宅火險", status: "有效", premium: 4000, pAmount: 3_000_000 },
      { insured: "王大明", name: "第三人責任", bigCat: "產物", subtype: "汽車第三人責任", status: "有效", premium: 6000, pBodily: 2_000_000, pProperty: 300_000 },
      { insured: "王大明", name: "雇主責任", bigCat: "產物", subtype: "雇主責任", status: "有效", premium: 9000, pBodily: 1_000_000 },
    );
    const j = () => JSON.parse(JSON.stringify(c));
    expect(w.propGaps(j())).toEqual(E.propGaps(c));
    expect(w.propGapTotals(j())).toEqual(E.propGapTotals(c));
    expect(E.propGapTotals(c).rows).toBeGreaterThan(0);
  });

  it("⚠️ 產險缺口不進人身險：兩邊的 gapTotals／health 都不受產險影響", () => {
    const c = E.sampleCase();
    const j = () => JSON.parse(JSON.stringify(c));
    const before = { e: E.gapTotals(c), h: E.health(c).safety, we: w.gapTotals(j()), wh: w.health(j()).safety };
    c.propNeed = { ping: 60 };
    c.policies.push({ insured: "王大明", name: "住宅火險", bigCat: "產物", subtype: "住宅火險", status: "有效", premium: 4000, pAmount: 8_000_000 });
    expect(E.gapTotals(c)).toEqual(before.e);
    expect(E.health(c).safety).toBe(before.h);
    expect(w.gapTotals(j())).toEqual(before.we);
    expect(w.health(j()).safety).toBe(before.wh);
  });
});
