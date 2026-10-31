import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { coachNav, CLIENT_NAV, ACCOUNT_LINKS, INBOX_HREF, activeKey } from "./nav";

/**
 * 2026/11/01 介面整理第一波：頂欄只搬位置、不刪入口。
 * 改版前教練端頂欄的每一個入口，改版後都必須在「主導覽／首頁分頁／收件匣／頭像選單」其中一處找得到。
 * 這支測試就是那張「功能對照表」的守門員：哪天有人把某個入口從選單拿掉，這裡會紅。
 */
const R = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const menu = R("components/shell/AccountMenu.tsx");
const tabs = R("app/dashboard/HomeTabs.tsx");

const reachable = new Set<string>([
  ...coachNav({ learnOn: true }).map((i) => i.href),
  ...ACCOUNT_LINKS.map((l) => l.href),
  INBOX_HREF.coach,
  ...[...tabs.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]),
  ...[...menu.matchAll(/href="([^"]+)"/g)].map((m) => m[1]),
]);

describe("舊頂欄的每一個入口都還在", () => {
  const OLD: [string, string][] = [
    ["首頁", "/dashboard"], ["客戶", "/dashboard/clients"], ["儀表板", "/dashboard/overview"], ["案件", "/dashboard/cases"],
    ["我的業務", "/dashboard/my-business"], ["企業主手冊", "/dashboard/bizguide"], ["學習區", "/dashboard/learn"],
    ["我的檔案", "/dashboard/profile"], ["我的分潤", "/dashboard/payouts"], ["我的文件", "/dashboard/docs"],
    ["我的規劃", "/portal"], ["官網首頁", "/home"], ["後台", "/admin/inbox"],
    // 盤點時發現沒有入口的兩頁，這次補上
    ["行事曆", "/dashboard/calendar"], ["業務制度說明", "/dashboard/handbook"],
  ];
  for (const [label, href] of OLD) {
    it(`${label}（${href}）找得到`, () => expect(reachable.has(href), `${label} 在新頂欄找不到入口`).toBe(true));
  }

  it("待確認與通知的原頁還在，收件匣連得過去", () => {
    const inbox = R("app/dashboard/inbox/page.tsx");
    expect(inbox).toContain('href="/dashboard/requests"');
    expect(inbox).toContain('href="/dashboard/notifications"');
    expect(inbox).toContain('href="/dashboard/docs"');
    expect(inbox).toContain('href="/admin/inbox"');
  });

  it("外觀（主題／字級）、使用期限、帳號設定、登出都在頭像選單", () => {
    for (const s of ["<ThemeToggle", "<UiScaleToggle", "使用期限", "openUserProfile", "signOut"]) expect(menu).toContain(s);
  });
});

describe("主導覽", () => {
  it("工作台只放每天要用的五個，學習區跟著模組開關", () => {
    expect(coachNav({ learnOn: true }).map((i) => i.label)).toEqual(["首頁", "客戶", "案件", "我的業務", "學習區"]);
    expect(coachNav({ learnOn: false }).map((i) => i.label)).not.toContain("學習區");
  });

  it("客戶端：首頁／我的規劃／文件", () => {
    expect(CLIENT_NAV.map((i) => i.label)).toEqual(["首頁", "我的規劃", "文件"]);
  });

  it("最長前綴勝出：首頁不會在每一頁都亮；儀表板、行事曆算首頁；規劃器算客戶", () => {
    const items = coachNav();
    expect(activeKey(items, "/dashboard")).toBe("home");
    expect(activeKey(items, "/dashboard/overview")).toBe("home");
    expect(activeKey(items, "/dashboard/calendar")).toBe("home");
    expect(activeKey(items, "/dashboard/clients/abc")).toBe("clients");
    expect(activeKey(items, "/dashboard/plans/p1/edit")).toBe("clients");
    expect(activeKey(items, "/dashboard/payouts")).toBe("biz");
    expect(activeKey(items, "/dashboard/inbox")).toBe(null);
    expect(activeKey(CLIENT_NAV, "/portal")).toBe("home");
    expect(activeKey(CLIENT_NAV, "/portal/docs")).toBe("docs");
  });
});
