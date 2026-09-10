import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 手冊／訪談問卷補欄位的漂移測試（2026-09-10）。
 *
 * 這一波補的四個欄位有兩種來源，兩種都要釘住：
 *   ① 訪談問卷問了兩年、系統一直沒收的：最晚實現（婚姻／孝親／旅遊）、現居地。
 *   ② 深度會談手冊 v1.0 相對於問卷新增的：財務決策分工、改變的準備度。
 *
 * ⚠️ 這些欄位一個都不進引擎，所以沒有任何既有測試會保護它們——
 *    UI 被誤刪不會有人發現。這支測試就是那道保護。
 *
 * ⚠️⚠️ 每一個欄位都必須掛在一個「會產生判讀」的衍生區上（CALC 有註冊）。
 *    理由見 params.freeSaving 被移除的那段註解：填得進去卻不影響任何結果的欄位，
 *    留著只會讓教練以為自己在調整什麼。這裡連 CALC 註冊一起釘住。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
const ENGINE = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");

describe("訪談欄位：問卷問了、系統沒收的", () => {
  it("最晚完成歲：目標表有欄位，且與『結束歲』分開（兩者語意不同）", () => {
    expect(HTML).toContain("['latest','最晚完成歲','num']");
    expect(HTML).toContain("['end','結束歲','num'],['latest','最晚完成歲','num']");
  });

  it("最晚結婚年齡：婚姻規劃有欄位，接在理想結婚年齡之後", () => {
    expect(HTML).toContain("ofld('marriage','age','理想結婚年齡','num')+ofld('marriage','latestAge','最晚結婚年齡','num')");
  });

  it("最晚起始歲：旅遊表有欄位", () => {
    expect(HTML).toContain("['latest','最晚起始歲','num']");
  });

  it("現居地：本人身分資料有欄位（問卷 C 段本人與另一半各問一次）", () => {
    expect(HTML).toContain("'現居地',p.residence");
  });
});

describe("訪談欄位：手冊相對於問卷新增的", () => {
  it("財務決策分工：六個面向的常數與逐成員的複選", () => {
    expect(HTML).toContain("var DECIDE_AREAS=['日常支出','儲蓄與投資','貸款與大額支出','保險','孝親與子女','報稅與文件']");
    expect(HTML).toContain("function toggleDecide(idx,area,on){");
    expect(HTML).toContain("\\'jointConfirm\\',this.checked)");
  });

  it("改變的準備度：意願與信心兩欄分開（缺哪一邊決定之後要給方案還是給動機）", () => {
    expect(HTML).toContain("ofld('moneyStyle','willing','改變意願 0–10','num')");
    expect(HTML).toContain("ofld('moneyStyle','confidence','改變信心 0–10','num')");
  });

  it("⚠️ 過往理財經驗不另開欄位：成員卡片的 BG_FIELDS.finExp 已經是它", () => {
    expect(HTML).toContain("['finExp','過去的理財經驗'");
    expect(HTML).not.toContain("'pastExp'");
  });

  it("⚠️ 最高學歷不另開欄位：BG_FIELDS.edu 已經是它", () => {
    expect(HTML).toContain("['edu','學經歷','最高學歷、就讀學校科系、重要證照']");
  });
});

describe("第二批：手冊剩下的功能欄位", () => {
  it("規劃單位（個人／家庭）＋為什麼", () => {
    expect(HTML).toContain("ofld('planScope','unit','規劃單位','sel:未指定,個人,家庭')");
    expect(HTML).toContain("ofld('planScope','why','為什麼是這個範圍')");
  });

  it("傳承：理想與最低雙檔＋四項法律安排", () => {
    expect(HTML).toContain("ofld('legacy','perHeirCash','每人現金傳承(理想)','money')");
    expect(HTML).toContain("ofld('legacy','perHeirMin','每人現金傳承(最低)','money')");
    for (const k of ["will", "trust", "beneficiaryDone", "guardian"]) {
      expect(HTML).toContain("ofld('legacy','" + k + "'");
    }
  });

  it("短期資金需求：新陣列要同時進 CASE_ARRAYS 與兩份 newCase 的清空清單", () => {
    expect(HTML).toContain("var CASE_ARRAYS=['members','birthPlan','actions','shortTerm',");
    expect(HTML).toContain("['birthPlan','actions','shortTerm','incomes',");
    expect(ENGINE).toContain("['shortTerm','incomes',");
  });

  it("保障預算：金額欄＋最優先複選", () => {
    expect(HTML).toContain("ofld('coverPlan','monthly','每月可接受保障預算','money')");
    expect(HTML).toContain("function toggleCoverFirst(k){");
    expect(HTML).toContain("chips('coverFirst',KINDS,cp.first,'toggleCoverFirst')");
  });

  it("⚠️ 產險不另做保單表：保單表早就吃得下產險（bigCat／17 種細分／到期日）", () => {
    expect(HTML).toContain("'產物':['汽車強制','汽車第三人責任'");
    expect(HTML).toContain("bigCat:'人身'");
    expect(HTML).toContain("termEnd:''");
    expect(HTML).toContain("function propInsSec(c){");
  });
});

describe("⚠️ 四個欄位都要產生判讀，不能是死欄位", () => {
  it("三個衍生函式都存在", () => {
    expect(HTML).toContain("function readinessHint(c){");
    expect(HTML).toContain("function decisionHint(c){");
    expect(HTML).toContain("function deferHint(c){");
  });

  it("第二批的四個判讀函式也都在 CALC 註冊", () => {
    for (const [key, fn] of [["planScope", "planScopeHint"], ["legacyArrange", "legacyArrangeHint"],
      ["shortTerm", "shortTermHint"], ["coverBudget", "coverBudgetHint"]]) {
      expect(HTML).toContain("function " + fn + "(c){");
      expect(HTML).toContain(key + ":function(c){return " + fn + "(c);}");
      expect(HTML).toContain('data-calc="' + key + '"');
    }
  });

  it("三個都在 CALC 註冊過（沒註冊＝畫面永遠是舊值）", () => {
    expect(HTML).toContain("readiness:function(c){return readinessHint(c);}");
    expect(HTML).toContain("decision:function(c){return decisionHint(c);}");
    expect(HTML).toContain("defer:function(c){return deferHint(c);}");
  });

  it("三個 data-calc 容器都掛在畫面上", () => {
    expect(HTML).toContain('data-calc="readiness"');
    expect(HTML).toContain('data-calc="decision"');
    expect(HTML).toContain('data-calc="defer"');
  });
});
