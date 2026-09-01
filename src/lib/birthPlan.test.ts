import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { BIRTH_COST_DEFAULTS, INFANT_CARE_YEARS } from "./birthCosts.defaults";
import { defaultBirthCosts, saveBirthCost } from "./birthCosts";

const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 生育規劃：把「還沒出生的小孩」變成可以試算的東西（2026/08/26）。
 *
 * 在這之前，客戶說「我打算三年後生」，系統只有一條路：教育金的手動列，
 * 每一個學段的「幾年後開始」要教練自己心算，官方學雜費吃不到，
 * 生產與月子沒有地方放，0–2 歲育兒費更是完全的真空（教育費用最早的一段是幼兒園，3 歲）。
 *
 * 這一組測試守的是三件事：
 *  1. 未出生子女走**負歲數**，整條就學時間軸往後推，年數不變。
 *  2. 三種產物落在三個正確的地方（成員／目標／支出）——尤其一次性費用**不能**進 education，
 *     那張表會被 annual × years 乘開，金額直接爆掉好幾倍。
 *  3. 重按「產生／更新」是更新不是複製，而且被手動改過的金額不會被蓋掉。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
});

beforeEach(() => {
  const c = w.migrateCase(w.newCase());
  c.profile.age = 40;
  c.members = [{ name: "本人", role: "本人", gender: "男", age: 40, expRatio: 100, indepAge: "" }];
  c.education = [];
  c.goals = [];
  c.expenses = [];
  c.birthPlan = [];
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.ensureMemberIds(c);
});

const C = () => w.activeCase();
const autoEdu = () => (C().education || []).filter((e: { auto?: boolean }) => e.auto === true);

describe("生育費用參數雙實作對拍", () => {
  it("BIRTH_COST_FALLBACK 與 birthCosts.defaults.ts 完全一致", () => {
    const m = /var BIRTH_COST_FALLBACK=(\{[\s\S]*?\n\});/.exec(HTML);
    expect(m, "lantu-app.html 找不到 BIRTH_COST_FALLBACK").toBeTruthy();
    const html = JSON.parse(m![1]) as Record<string, number>;
    const ts: Record<string, number> = {};
    for (const s of BIRTH_COST_DEFAULTS) ts[s.key] = s.amount;
    expect(html).toEqual(ts);
  });

  it("0–2 歲的年數兩邊一致（幼兒園 3 歲開始，所以是 3 年）", () => {
    const m = /var INFANT_CARE_YEARS=(\d+);/.exec(HTML);
    expect(Number(m![1])).toBe(INFANT_CARE_YEARS);
    expect(INFANT_CARE_YEARS).toBe(3);
  });

  it("每一筆預設值都帶著來歷（數字不能來歷不明）", () => {
    for (const r of defaultBirthCosts()) expect(r.note, r.key).toBeTruthy();
  });

  it("只認得內建清單裡的 key，不開放新增", async () => {
    await expect(saveBirthCost({ key: "NOT_A_KEY", amount: 1 })).rejects.toThrow("unknown-key");
  });
});

