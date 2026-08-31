import { describe, it, expect } from "vitest";
import {
  APPLY_CONSENTS,
  DEFAULT_APPLY_SETTINGS,
  approvalGate,
  canSubmit,
  checklistFor,
  cleanLicenses,
  consentsDone,
  emptyDraft,
  LICENSE_MAX,
  missingFields,
  routeMeta,
  type ApplySettings,
} from "./coachApply";

const ALL_CONSENTS = APPLY_CONSENTS.map((c) => c.key);

const draft = (over: Partial<ReturnType<typeof emptyDraft>> = {}) => ({
  ...emptyDraft(),
  name: "王小明",
  phone: "0912-345-678",
  motive: "想把財務規劃做成一份能陪客戶十年的東西",
  consents: ALL_CONSENTS,
  ...over,
});

describe("報聘路線", () => {
  it("介紹人推薦要介紹人編號，直接申請不要", () => {
    expect(routeMeta("referral").needsIntroducer).toBe(true);
    expect(routeMeta("direct").needsIntroducer).toBe(false);
    // 認不得的字串一律當成 referral（預設路線），不會變成「不需要介紹人」的漏洞。
    expect(routeMeta("???").needsIntroducer).toBe(true);
  });

  it("沒填介紹人編號的推薦路線送不出去；同一張表換成直接申請就送得出去", () => {
    const d = draft({ route: "referral" });
    expect(missingFields(d, DEFAULT_APPLY_SETTINGS)).toContain("introducerCode");
    expect(canSubmit({ ...d, route: "direct" }, DEFAULT_APPLY_SETTINGS)).toBe(true);
  });
});

describe("必填欄位吃後台設定", () => {
  it("姓名與手機永遠必填，不受設定影響", () => {
    const none: ApplySettings = { ...DEFAULT_APPLY_SETTINGS, requiredFields: [] };
    const m = missingFields(draft({ route: "direct", name: "", phone: "" }), none);
    expect(m).toEqual(expect.arrayContaining(["name", "phone"]));
  });

  it("後台把經歷設成必填，沒填就送不出去", () => {
    const s: ApplySettings = { ...DEFAULT_APPLY_SETTINGS, requiredFields: ["experience"] };
    expect(missingFields(draft({ route: "direct" }), s)).toEqual(["experience"]);
  });

  it("不認得的必填 key 一律忽略（後台改壞了不會讓整條報聘卡死）", () => {
    const s: ApplySettings = { ...DEFAULT_APPLY_SETTINGS, requiredFields: ["nonsense"] };
    expect(missingFields(draft({ route: "direct" }), s)).toEqual([]);
  });
});

describe("聲明", () => {
  it("少勾一條就送不出去", () => {
    expect(consentsDone(ALL_CONSENTS.slice(1))).toBe(false);
    expect(canSubmit(draft({ route: "direct", consents: ALL_CONSENTS.slice(1) }), DEFAULT_APPLY_SETTINGS)).toBe(false);
  });
});

describe("證照列", () => {
  it("沒選類別的整列丟掉，並夾在上限之內", () => {
    const rows = [{ type: "" }, { type: "AFP 理財規劃顧問", at: " 2024-06 ", no: " A123 " }];
    expect(cleanLicenses(rows)).toEqual([{ type: "AFP 理財規劃顧問", name: undefined, at: "2024-06", no: "A123" }]);
    expect(cleanLicenses(Array.from({ length: 20 }, () => ({ type: "其他" })))).toHaveLength(LICENSE_MAX);
    expect(cleanLicenses(null)).toEqual([]);
  });
});

describe("核准閘門", () => {
  const checked = DEFAULT_APPLY_SETTINGS.checklist.map((c) => c.key);

  it("⚠️ 沒有申請表的舊帳號一律放行", () => {
    // 上線前就存在的帳號沒有 coach_applications 列。讓檢核表擋住他們，
    // 後台會出現一批永遠核准不了的帳號。
    const g = approvalGate(
      { route: null, introducerState: null, checked: [], hasApplication: false },
      DEFAULT_APPLY_SETTINGS,
    );
    expect(g.ok).toBe(true);
  });

  it("介紹人還沒確認就不給核准", () => {
    const g = approvalGate(
      { route: "referral", introducerState: "pending", checked, hasApplication: true },
      DEFAULT_APPLY_SETTINGS,
    );
    expect(g.ok).toBe(false);
    expect(g.reasons.join()).toContain("介紹人");
  });

  it("後台關掉「要介紹人先確認」之後就不擋", () => {
    const s: ApplySettings = { ...DEFAULT_APPLY_SETTINGS, requireIntroducerConfirm: false };
    const g = approvalGate({ route: "referral", introducerState: "pending", checked, hasApplication: true }, s);
    expect(g.ok).toBe(true);
  });

  it("直接申請路線完全不看介紹人狀態", () => {
    const g = approvalGate(
      { route: "direct", introducerState: "skipped", checked, hasApplication: true },
      DEFAULT_APPLY_SETTINGS,
    );
    expect(g.ok).toBe(true);
  });

  it("必勾項目沒勾完就擋，而且說得出缺哪一項", () => {
    const g = approvalGate(
      { route: "direct", introducerState: "skipped", checked: ["credential"], hasApplication: true },
      DEFAULT_APPLY_SETTINGS,
    );
    expect(g.ok).toBe(false);
    expect(g.reasons.join()).toContain("已確認費用收款");
  });

  it("非必勾的項目不擋", () => {
    const s: ApplySettings = {
      ...DEFAULT_APPLY_SETTINGS,
      checklist: [{ key: "x", label: "選擇性項目", required: false }],
    };
    expect(approvalGate({ route: "direct", introducerState: "skipped", checked: [], hasApplication: true }, s).ok).toBe(true);
  });

  it("限定路線的檢核項只在那條路線出現", () => {
    const s: ApplySettings = {
      ...DEFAULT_APPLY_SETTINGS,
      checklist: [{ key: "ref-only", label: "只在推薦路線", required: true, routes: ["referral"] }],
      requireIntroducerConfirm: false,
    };
    expect(checklistFor(s, "direct")).toHaveLength(0);
    expect(checklistFor(s, "referral")).toHaveLength(1);
    expect(approvalGate({ route: "direct", introducerState: "skipped", checked: [], hasApplication: true }, s).ok).toBe(true);
    expect(approvalGate({ route: "referral", introducerState: "confirmed", checked: [], hasApplication: true }, s).ok).toBe(false);
  });
});
