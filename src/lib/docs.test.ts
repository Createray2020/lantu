import { describe, it, expect } from "vitest";
import {
  applySignatures,
  canSignNow,
  currentSeq,
  instanceStatusFrom,
  isSigner,
  missingSlots,
  normalizeHtml,
  renderTemplate,
  resolveSlots,
  sanitizeSlots,
  slotsInHtml,
  validSignaturePng,
  validateTemplate,
  sanitizeAsks,
  checkAnswers,
  E_SIGN_CLAUSE,
} from "./docs";

// 1x1 透明 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("簽名圖驗證", () => {
  it("只收 PNG data URL", () => {
    expect(validSignaturePng(PNG)).toBe(PNG);
    expect(validSignaturePng("data:image/jpeg;base64,/9j/4AAQ")).toBeNull();
    expect(validSignaturePng("data:image/png;base64,<script>")).toBeNull();
    expect(validSignaturePng("data:image/png;base64,QUJDREVGR0hJSktMTU5PUA==")).toBeNull(); // 不是 PNG magic
    expect(validSignaturePng("")).toBeNull();
    expect(validSignaturePng(null)).toBeNull();
  });
});

describe("簽名位", () => {
  it("sanitizeSlots 去掉壞角色、補 seq、同位去重、依 seq 排序", () => {
    const out = sanitizeSlots([
      { role: "coach", seq: 2 },
      { role: "member", seq: "1", label: "申請人" },
      { role: "boss", seq: 1 },
      { role: "member", seq: 1 },
      { role: "client", seq: 0 },
    ]);
    expect(out).toEqual([
      { role: "client", seq: 1 },
      { role: "member", seq: 1, label: "申請人" },
      { role: "coach", seq: 2 },
    ]);
  });

  it("slotsInHtml 抓出內容裡的簽名位；validateTemplate 擋沒宣告的", () => {
    const html = "<p>甲方 {{sign:client:1}} 乙方 {{ sign:coach:2 }}</p>";
    expect(slotsInHtml(html)).toEqual(["client:1", "coach:2"]);
    const errs = validateTemplate({ category: "client_service", name: "合約", html, useSeal: true, required: true, signDays: 14, signers: [{ role: "client", seq: 1 }] });
    expect(errs.join()).toContain("coach:2");
    expect(validateTemplate({ category: "training", name: "", html: "", useSeal: true, required: true, signDays: 0, signers: [] }).length).toBeGreaterThanOrEqual(4);
  });

  it("沒寫在內容裡的簽名位會補在文末", () => {
    const t = { html: "<p>條款</p>", signers: [{ role: "member" as const, seq: 1 }], useSeal: false };
    expect(missingSlots(t)).toHaveLength(1);
    const html = renderTemplate(t, {});
    expect(html).toContain('class="doc-sign-block"');
    expect(html).toContain('data-slot="member:1"');
  });
});

describe("渲染與雜湊", () => {
  it("帶變數要轉義、沒有的變數印空、seal 只在 useSeal 時出現", () => {
    const t = { html: "<h1>{{title}}</h1><p>{{client.name}} / {{nothing}}</p>{{seal}}{{sign:client:1}}", signers: [{ role: "client" as const, seq: 1, label: "簽約人" }], useSeal: true };
    const html = renderTemplate(t, { title: "顧問<合約>", "client.name": "王小明" }, { seal: PNG });
    expect(html).toContain("顧問&lt;合約&gt;");
    expect(html).toContain("王小明 / </p>");
    expect(html).toContain('class="doc-seal"');
    expect(html).toContain("簽約人");
    expect(renderTemplate({ ...t, useSeal: false }, {}, { seal: PNG })).not.toContain("doc-seal");
  });

  it("渲染會拿掉 script／事件屬性／javascript:", () => {
    const html = renderTemplate({ html: '<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:void(0)">b</a>{{sign:member:1}}', signers: [{ role: "member", seq: 1 }], useSeal: false }, {});
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  it("normalizeHtml 把換行統一、去頭尾空白", () => {
    expect(normalizeHtml("  a\r\nb\r\n ")).toBe("a\nb");
  });

  it("applySignatures 把簽名圖貼進對應的位、沒簽的位不動", () => {
    const html = renderTemplate({ html: "{{sign:client:1}}{{sign:coach:2}}", signers: [{ role: "client", seq: 1 }, { role: "coach", seq: 2 }], useSeal: false }, {});
    const out = applySignatures(html, [{ role: "client", seq: 1, displayName: "王小明", signatureImg: PNG, signedAt: "2026-10-28T01:00:00Z" }]);
    expect(out).toContain('data-slot="client:1"><img class="sign-img"');
    expect(out).toContain("王小明　2026-10-28");
    expect(out).toContain('<span class="sign-slot" data-slot="coach:2"><span class="sign-slot-label">');
  });

  it("條款那一句存在（範本與介面共用同一個常數）", () => {
    expect(E_SIGN_CLAUSE).toContain("本系統電子簽署");
  });
});

describe("簽署順序與狀態", () => {
  const S = (seq: number, status: string) => ({ seq, status });
  it("同 seq 可並行；下一順位要等前面全簽完", () => {
    const all = [S(1, "pending"), S(1, "pending"), S(2, "pending")];
    expect(currentSeq(all)).toBe(1);
    expect(canSignNow(all[0], all)).toBe(true);
    expect(canSignNow(all[1], all)).toBe(true);
    expect(canSignNow(all[2], all)).toBe(false);
    const after = [S(1, "signed"), S(1, "signed"), S(2, "pending")];
    expect(canSignNow(after[2], after)).toBe(true);
    expect(instanceStatusFrom(after)).toBe("pending");
    expect(instanceStatusFrom([S(1, "signed"), S(2, "signed")])).toBe("completed");
  });
  it("有人拒簽 → 整份 declined，其他人不能再簽", () => {
    const all = [S(1, "declined"), S(2, "pending")];
    expect(instanceStatusFrom(all)).toBe("declined");
    expect(canSignNow(all[1], all)).toBe(false);
  });
  it("空簽署人不算完成", () => {
    expect(instanceStatusFrom([])).toBe("pending");
  });
});

describe("簽名位對到人", () => {
  it("client 用 clientUserId、其他角色用 coachId；缺角色回 missing", () => {
    const slots = [{ role: "member" as const, seq: 1 }, { role: "company" as const, seq: 2, label: "公司代表" }];
    const r1 = resolveSlots(slots, { member: { coachId: "c1", name: "小美" } });
    expect(r1).toEqual({ ok: false, missing: ["company"] });
    const r2 = resolveSlots(slots, { member: { coachId: "c1", name: "小美" }, company: { coachId: "boss", name: "Ray" } });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.signers[0]).toMatchObject({ role: "member", coachId: "c1", clientUserId: null, displayName: "小美", label: "成員簽名" });
      expect(r2.signers[1]).toMatchObject({ role: "company", coachId: "boss", label: "公司代表" });
    }
    const r3 = resolveSlots([{ role: "client", seq: 1 }], { client: { clientUserId: "u1", name: "客" } });
    expect(r3.ok && r3.signers[0].clientUserId).toBe("u1");
    // 客戶角色給了 coachId 不算
    expect(resolveSlots([{ role: "client", seq: 1 }], { client: { coachId: "c", name: "x" } }).ok).toBe(false);
  });
  it("isSigner 只認同一個身分", () => {
    expect(isSigner({ coachId: "c1", clientUserId: null }, { coachId: "c1" })).toBe(true);
    expect(isSigner({ coachId: "c1", clientUserId: null }, { coachId: "c2" })).toBe(false);
    expect(isSigner({ coachId: null, clientUserId: "u" }, { clientUserId: "u" })).toBe(true);
    expect(isSigner({ coachId: null, clientUserId: null }, { coachId: null, clientUserId: null })).toBe(false);
  });
});