describe("未出生子女：負歲數把整條就學時間軸往後推", () => {
  it("本人 40 歲、預計 43 歲生 → 這孩子現在是 -3 歲", () => {
    w.addEduChild(1);
    const m = C().members[1];
    m.bornAt = 43;
    expect(w.eduChildAge(m, C())).toBe(-3);
    expect(w.eduDueIn(m, C())).toBe(3);
  });

  it("幼兒園在 6 年後開始（3 年後出生 ＋ 3 歲入學），不是 3 年後", () => {
    w.addEduChild(1);
    const m = C().members[1];
    m.bornAt = 43;
    w.syncEduChild(C(), m);
    const kg = autoEdu().find((e: { stage: string }) => e.stage === "幼兒園");
    expect(kg).toBeTruthy();
    expect(kg.startIn).toBe(6);
    expect(kg.years).toBe(3);
  });

  it("沒填「本人幾歲時生」之前，不會憑空生出教育金需求", () => {
    w.addEduChild(1);
    const m = C().members[1];
    m.bornAt = "";
    w.syncEduChild(C(), m);
    expect(autoEdu()).toHaveLength(0);
    expect(w.eduTotal(C())).toBe(0);
  });

  it("未出生成員的 age 一律留空——負歲數只活在 eduChildAge 裡", () => {
    w.addEduChild(1);
    const m = C().members[1];
    expect(m.unborn).toBe(true);
    expect(m.age).toBe("");
    // 讀 n(m.age) 的地方（族譜、扶養比、保障需求）看到的必須是「沒有年齡」，不是負數
    expect(w.n(m.age)).toBe(0);
  });

  it("本人年齡改了，未出生子女的「幾年後」自我校正（存的是絕對歲數）", () => {
    w.addEduChild(1);
    const m = C().members[1];
    m.bornAt = 43;
    expect(w.eduDueIn(m, C())).toBe(3);
    C().profile.age = 42;                 // 隔兩年再談
    expect(w.eduDueIn(m, C())).toBe(1);
  });

  it("切回「已出生」會把預計出生歲數清乾淨（不會留下沒人記得填過的值）", () => {
    w.addEduChild(1);
    C().members[1].bornAt = 43;
    w.setUnborn(1, false);
    expect(C().members[1].unborn).toBe(false);
    expect(C().members[1].bornAt).toBe("");
  });
});

