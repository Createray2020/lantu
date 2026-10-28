import { describe, it, expect } from "vitest";
import { tokensToChips, chipsToTokens, chipHtml } from "./docsEditor";

describe("範本編輯器：佔位 ↔ 標籤", () => {
  const html = `<h1>{{title}}</h1><p>甲方 {{member.name}}，{{ sign:member:1 }} {{seal}}</p>`;
  it("佔位變成不可編輯的標籤，顯示名用中文", () => {
    const out = tokensToChips(html, [{ role: "member", seq: 1, label: "申請人" }]);
    expect(out).toContain('data-var="member.name"');
    expect(out).toContain(">成員／申請人姓名<");
    expect(out).toContain('data-slot="member:1"');
    expect(out).toContain("✍ 申請人");
    expect(out).toContain('data-seal="1"');
    expect(out).not.toContain("{{");
  });
  it("來回轉換不失真", () => {
    const back = chipsToTokens(tokensToChips(html, [{ role: "member", seq: 1 }]));
    expect(back).toBe(`<h1>{{title}}</h1><p>甲方 {{member.name}}，{{sign:member:1}} {{seal}}</p>`);
  });
  it("插入的標籤也換得回來；一般 span 不動", () => {
    expect(chipsToTokens(chipHtml("var", "case.amount"))).toBe("{{case.amount}}");
    expect(chipsToTokens(chipHtml("slot", "coach:2", "教練"))).toBe("{{sign:coach:2}}");
    expect(chipsToTokens(chipHtml("seal"))).toBe("{{seal}}");
    expect(chipsToTokens(`<span class="x">保留</span>`)).toBe(`<span class="x">保留</span>`);
  });
});
