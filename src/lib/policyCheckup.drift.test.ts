import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import * as E from "./engine";
import { INS_COMPANIES_LIFE, INS_COMPANIES_PROP } from "./insProducts.defaults";

/**
 * 保單檢查報告：兩份實作的對拍。
 *
 * public/lantu-app.html 無法 import src/lib/engine.ts，所以同一套語意各存一份。
 * 這一支跟 engine.drift.test.ts 同樣的作法——把「改了一邊沒改另一邊就會出事」的那幾行
 * 用字串完全比對釘住。不是全檔比對（那會被排版差異弄得永遠是紅的），
 * 只釘語意行：判定式、常數清單、以及那個「預設不含動作」的第二參數。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Eng = E as any;

describe("兩份實作的語意行必須一字不差", () => {
  it("判定帶與理財金三角的預設值", () => {
    for (const line of [
      "var CHECKUP_BAND=10;",
      "var TRIANGLE_RISK=10;",
      "var TRIANGLE_INVEST=30;",
    ]) expect(HTML).toContain(line);
  });

  it("checkupState 的三值判定式", () => {
    expect(HTML).toContain("if(need<=0)return have>0?'high':'mid';");
    expect(HTML).toContain("return r>b?'high':(r<-b?'low':'mid');");
  });

  it("⚠️ 已備的三個來源與順序：已備補充/保單 → 本人的流動資產 → 調整動作的保額", () => {
    // 動作保額接進缺口是 66a4b13 的決定（不接的話，排了保障動作反而看到缺口變大）。
    // 五欄表沿用同一套語意，兩處都要在「流動資產」那一行之後才加。
    const iLiquid = HTML.indexOf("if(k==='壽險'&&nd.member===(primaryMember(c)||{}).name)ex+=liquidMovable(c);");
    const iAct = HTML.indexOf("ex+=actionCover(c,nd.member,k);");
    expect(iLiquid).toBeGreaterThan(-1);
    expect(iAct).toBeGreaterThan(iLiquid);
    expect(HTML).toContain("have+=actionCover(c,nd.member,k);");
  });

  it("保費類型的推導清單與領回型別", () => {
    expect(HTML).toContain("var INVEST_SUBS=['增額/儲蓄壽險','投資型壽險','年金'];");
    expect(HTML).toContain("var PAYBACK_TYPES=['$生存','$滿期','$祝壽','$年金','$投資'];");
    expect(Eng.PAYBACK_TYPES).toEqual(["$生存", "$滿期", "$祝壽", "$年金", "$投資"]);
  });

  it("繳別與給付分組", () => {
    expect(HTML).toContain("var PAY_MODES=['年繳','半年繳','季繳','月繳'];");
    expect(HTML).toContain("var BENEFIT_GROUPS=['壽險','意外','住院醫療','防癌','失能長照','其他'];");
    expect(Eng.PAY_MODES).toEqual(["年繳", "半年繳", "季繳", "月繳"]);
    expect(Eng.BENEFIT_GROUPS).toEqual(["壽險", "意外", "住院醫療", "防癌", "失能長照", "其他"]);
  });

  it("民國年換算：兩邊都用同一條 <1911 的判斷", () => {
    expect(HTML).toContain("function effYear(p){var m=String((p&&p.effDate)||'').match(/(\\d{3,4})/);if(!m)return 0;var y=+m[1];return y<1911?y+1911:y;}");
  });
});

describe("⚠️ 修掉的兩個舊 bug 不能回來", () => {
  it("coverageMatrix 的意外欄：HCOLS 用改名後的『意外傷殘』，且 rdRatio 一定過 kindNorm", () => {
    expect(HTML).toContain("{lb:'意外',kind:'意外傷殘',fields:['accident']");
    expect(HTML).not.toContain("{lb:'意外',kind:'意外險',fields:['accident']");
    expect(HTML).toContain("var o=rd.filter(function(x){return x.member===member&&kindNorm(x.kind)===kk;})[0];");
  });

  it("insure 類動作的保額真的接得回保障缺口（ACT_CATS 的說明不能是空話）", () => {
    expect(HTML).toContain("coverKind:'壽險',member:''");
    expect(HTML).toContain("function actionCover(c,member,kind){");
    // 五欄表與缺口表用的是同一支，不能各自長一個
    expect(HTML.split("function actionCover(c,member,kind){").length - 1).toBe(1);
  });
});

describe("保險商品主檔：html fallback 與程式端 seed 同一份", () => {
  it("人身 20 家、產物 16 家，順序一致", () => {
    const life = INS_COMPANIES_LIFE.join("','");
    const prop = INS_COMPANIES_PROP.join("','");
    expect(HTML).toContain(`'人身':['${life}','國外公司']`);
    expect(HTML).toContain(`'產物':['${prop}','國外公司(產物)']`);
    expect(INS_COMPANIES_LIFE).toHaveLength(20);
    expect(INS_COMPANIES_PROP).toHaveLength(16);
  });

  it("⚠️ 只是輸入輔助：這張表不准出現給付公式／費率欄位", () => {
    const schema = readFileSync(new URL("../Shared/db/schema.ts", import.meta.url), "utf8");
    const block = schema.slice(schema.indexOf("export const insProducts"), schema.indexOf("export const eduCostParams"));
    for (const forbidden of ["premium", "rate", "benefit", "surrender", "cashValue"]) {
      expect(block.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
