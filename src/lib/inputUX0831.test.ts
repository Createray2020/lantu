import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import * as T from "./taiwan";
import { caseBirthDate } from "./birthSync";

/**
 * Ray 2026/08/31 的輸入體驗與資料串接回饋。
 *
 * 這一輪的共同點是「同一件事要做兩次」或「打字打不完」——都不是算錯，
 * 而是坐在客戶旁邊時每一次都要多花幾秒、多解釋一句。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fresh(tab = "family"): any {
  const c = w.migrateCase(w.newCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.dataTab = tab;
  w.render();
  return c;
}

describe("生日只填一次（客戶主檔 ↔ 規劃）", () => {
  it("純函式：只認正常的 YYYY-MM-DD", () => {
    expect(caseBirthDate({ profile: { birth: "1985-03-12" } })).toBe("1985-03-12");
    expect(caseBirthDate({ profile: { birth: " 1985-03-12 " } })).toBe("1985-03-12");
    expect(caseBirthDate({ profile: {} })).toBeNull();
    expect(caseBirthDate({})).toBeNull();
    expect(caseBirthDate(null)).toBeNull();
  });

  it("⚠️ 打字途中的 0001-05-06 不可以被寫進客戶主檔", () => {
    // type=date 三段填滿後，年份每按一個數字都會送出一個「格式正確但荒謬」的值
    expect(caseBirthDate({ profile: { birth: "0001-05-06" } })).toBeNull();
    expect(caseBirthDate({ profile: { birth: "0198-05-06" } })).toBeNull();
    expect(caseBirthDate({ profile: { birth: "1985-13-01" } })).toBeNull();
    expect(caseBirthDate({ profile: { birth: "1985-3-1" } })).toBeNull();
  });

  // ⚠️ lantu:init 的接收端只在 embed 模式註冊（?embed=1），而且比對 e.source===parent，
  //    所以要照 reportCodeUI.test.ts 的作法自己派一個 message 事件。
  async function embed() {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/lantu-app.html?embed=1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const iw = dom.window as any;
    await new Promise((r) => iw.addEventListener("load", r));
    return iw;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function init(iw: any, data: unknown, birthDate: string | null) {
    iw.dispatchEvent(Object.assign(new iw.Event("message"), {
      source: iw.parent, origin: iw.location.origin,
      data: { type: "lantu:init", data, birthDate },
    }));
  }

  it("iframe 收到主檔生日：規劃裡空著就帶入、順便換算年齡", async () => {
    const iw = await embed();
    const base = iw.newCase();
    base.profile.birth = "";
    init(iw, base, "1985-03-12");
    expect(iw.activeCase().profile.birth).toBe("1985-03-12");
    expect(iw.activeCase().profile.age).toBe(iw.ageFromBirth("1985-03-12"));
  });

  it("⚠️ 規劃裡已經有生日就絕不覆蓋（教練改過的最大）", async () => {
    const iw = await embed();
    const base = iw.newCase();
    base.profile.birth = "1990-01-01";
    init(iw, base, "1985-03-12");
    expect(iw.activeCase().profile.birth).toBe("1990-01-01");
  });

  it("主檔沒有生日時什麼都不做（不會塞進一個空字串或 null）", async () => {
    const iw = await embed();
    const base = iw.newCase();
    base.profile.birth = "";
    init(iw, base, null);
    expect(iw.activeCase().profile.birth).toBe("");
  });
});

describe("出生日期：年份四個數字按得完", () => {
  it("改成 oninput 不 render、onblur 才 render", () => {
    expect(HTML).toContain('oninput="setBirthLive(this.value)" onblur="setBirth(this.value)"');
    expect(HTML).toContain('oninput="setMemberBirthLive(\'+idx+\',this.value)" onblur="setMemberBirth(\'+idx+\',this.value)"');
  });

  it("setBirthLive 寫得進去、也算得出年齡，但不重畫整頁", () => {
    const c = fresh();
    const before = w.document.querySelector("#app").innerHTML;
    w.setBirthLive("1985-03-12");
    expect(c.profile.birth).toBe("1985-03-12");
    expect(c.profile.age).toBe(w.ageFromBirth("1985-03-12"));
    expect(w.document.querySelector("#app").innerHTML, "不可以重畫——重畫就把游標踢掉了").toBe(before);
  });

  it("年齡欄跟著鏡射（不 render 也看得到）", () => {
    fresh();
    const el = w.document.querySelector('[data-ageof="self"]');
    expect(el, "本人的年齡欄要掛得到鏡射錨點").toBeTruthy();
    w.setBirthLive("1985-03-12");
    expect(Number(el.value)).toBe(w.ageFromBirth("1985-03-12"));
  });
});

describe("數字欄位聚焦即全選（不用先刪那個 0）", () => {
  it("金額欄與 type=number 都吃得到", async () => {
    fresh("finance");
    const el = w.document.querySelector("input.amtin");
    expect(el, "收支資債頁要有金額欄").toBeTruthy();
    el.value = "0";
    el.focus();
    await new Promise((r) => setTimeout(r, 5));
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe(1);
  });

  it("文字欄不會被全選（打字接續才是對的）", async () => {
    fresh("family");
    const el = [...w.document.querySelectorAll("#app input")]
      .find((x: HTMLInputElement) => x.type === "text" && !x.classList.contains("amtin")) as HTMLInputElement;
    expect(el).toBeTruthy();
    el.value = "王大明";
    el.setSelectionRange(3, 3);
    el.focus();
    await new Promise((r) => setTimeout(r, 5));
    expect(el.selectionStart).toBe(3);
  });
});

describe("健保月投保薪資：旁邊要有級距表", () => {
  it("58 級全在，頭尾對得上既有的上下限常數", () => {
    expect(T.NHI_SALARY_TABLE.length).toBe(T.NHI_SALARY_GRADES);
    expect(T.NHI_SALARY_TABLE[0]).toBe(T.NHI_SALARY_MIN);
    expect(T.NHI_SALARY_TABLE.at(-1)).toBe(T.NHI_SALARY_MAX);
  });

  it("嚴格遞增（分級表不可能有兩級同額或倒退）", () => {
    for (let i = 1; i < T.NHI_SALARY_TABLE.length; i++) {
      expect(T.NHI_SALARY_TABLE[i], `第 ${i + 1} 級`).toBeGreaterThan(T.NHI_SALARY_TABLE[i - 1]);
    }
  });

  it("⚠️ 這張表不是勞保投保薪資分級表（上限 45,800）", () => {
    expect(T.NHI_SALARY_TABLE.at(-1)).toBeGreaterThan(T.LABOR_INS_GRADES.at(-1)!);
    // 45,800 在健保表裡只是第 11 級，不是天花板
    expect(T.NHI_SALARY_TABLE.indexOf(45_800)).toBe(10);
  });

  it("html 鏡像逐字對得上（改一邊沒改另一邊這條會紅）", () => {
    expect(w.NHI_SALARY_TABLE).toEqual(T.NHI_SALARY_TABLE);
  });

  it("成員卡上真的有下拉與可展開的對照表", () => {
    fresh("family");
    const h = w.document.querySelector("#app").innerHTML as string;
    expect(h).toContain("健保月投保薪資（選級距）");
    expect(h).toContain("健保投保金額分級表");
    expect(h).toContain("投保金額分級表");
  });

  it("選了級距就寫進去", () => {
    const c = fresh("family");
    w.setNhiGrade(0, "60800");
    expect(c.members[0].nhiSalary).toBe(60_800);
  });

  it("目前這一級會被標出來（教練指得到）", () => {
    expect(w.nhiBandBox(60_800)).toContain("目前這一級");
  });
});

describe("投資經驗的「其他」可以自己打，而且可以有第二個", () => {
  it("沒勾「其他」時不出現輸入框", () => {
    expect(w.chipsOther("investExp", { investExp: ["股票"] })).toBe("");
  });

  it("勾了就有一格，按一下再加一格", () => {
    const c = fresh("intent");
    c.intent.investExp = ["股票", "其他"];
    expect(w.chipsOther("investExp", c.intent)).toContain("其他 1");
    w.addChipOther("investExp");
    expect(w.activeCase().intent.investExpOther.length).toBe(2);
    expect(w.chipsOther("investExp", w.activeCase().intent)).toContain("其他 2");
  });

  it("打進去存得住、刪得掉", () => {
    const c = fresh("intent");
    c.intent.investExp = ["其他"];
    w.setChipOther("investExp", 0, "私募基金");
    w.setChipOther("investExp", 1, "藝術品");
    expect(w.activeCase().intent.investExpOther).toEqual(["私募基金", "藝術品"]);
    w.delChipOther("investExp", 0);
    expect(w.activeCase().intent.investExpOther).toEqual(["藝術品"]);
  });
});

describe("風險屬性測驗：題幹不再預設「現在就要投資」", () => {
  it("五道題的前提都改掉了", () => {
    const qs = w.RISK_Q.map((q: { q: string }) => q.q).join("\n");
    expect(qs).not.toContain("這筆可投資資金");
    expect(qs).not.toContain("您這筆資金主要的投資目的");
    expect(qs).not.toContain("您預計這筆資金可以不動用多久");
    expect(qs).toContain("如果要做長期配置");
    expect(qs).toContain("假設您持有的部位");
  });

  it("測驗開頭講明這是假設情境", () => {
    expect(HTML).toContain("不預設客戶現在就要投入一筆錢");
  });

  it("⚠️⚠️ 選項與配分一個字都沒動——既有客戶的分數與等級完全不變", () => {
    expect(w.RISK_Q.length).toBe(12);
    const shape = w.RISK_Q.map((q: { o: [string, number][] }) => q.o.map((o) => o[0] + ":" + o[1]).join("|")).join("\n");
    expect(shape).toContain("80%以上（幾乎是全部）:1|約60–80%:2|約40–60%:3|約20–40%:4|20%以下（僅一小部分）:5");
    expect(shape).toContain("保本，絕不能虧損:1");
    expect(shape).toContain("立刻全部贖回、不再投資:1");
    expect(shape).toContain("不能接受任何虧損:1");
    // 滿分仍然是 60（12 題 × 最高 5 分）
    const max = w.RISK_Q.reduce((s: number, q: { o: [string, number][] }) =>
      s + Math.max(...q.o.map((o) => o[1])), 0);
    expect(max).toBe(60);
  });

  it("同一份作答，分數與等級跟改題幹前一模一樣", () => {
    const c = fresh("risk");
    // 每題都選第 3 個選項（3 分）→ 36 分
    c.riskQuiz = { ans: {} };
    for (let i = 0; i < 12; i++) c.riskQuiz.ans[i] = [2];
    expect(w.riskScore(c).score).toBe(36);
    expect(w.riskProfile(c).tier.name).toBeTruthy();
  });
});

describe("文案兩處", () => {
  it("勞退新制標成 6%（教練不用再解釋那是什麼）", () => {
    expect(HTML).toContain("勞退新制（6%）提繳起始年月");
    expect(HTML).toContain("勞退新制（6%）專戶現有累積");
  });

  it("註記三分類有看得見的說明（不是只有 title 提示）", () => {
    expect(HTML).toContain("<b>依據</b>＝這個數字／假設從哪來");
    expect(HTML).toContain("<b>決定</b>＝談完拍板怎麼做");
    expect(HTML).toContain("會進客戶的待辦清單");
  });
});

describe("企業主身分只在一個地方設定", () => {
  it("公司概況有「負責人（家庭成員）」", () => {
    const c = w.migrateCase(w.newCase());
    c.companies = [w.newCompany()];
    c.intent.entities = { company: true };
    w.app.cases = [c]; w.app.activeId = c.id; w.app.dataTab = "company"; w.render();
    expect(w.document.querySelector("#app").innerHTML).toContain("負責人（家庭成員）");
  });

  it("設了負責人 → 那位成員的工作類別自動變成企業主", () => {
    const c = w.migrateCase(w.newCase());
    c.companies = [w.newCompany()];
    c.intent.entities = { company: true };
    w.app.cases = [c]; w.app.activeId = c.id; w.app.dataTab = "company"; w.render();
    expect(c.profile.jobType).toBe("一般就業者");
    w.setCoOwner(w.primaryName(c));
    expect(w.activeCase().profile.jobType).toBe("企業主");
  });

  it("⚠️ 健保自付比率會跟著身分走——這正是對不上時的代價（30% vs 100%）", () => {
    expect(w.nhiSelfRatio(w.nhiJobCat("一般就業者"))).toBe(30);
    expect(w.nhiSelfRatio(w.nhiJobCat("企業主"))).toBe(100);
  });

  it("一鍵修正把身分補起來，警示就消失", () => {
    const c = w.migrateCase(w.newCase());
    c.companies = [w.newCompany()];
    c.intent.entities = { company: true };
    c.profile.jobType = "一般就業者";
    c.companies[0].owner = "";
    w.app.cases = [c]; w.app.activeId = c.id; w.app.dataTab = "family"; w.render();
    expect(w.bizOwnerIssue(w.activeCase())).toBeTruthy();
    w.fixBizOwner();
    expect(w.bizOwnerIssue(w.activeCase())).toBeNull();
    expect(w.activeCase().companies[0].owner).toBe(w.primaryName(w.activeCase()));
  });
});
