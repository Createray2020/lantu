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

describe("勾選欄與確認項的標籤", () => {
  it("ask 與 xxx.is_yyy 往返不變；ask 標籤帶 ☐ 與清單文字", () => {
    const asks = [{ key: "adult", label: "年滿 18 歲", kind: "must" as const, role: "member" as const }];
    const src = "<p>{{pay.is_bank}} 匯款 {{ask:adult}} {{member.id_no}}</p>";
    const chips = tokensToChips(src, [], asks);
    expect(chips).toContain('chip-check" contenteditable="false" data-var="pay.is_bank">☐ 付款：匯款一次付清');
    expect(chips).toContain('data-ask="adult">☐ 年滿 18 歲');
    expect(chipsToTokens(chips)).toBe(src);
  });
});
