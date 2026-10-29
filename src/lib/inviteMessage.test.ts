import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CLAIM_BUTTON_DEDICATED, CLAIM_BUTTON_GROUP, CLAIM_ENTRY_LABEL, dedicatedMessage, greetName, groupInviteMessage, guideDone, portalGuideState } from "./inviteMessage";

describe("複製訊息（2026/10/29）", () => {
  it("招呼去姓、用「您」；一對一含連結、要按的按鈕、開通碼與網址", () => {
    expect(greetName("徐浩恩")).toBe("浩恩");
    expect(greetName("王明")).toBe("王明");
    expect(greetName("")).toBe("");
    const m = dedicatedMessage({ clientName: "徐浩恩", link: "https://x/portal/join?code=abc", claimCode: "2610008-483921", host: "www.lantufc.com", ready: true });
    expect(m.startsWith("浩恩您好，您的財務規劃我已經整理好了。")).toBe(true);
    expect(m).toContain("https://x/portal/join?code=abc");
    expect(m).toContain(`「${CLAIM_BUTTON_DEDICATED}」`);
    expect(m).toContain(`到 www.lantufc.com 登入，在首頁點「${CLAIM_ENTRY_LABEL}」`);
    expect(m).toContain("2610008-483921");
    expect(m).not.toMatch(/你/);
  });
  it("還沒規劃：不叫客戶去填人生護照；沒開通碼就不寫那段", () => {
    const m = dedicatedMessage({ clientName: null, link: "L", claimCode: null, host: "h", ready: false });
    expect(m.startsWith("您好，先邀請您開通")).toBe(true);
    expect(m).not.toContain("人生護照");
    expect(m).not.toContain("開通碼");
  });
  it("群發：按鈕字對得上、接著填人生護照", () => {
    const m = groupInviteMessage({ link: "L" });
    expect(m).toContain(`「${CLAIM_BUTTON_GROUP}」`);
    expect(m).toContain("人生護照");
  });
  it("認領頁的按鈕用同一組常數（訊息說按哪顆，頁面上就是那顆）", () => {
    expect(readFileSync("src/app/portal/claim/ClaimConfirm.tsx", "utf8")).toMatch(/group \? CLAIM_BUTTON_GROUP : CLAIM_BUTTON_DEDICATED/);
  });
});

describe("客戶首頁我的進度", () => {
  const st = (hasPassport: boolean, coachPlan: boolean, link: "none" | "pending" | "linked") => portalGuideState({ hasPassport, coachPlan, link });
  it("三條路的每一態", () => {
    expect(st(false, false, "none")).toBe("start");
    expect(st(true, false, "none")).toBe("need_coach");
    expect(st(true, false, "pending")).toBe("waiting");
    expect(st(false, false, "linked")).toBe("fill_passport");
    expect(st(true, false, "linked")).toBe("coach_preparing");
    expect(st(true, true, "linked")).toBe("done");
    expect(guideDone("start")).toBe(1);
    expect(guideDone("fill_passport")).toBe(2);
    expect(guideDone("done")).toBe(3);
  });
});
