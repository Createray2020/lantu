import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AN_MODULES } from "./analysisModules";

// 分析模組登錄表的漂移守衛。
//
// 真正的模組表在 public/lantu-app.html 的 analysisModules(c)；src/lib/analysisModules.ts 是鏡像。
// 後台的「分析模組預設順序」讀鏡像那份來畫畫面，兩邊一旦不同步，後台會少一個模組排不到、
// 或排了一個畫面上根本不存在的鍵（存進 DB 之後就變成沉默的死資料）。
//
// 比對方式：抓 html 裡 analysisModules() 函式體內、縮排兩格的 `{k:'…',t:'…'` —— 這是模組表的字面形狀。
// 加模組卻沒同步這一份就會紅；標題改字也會紅。修法是把 src/lib/analysisModules.ts 補成一樣。

const html = readFileSync(join(process.cwd(), "public", "lantu-app.html"), "utf8");

function htmlModules(): { k: string; t: string }[] {
  const start = html.indexOf("function analysisModules(c){");
  expect(start, "html 裡找不到 analysisModules(c)").toBeGreaterThan(0);
  const end = html.indexOf("\nvar AN_VIEW=null;", start);
  expect(end, "html 裡找不到 analysisModules 的結尾").toBeGreaterThan(start);
  const body = html.slice(start, end);
  const out: { k: string; t: string }[] = [];
  const re = /^ {2}\{k:'([a-z_]+)',t:'([^']*)'/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push({ k: m[1], t: m[2] });
  return out;
}

describe("分析模組登錄表與 lantu-app.html 同步", () => {
  it("鍵與順序一字不差", () => {
    const fromHtml = htmlModules();
    expect(fromHtml.length).toBeGreaterThan(10); // 抓法失效時不要靜靜地通過
    expect(fromHtml.map((x) => x.k)).toEqual(AN_MODULES.map((x) => x.k));
  });

  it("標題一字不差", () => {
    const fromHtml = htmlModules();
    expect(fromHtml.map((x) => x.t)).toEqual(AN_MODULES.map((x) => x.t));
  });

  it("html 端有 when 的模組，鏡像這邊要標註 cond", () => {
    const start = html.indexOf("function analysisModules(c){");
    const end = html.indexOf("\nvar AN_VIEW=null;", start);
    const body = html.slice(start, end);
    const withWhen = new Set<string>();
    const re = /^ {2}\{k:'([a-z_]+)',t:'[^']*',(?:hint:[^\n]*\n\s*)?when:/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) withWhen.add(m[1]);
    // hint 是函式時 when 會落到下一行，補一輪寬鬆比對
    for (const mod of AN_MODULES) {
      const seg = body.split(`{k:'${mod.k}',`)[1] ?? "";
      const head = seg.slice(0, seg.indexOf("html:function"));
      if (/\bwhen:/.test(head)) withWhen.add(mod.k);
    }
    expect([...withWhen].sort()).toEqual(AN_MODULES.filter((m2) => m2.cond).map((m2) => m2.k).sort());
  });
});