describe("applyBirthPlan：三種產物落在三個地方", () => {
  const plan = (atAge: number) => {
    w.addBirthKid();
    const k = C().birthPlan[C().birthPlan.length - 1];
    k.atAge = atAge;
    return k;
  };

  it("① 家庭：每一胎一位未出生子女，教育金整套自動長出來", () => {
    plan(43);
    w.applyBirthPlan(true);
    const kids = C().members.filter((m: { unborn?: boolean }) => m.unborn);
    expect(kids).toHaveLength(1);
    expect(kids[0].bornAt).toBe(43);
    expect(kids[0].role).toBe("子女");
    expect(autoEdu().length).toBeGreaterThan(0);
    expect(w.eduTotal(C())).toBeGreaterThan(0);
  });

  it("② 目標：生產與月子是一次性，start===end，且**不在** education 裡", () => {
    plan(43);
    w.applyBirthPlan(true);
    const g = C().goals.find((x: { type: string }) => x.type === "生育");
    expect(g).toBeTruthy();
    expect(g.start).toBe(43);
    expect(g.end).toBe(43);
    expect(g.freq).toBe(0);
    // 一次性費用混進 education 會被 annual × years 乘開——這一條就是那個坑的守門員
    expect(C().education.some((e: { auto?: boolean }) => e.auto !== true)).toBe(false);
  });

  // 2026/09/01 起項目從 7 項補到 14 項（Ray：「相關費用還不夠完整資訊」），
  // 組成改由 BIRTH_ITEMS 的 when 決定，所以斷言改成「該算的都算了、不該算的一項都沒有」。
  const cost = (key: string) => BIRTH_COST_DEFAULTS.find((x) => x.key === key)!.amount;
  const ALWAYS = ["PRENATAL_VISIT_FEE", "PRENATAL_SELF", "MATERNITY_KIT", "POSTPARTUM_RECOVERY",
    "NEWBORN_GEAR", "NEWBORN_SCREEN", "INFANT_VACCINE", "BREASTFEED_GEAR"];
  const alwaysSum = () => ALWAYS.reduce((a, k) => a + cost(k), 0);

  it("② 金額＝一律計的那幾項＋生產方式＋月子安排×月數，剖腹產比自然產貴", () => {
    const k = plan(43);
    k.delivery = "自然產"; k.care = "月子中心"; k.careMonths = 1;
    w.applyBirthPlan(true);
    const natural = C().goals.find((x: { type: string }) => x.type === "生育").present;
    expect(natural).toBe(alwaysSum() + cost("DELIVERY_NATURAL") + cost("POSTPARTUM_CENTER_MONTH"));
    k.delivery = "剖腹產";
    w.applyBirthPlan(true);
    expect(C().goals.find((x: { type: string }) => x.type === "生育").present)
      .toBe(alwaysSum() + cost("DELIVERY_CSECTION") + cost("POSTPARTUM_CENTER_MONTH"));
  });

  it("② 月子月數只乘進「那一種安排」的單價，不會三種都乘", () => {
    const k = plan(43);
    k.delivery = "自然產"; k.care = "到宅月嫂"; k.careMonths = 2;
    w.applyBirthPlan(true);
    expect(C().goals.find((x: { type: string }) => x.type === "生育").present)
      .toBe(alwaysSum() + cost("DELIVERY_NATURAL") + cost("POSTPARTUM_NANNY_MONTH") * 2);
  });

  it("② 月子選「家人照顧」不算月子中心也不算月嫂，只單獨算月子餐", () => {
    const k = plan(43);
    k.care = "家人照顧（不另計）"; k.careMonths = 3;
    w.applyBirthPlan(true);
    expect(C().goals.find((x: { type: string }) => x.type === "生育").present)
      .toBe(alwaysSum() + cost("DELIVERY_NATURAL") + cost("POSTPARTUM_MEAL_MONTH") * 3);
  });

  it("這一份規劃自己填的單價會蓋掉後台，留空就回去跟著後台", () => {
    const k = plan(43);
    k.delivery = "自然產"; k.care = "月子中心"; k.careMonths = 1;
    w.applyBirthPlan(true);
    const before = C().goals.find((x: { type: string }) => x.type === "生育").present;
    w.setBirthCostOverride("POSTPARTUM_CENTER_MONTH", 260000);
    expect(w.birthOneOffCost(C().birthPlan[0], C()))
      .toBe(before - cost("POSTPARTUM_CENTER_MONTH") + 260_000);
    // ⚠️ 留空＝跟著後台走，不是 0
    w.setBirthCostOverride("POSTPARTUM_CENTER_MONTH", "");
    expect(w.birthOneOffCost(C().birthPlan[0], C())).toBe(before);
    expect(C().birthCostOverride.POSTPARTUM_CENTER_MONTH).toBeUndefined();
  });

  it("③ 支出：0–2 歲育兒費用逐年，共 3 年，補上幼兒園之前的真空", () => {
    plan(43);
    w.applyBirthPlan(true);
    const e = C().expenses.find((x: { birthBid?: string }) => x.birthBid);
    expect(e).toBeTruthy();
    expect(e.cat).toBe("生活");
    expect(e.subCat).toBe("育兒/托育");
    expect(e.period).toBe("年");
    expect(e.start).toBe(43);
    expect(e.end).toBe(43 + INFANT_CARE_YEARS - 1);   // 43、44、45 → 對上 46 歲那年（孩子 3 歲）上幼兒園
    const kg = autoEdu().find((x: { stage: string }) => x.stage === "幼兒園");
    expect(C().profile.age + kg.startIn).toBe(e.end + 1);
  });

  it("目標／置產的類型下拉含「生育」——不含的話這幾列一被打開就會靜靜跳回第一個選項", () => {
    // 2026/08/28：旅遊／休閒／奢侈品整併到生活願望，從這個清單移除。
    expect(HTML).toContain("sel:購屋,置產,購車,婚姻,生育,孝親,職涯轉換,創業,傳承,其他");
  });
});