describe("自動帶入與本人確認項（2026/10/28）", () => {
  it("布林變數印 ☑／☐；sign.date 在快照是佔位、簽完才填；ask 在快照是 ☐", () => {
    const t = { html: "<p>{{pay.is_bank}} 匯款 {{pay.is_card}} 刷卡</p><p>{{ask:adult}} 年滿18</p><p>簽署日期 {{sign.date}}</p>{{sign:member:1}}", signers: [{ role: "member" as const, seq: 1 }], useSeal: false, asks: [{ key: "adult", label: "年滿 18 歲", kind: "must" as const, role: "member" as const }] };
    const html = renderTemplate(t, { "pay.is_bank": true, "pay.is_card": false });
    expect(html).toContain("☑ 匯款 ☐ 刷卡");
    expect(html).toContain('<span class="doc-ask" data-ask="adult">☐</span>');
    expect(html).toContain('<span class="doc-sign-date">（簽署時帶入）</span>');
    const signed = applySignatures(html, [{ role: "member", seq: 1, displayName: "小美", signatureImg: PNG, signedAt: "2026-10-30T02:00:00Z", answers: { adult: true } }], t.asks);
    expect(signed).toContain('data-ask="adult" title="年滿 18 歲">☑<');
    expect(signed).toContain('<span class="doc-sign-date">2026-10-30</span>');
  });

  it("沒放進內容的確認項列在文末簽署欄", () => {
    const t = { html: "<p>條款</p>", signers: [{ role: "member" as const, seq: 1 }], useSeal: false, asks: [{ key: "mkt", label: "同意寄送活動資訊", kind: "opt" as const, role: "member" as const }] };
    const html = renderTemplate(t, {});
    expect(html).toContain("簽署欄");
    expect(html).toContain('data-ask="mkt">☐</span> 同意寄送活動資訊');
  });

  it("sanitizeAsks 清 key、去重、kind 預設必勾、公司不能作答；checkAnswers 必勾沒勾就擋", () => {
    const asks = sanitizeAsks([{ key: "Adult!", label: "年滿18", kind: "must", role: "member" }, { key: "adult", label: "重複" }, { key: "mkt", label: "行銷", kind: "opt", role: "company" }, { key: "", label: "沒 key" }]);
    expect(asks).toEqual([{ key: "adult", label: "年滿18", kind: "must", role: "member" }, { key: "mkt", label: "行銷", kind: "opt", role: "member" }]);
    expect(checkAnswers(asks, { mkt: true })).toEqual({ ok: false, missing: [asks[0]] });
    expect(checkAnswers(asks, { adult: true, other: true })).toEqual({ ok: true, answers: { adult: true, mkt: false } });
  });

  it("validateTemplate：內容裡的 ask 要在清單裡；ask 指定的角色要有簽署人", () => {
    const base = { category: "training" as const, name: "x", html: "<p>{{ask:adult}}</p>", useSeal: false, required: true, signDays: null, signers: [{ role: "member" as const, seq: 1 }] };
    expect(validateTemplate({ ...base, asks: [] }).join()).toContain("ask:adult");
    expect(validateTemplate({ ...base, asks: [{ key: "adult", label: "年滿", kind: "must", role: "client" }] }).join()).toContain("客戶");
    expect(validateTemplate({ ...base, asks: [{ key: "adult", label: "年滿", kind: "must", role: "member" }] })).toEqual([]);
  });
});
