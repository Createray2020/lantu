import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 購屋「這一間房」規格卡（2026/09/27 Ray：購屋不是一個總價，是地區×規格；中古／新成屋／預售不同）。
 * 釘住：卡在購屋群；規格→估值自動回填理想與最低；教練手改總價＝手填不再覆蓋、一鍵回估值；
 *       中古才問屋齡；後台 payload（window.LANTU_HOUSE）進來就蓋過起手值；輸入框不在 data-calc 裡。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  w.app.role = "coach"; w.app.activeTab = "data";
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fresh(): any {
  const c = w.migrateCase(w.newCase());
  w.app.cases = [c]; w.app.activeId = c.id; w.app.dataTab = "goals";
  w.addGoalInGroup("house");
  w.GOAL_SEL = "house"; w.GOAL_SEL_ID = c.id;
  w.render();
  return c;
}
const $ = (s: string) => w.document.querySelector(s);
const text = () => $("#app").textContent as string;

describe("這一間房", () => {
  it("購屋群有規格卡；縣市 22 個；輸入框不在 data-calc 裡", () => {
    fresh();
    expect(text()).toContain("這一間房");
    const sec = $('[data-goalanchor-detail="house-spec"]');
    expect(sec).toBeTruthy();
    const citySel = [...sec.querySelectorAll("select")].find((el: HTMLSelectElement) => el.querySelectorAll("option").length === 23);
    expect(citySel, "縣市下拉＝空白＋22 縣市").toBeTruthy();
    expect([...sec.querySelectorAll("input,select")].every((el: Element) => !el.closest("[data-calc]"))).toBe(true);
    expect(text()).toContain("先選縣市");
  });

  it("規格 → 估值自動回填理想與最低；最低標準預設帶問卷起手（電梯大樓 3 房 30 坪）", () => {
    const c = fresh(); const i = c.goals.length - 1;
    w.setHouseSpec(i, "ideal", "city", "新北市");
    w.setHouseSpec(i, "ideal", "district", "板橋區");
    w.setHouseSpec(i, "ideal", "ping", 35);
    w.setHouseSpec(i, "ideal", "parking", 1);
    // 新北新成屋 55 萬/坪 × 35 ＋ 車位 200 萬
    expect(c.goals[i].present).toBe(55 * 35 * 10000 + 2_000_000);
    expect(c.goals[i].minPresent).toBe(55 * 30 * 10000);
    expect(c.goals[i].loanRatio).toBe(80);
    expect(c.goals[i].loanYears).toBe(30);
    expect($('[data-calc="houseEst:' + i + '"]').textContent).toContain("縣市價");
    // 換行政區清空（規格卡改縣市會清行政區）
    w.setHouseSpec(i, "ideal", "city", "台北市");
    expect(c.goals[i].spec.district).toBe("");
    expect(c.goals[i].present).toBe(95 * 35 * 10000 + 3_000_000);
  });

  it("教練手改總價＝手填：規格再變也不覆蓋；「用估值」一鍵回來", () => {
    const c = fresh(); const i = c.goals.length - 1;
    w.setHouseSpec(i, "ideal", "city", "桃園市"); w.setHouseSpec(i, "ideal", "ping", 30);
    const est = c.goals[i].present;
    w.set("goals:" + i, "present", "15000000", "num");
    expect(c.goals[i].priceManual).toBe(true);
    w.setHouseSpec(i, "ideal", "ping", 40);
    expect(c.goals[i].present).toBe(15_000_000);
    w.render();
    expect($('[data-calc="houseEst:' + i + '"]').textContent).toContain("目前手填");
    w.houseUseEstimate(i, "ideal");
    expect(c.goals[i].priceManual).toBe(false);
    expect(c.goals[i].present).toBe(36 * 40 * 10000);
    expect(c.goals[i].present).not.toBe(est);
  });

  it("屋況：中古才問屋齡；屋齡帶倍率進估值", () => {
    const c = fresh(); const i = c.goals.length - 1;
    w.setHouseSpec(i, "ideal", "city", "台中市"); w.setHouseSpec(i, "ideal", "ping", 30);
    expect(text()).not.toContain("屋齡（年）");
    w.setHouseSpec(i, "ideal", "condition", "中古");
    expect(text()).toContain("屋齡（年）");
    const p1 = c.goals[i].present;   // 42×0.72＝30.24 萬 × 30
    expect(p1).toBe(Math.round(42 * 0.72 * 10) / 10 * 30 * 10000);
    w.setHouseSpec(i, "ideal", "age", 20);
    expect(c.goals[i].present).toBe(Math.round(30.2 * 0.8 * 30 * 10000));
  });

  it("後台 payload 進來就蓋過起手值（行政區價優先）", () => {
    const c = fresh(); const i = c.goals.length - 1;
    w.LANTU_HOUSE = { prices: [
      { city: "新北市", district: "", condition: "新成屋", unitPrice: 60, parkingPrice: 210, source: "x", basis: "2026-10" },
      { city: "新北市", district: "板橋區", condition: "新成屋", unitPrice: 70, parkingPrice: 0, source: "x", basis: "2026-10" },
    ], settings: { typeRatio: { "電梯大樓": 1 }, ageRatio: [[5, 1], [null, 0.6]], pay: { "新成屋": { loanRatio: 70 } } }, basis: "2026-10" };
    w.setHouseSpec(i, "ideal", "city", "新北市"); w.setHouseSpec(i, "ideal", "district", "板橋區"); w.setHouseSpec(i, "ideal", "ping", 30); w.setHouseSpec(i, "ideal", "parking", 1);
    expect(c.goals[i].present).toBe(70 * 30 * 10000 + 210 * 10000);
    expect(c.goals[i].loanRatio).toBe(70);
    expect($('[data-calc="houseEst:' + i + '"]').textContent).toContain("行政區價");
    expect($('[data-calc="houseEst:' + i + '"]').textContent).toContain("2026-10");
    w.LANTU_HOUSE = null;
  });
});
