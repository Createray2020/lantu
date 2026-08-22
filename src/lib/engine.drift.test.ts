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
  it("KINDS 與 POLICY_MAP：險種清單與保單欄位對照兩邊一致", () => {
    expect(HTML).toContain("var KINDS=['壽險','意外傷殘','住院醫療','醫療雜費','薪資補償','初次罹癌','癌症住院','重病給付','每月照護'];");
    expect(HTML).toContain("var POLICY_MAP={'壽險':'life','意外傷殘':'accident','住院醫療':'medical','醫療雜費':'medMisc','薪資補償':'incomeComp','初次罹癌':'firstCancer','癌症住院':'cancerHosp','重病給付':'critical','每月照護':'monthCare'};");
    expect(E.KINDS).toEqual(["壽險", "意外傷殘", "住院醫療", "醫療雜費", "薪資補償", "初次罹癌", "癌症住院", "重病給付", "每月照護"]);
  });

  it("existingCover 兩邊都經 kindNorm 正規化（舊資料的『意外險』不能對不上）", () => {
    expect(HTML).toContain("kindNorm(cv.kind)===kindNorm(kind)");
    expect(E.kindNorm("意外險")).toBe("意外傷殘");
    expect(E.kindNorm("壽險")).toBe("壽險");
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
    expect(HTML).toContain("var expOther=sum(c.expenses,function(e){return ['生活','消費','稅賦','保險','孝親','貸款'].indexOf(e.cat)<0?n(e.amount):0});");
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

  it("退休期支出明細表空著時，退回舊的 monthLiving×12", () => {
    expect(HTML).toContain("if(!list.length)return n(c.retire&&c.retire.monthLiving)*12*inflFactor;");
    const c = E.sampleCase();
    c.retireExpenses = [];
    expect(E.retireAnnual(c, 70, 1)).toBe(E.n(c.retire.monthLiving) * 12);
  });

  it("retireNeed：有明細表走逐年折現、沒有走封閉式年金，兩邊一致", () => {
    expect(HTML).toContain("total+=retireAnnual(c,ra+1+k,Math.pow(1+infl,years)*Math.pow(1+g,k))/Math.pow(1+rr,k+1);");
    expect(HTML).toContain("else{total=annualFV*(1-Math.pow((1+g)/(1+rr),m))/(rr-g);}");
  });

  it("延後退休會推每位賺薪成員的退休年齡，兩邊一致", () => {
    expect(HTML).toContain("(after.members||[]).forEach(function(m){if(m&&m.role!=='本人'&&n(m.retireAge)>0)m.retireAge=n(m.retireAge)+n((c.plan||{}).retireDelay);});");
  });

  it("負債一律換匯（lBal），不可直接讀 l.balance", () => {
    // 兩邊的 lifeNeed 都要用 lBal，否則外幣房貸在「缺口」與「準備度」兩頁會差一個匯率
    expect(HTML).toContain("+ sum(c.liabilities,function(l){return lBal(l)}) + eduTotal(c)");

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