describe("applyBirthPlan：重按是更新不是複製", () => {
  it("按三次還是一位子女、一列目標、一列支出", () => {
    w.addBirthKid();
    C().birthPlan[0].atAge = 43;
    w.applyBirthPlan(true);
    w.applyBirthPlan(true);
    w.applyBirthPlan(true);
    expect(C().members.filter((m: { unborn?: boolean }) => m.unborn)).toHaveLength(1);
    expect(C().goals.filter((g: { type: string }) => g.type === "生育")).toHaveLength(1);
    expect(C().expenses.filter((e: { birthBid?: string }) => e.birthBid)).toHaveLength(1);
  });

  it("改了年齡再按，成員與兩列費用的時間軸一起跟上", () => {
    w.addBirthKid();
    C().birthPlan[0].atAge = 43;
    w.applyBirthPlan(true);
    C().birthPlan[0].atAge = 45;
    w.applyBirthPlan(true);
    expect(C().members.filter((m: { unborn?: boolean }) => m.unborn)[0].bornAt).toBe(45);
    expect(C().goals.find((g: { type: string }) => g.type === "生育").start).toBe(45);
    expect(C().expenses.find((e: { birthBid?: string }) => e.birthBid).start).toBe(45);
  });

  it("⚠️ 教練手動改過的金額不會被下一次重算蓋掉（起訖歲仍會更新）", () => {
    w.addBirthKid();
    C().birthPlan[0].atAge = 43;
    w.applyBirthPlan(true);
    const g = C().goals.find((x: { type: string }) => x.type === "生育");
    g.present = 999999;                       // 教練照客戶實際情況改過
    C().birthPlan[0].atAge = 46;
    w.applyBirthPlan(true);
    const after = C().goals.find((x: { type: string }) => x.type === "生育");
    expect(after.present).toBe(999999);       // 金額不動
    expect(after.start).toBe(46);             // 但年份跟上
  });

  it("⚠️ 刪掉一胎會把它產生的成員、目標與支出一起收乾淨（不留孤兒列）", () => {
    w.addBirthKid(); C().birthPlan[0].atAge = 43;
    w.addBirthKid(); C().birthPlan[1].atAge = 46;
    w.applyBirthPlan(true);
    expect(C().members.filter((m: { unborn?: boolean }) => m.unborn)).toHaveLength(2);

    C().birthPlan.splice(0, 1);               // 第一胎不生了
    w.applyBirthPlan(true);
    expect(C().members.filter((m: { unborn?: boolean }) => m.unborn)).toHaveLength(1);
    expect(C().goals.filter((g: { type: string }) => g.type === "生育")).toHaveLength(1);
    expect(C().expenses.filter((e: { birthBid?: string }) => e.birthBid)).toHaveLength(1);
    expect(autoEdu().every((e: { mid: string }) =>
      C().members.some((m: { mid: string }) => m.mid === e.mid))).toBe(true);
  });

  it("⚠️ 教練自己填的手動教育金列，一列都不會被碰到", () => {
    C().education.push({ child: "老大", stage: "大學", schoolType: "公立", annual: 200000, years: 4, startIn: 3 });
    w.addBirthKid(); C().birthPlan[0].atAge = 43;
    w.applyBirthPlan(true);
    C().birthPlan.splice(0, 1);
    w.applyBirthPlan(true);
    const manual = C().education.filter((e: { auto?: boolean }) => e.auto !== true);
    expect(manual).toHaveLength(1);
    expect(manual[0].child).toBe("老大");
  });
});

describe("子女的其他準備基金：未出生子女也要換算對", () => {
  it("本人 40、43 歲生的孩子，30 歲結婚 → 本人 73 歲（不是 70）", () => {
    w.addBirthKid();
    C().birthPlan[0].atAge = 43;
    w.applyBirthPlan(true);
    const kid = C().members.filter((m: { unborn?: boolean }) => m.unborn)[0];
    w.addChildFund(kid.name, "結婚基金");
    const g = C().goals.find((x: { name: string }) => x.name === `${kid.name}的結婚基金`);
    expect(g).toBeTruthy();
    expect(g.start).toBe(73);
  });
});
