import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sampleCase, newCase } from "./engine";

/**
 * 「新客戶不可以憑空帶著示範資料」的漂移測試。
 *
 * newCase() 的做法是 **先複製整份 sampleCase()，再把該清的清掉**。也就是說
 * 「該清的清單」漏掉任何一個鍵，那一份示範資料就會原封不動地跟著每一位新客戶進系統。
 *
 * 三份清單目前彼此對不齊：
 *   src/lib/engine.ts  newCase()   清 15 個陣列（＋ members / plan / retire / lifeGoals 另行重設）
 *   public/lantu-app.html newCase() 清 26 個
 *   public/lantu-app.html CASE_ARRAYS 列了 28 個
 * 差額是企業主體與出生計畫那批（companies / bizYears / actions / birthPlan …）——
 * 今天無害，**純粹因為 sampleCase() 剛好沒有那些鍵**。
 * 只要有人往 sampleCase() 補一列示範用的 companies 或 actions（那是遲早的事，
 * 示範案就是拿來展示功能的），每一位新客戶就會憑空帶著別人的公司財報。
 *
 * ⚠️ engine.ts 不在這次的改動範圍，所以這裡不動它，只把那個縫用測試釘住：
 * 補示範資料的那一刻測試就紅，補的人才知道要順手把鍵加進清空清單。
 */

const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
const ENGINE = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");

/** newCase() 在原始碼裡「處理過」的鍵：forEach 清空 + `c.x=[]` + `c.x=[{…}]` 重新種一份。 */
function handledKeys(src: string): Set<string> {
  const start = src.indexOf("function newCase()");
  expect(start, "engine.ts 找不到 newCase()，改過名字就要順手更新這支測試").toBeGreaterThan(-1);
  const end = src.indexOf("return c}", start);
  const body = src.slice(start, end > 0 ? end : undefined);

  const out = new Set<string>();
  for (const m of body.matchAll(/\[([^[\]]*?)\]\.forEach/g)) {
    for (const n of m[1].matchAll(/'([A-Za-z0-9_]+)'/g)) out.add(n[1]);
  }
  // 個別重設的（c.lifeGoals=[]、c.members=[{…}]）也算處理過。
  for (const m of body.matchAll(/c\.([A-Za-z0-9_]+)\s*=\s*\[/g)) out.add(m[1]);
  return out;
}

/** lantu-app.html 的 CASE_ARRAYS：「一份 case 應該有哪些陣列」的完整清單。 */
function caseArraysOfHtml(): string[] {
  const m = HTML.match(/var CASE_ARRAYS=\[([^\]]*)\]/);
  expect(m, "lantu-app.html 找不到 CASE_ARRAYS").toBeTruthy();
  return [...m![1].matchAll(/'([A-Za-z0-9_]+)'/g)].map((x) => x[1]);
}

const HANDLED = handledKeys(ENGINE);
const SAMPLE = sampleCase() as unknown as Record<string, unknown>;
const FRESH = newCase() as unknown as Record<string, unknown>;

/**
 * 例外：不是「清空」而是「換成一份乾淨的預設」。
 * members 至少要有一位「本人」，空陣列會讓引擎在 primaryMember() 拿到 undefined。
 */
const RESEEDED: Record<string, string> = {
  members: "換成一位空白的「本人」，不是清空——空的 members 會讓 primaryMember() 回 undefined",
};

const sampleArrayKeys = Object.keys(SAMPLE).filter((k) => Array.isArray(SAMPLE[k]));

describe("newCase() 的清空清單 ⊇ sampleCase() 裡所有是陣列的鍵", () => {
  it("至少掃得到幾個鍵（解析壞掉要讓測試紅，不是靜靜通過）", () => {
    expect(sampleArrayKeys.length).toBeGreaterThanOrEqual(10);
    expect(HANDLED.size).toBeGreaterThanOrEqual(15);
  });

  it.each(sampleArrayKeys)("sampleCase().%s 有被 newCase() 處理掉", (key) => {
    expect(
      HANDLED.has(key),
      `sampleCase() 有 ${key} 這個陣列，但 engine.ts 的 newCase() 沒有清它——每一位新客戶都會帶著這份示範資料`,
    ).toBe(true);
  });

  it.each(sampleArrayKeys)("newCase().%s 實際上是空的（或明列為重新種一份）", (key) => {
    if (RESEEDED[key]) return;
    expect(Array.isArray(FRESH[key]), `newCase() 少了 ${key}，引擎會在 render() 丟例外`).toBe(true);
    expect(
      (FRESH[key] as unknown[]).length,
      `newCase().${key} 還留著 ${(FRESH[key] as unknown[]).length} 列示範資料`,
    ).toBe(0);
  });
});

describe("engine.ts 沒清、但 html 認得的那批鍵，sampleCase() 不可以有內容", () => {
  const gap = caseArraysOfHtml().filter((k) => !HANDLED.has(k));

  it("這批鍵確實存在（兩邊真的對齊了的話，這支測試就沒事做，可以刪）", () => {
    expect(gap.length).toBeGreaterThan(0);
  });

  it.each(gap)("sampleCase() 沒有帶內容的 %s", (key) => {
    const v = SAMPLE[key];
    expect(
      v === undefined || (Array.isArray(v) && v.length === 0),
      `sampleCase() 開始帶 ${key} 的示範資料了，但 engine.ts 的 newCase() 不會清它——` +
        `請把 ${key} 加進 engine.ts newCase() 的清空清單（html 端已經有了）`,
    ).toBe(true);
  });
});
