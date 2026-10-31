import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 2026/11/01 Ray：有出生日期就自動推算年齡、不給輸入；沒有出生日期才手填年齡。
const HTML = readFileSync(join(process.cwd(), "public/lantu-app.html"), "utf8");
const fnSrc = (name: string) => {
  const i = HTML.indexOf(`function ${name}(`);
  expect(i).toBeGreaterThan(-1);
  return HTML.slice(i, HTML.indexOf("\n}\n", i) + 2);
};

describe("年齡欄：有生日就鎖住", () => {
  it("ageField 在有生日時畫唯讀欄、值是推算年齡，不掛輸入事件", () => {
    const src = fnSrc("ageField");
    const ro = src.split("\n").find((l) => l.includes("if(auto!=null)return"))!;
    expect(ro).toContain("readonly");
    expect(ro).toContain("value=\"'+auto+'\"");
    expect(ro).not.toContain("attr");
    expect(src).not.toContain("手動覆寫");
  });
  it("migrateCase 載入時以生日推算的年齡為準（本人與家庭成員）", () => {
    const src = fnSrc("migrateCase");
    expect(src).toContain("var _pa=ageFromBirth(c.profile.birth);if(_pa!=null)c.profile.age=_pa;");
    expect(src).toMatch(/c\.members\.forEach\(function\(m\)\{if\(!m\|\|m\.unborn\)return;var _ma=ageFromBirth\(m\.birth\);if\(_ma!=null\)m\.age=_ma;\}\);/);
  });
});
