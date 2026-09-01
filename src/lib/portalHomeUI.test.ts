import { describe, it, expect, vi, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { computePassport, emptyPassport, type PassportInputs } from "@/lib/passport";

/**
 * /portal 首頁（⑧-2）的版面守門員。
 *
 * 現況是：1 個大數字 ＋ 10 個小數字 ＋ 4 顆同權重 CTA、0 張圖——
 * 護照精靈裡每個面向本來就有圖（房車 Donut、退休三條 Bar），存檔後回首頁反而退化成純數字列表。
 * 這一輪把五列數字換成一張水平堆疊條、大數字保留、其餘收合、四顆 CTA 降成一主三次。
 *
 * ⚠️ 這支測試把真正的 page.tsx **整個 SSR 出來**（資料層用 mock 換掉，不碰資料庫），
 *    釘的是渲染結果，不是原始碼字串。
 */
const PASSPORT: PassportInputs = emptyPassport(2026);
const RESULT = computePassport(PASSPORT);

vi.mock("@/lib/clientUser", () => ({
  ensureClientUser: async () => ({ id: "cu_1", name: "王大明", email: "a@b.c" }),
}));
vi.mock("@/lib/comp/survey", () => ({ listClientCases: async () => [] }));
// 待辦清單（教練從規劃器的「待補齊清單」送過來的 action_items）。
vi.mock("@/lib/clientTodos", () => ({
  listClientTodos: async () => [
    { id: "t1", title: "提供勞保投保薪資", owner: "客戶", dueDate: null, done: false },
    { id: "t2", title: "提供人壽險保單", owner: "客戶", dueDate: "2026-09-30", done: false },
    { id: "t3", title: "提供最近三個月薪資單", owner: "客戶", dueDate: null, done: true },
  ],
}));
vi.mock("@/lib/clientPlan", () => ({
  getClientOwnPlan: async () => ({ clientId: "c1", planId: "p1", passport: PASSPORT, result: null }),
  getClientPlanCase: async () => ({ clientId: "c1", planId: "p1", data: {}, code: "L-0001" }),
  getClientSetup: async () => ({
    basics: null, cross: null, code: "L-0001",
    intent: { mustHave: ["退休生活規劃", "購屋規劃"], purposes: [], targets: [] },
  }),
}));
vi.mock("@/Shared/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } }));
vi.mock("@/Shared/db/schema", () => ({ coaches: { id: "id" } }));
// 風險屬性測驗的邀請狀態：mock 在模組邊界，不用讓假 schema 認識 client_risk_quiz。
vi.mock("@/lib/clientRiskQuiz", () => ({ pendingInvite: async () => false }));
vi.mock("@clerk/nextjs", () => ({
  SignOutButton: ({ children }: { children: unknown }) => children,
}));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirected"); } }));

let doc: Document;
let html: string;

beforeAll(async () => {
  const [{ default: Portal }, { renderToStaticMarkup }] = await Promise.all([
    import("@/app/portal/page"),
    import("react-dom/server"),
  ]);
  // Portal 是 async server component：先 await 出 element 再靜態渲染。
  const el = await (Portal as unknown as () => Promise<React.ReactElement>)();
  html = renderToStaticMarkup(el);
  doc = new JSDOM(`<body>${html}</body>`).window.document;
});

const $$ = (sel: string) => [...doc.querySelectorAll(sel)];

describe("我的待辦（教練的「待補齊清單」送過來的）", () => {
  it("未完成的直接列出來，已完成的收進 details", () => {
    expect(html).toContain("我的待辦");
    expect(html).toContain("還有 2 項待補");
    expect(html).toContain("提供勞保投保薪資");
    expect(html).toContain("已完成 1 項");
  });

  it("⚠️ 說清楚「不必等全部補齊才開始」——這正是 Ray 要它取代文件檢核表的理由", () => {
    expect(html).toContain("不必等全部補齊才開始");
  });

  it("到期日與負責人有填就顯示", () => {
    expect(html).toContain("2026-09-30 前");
    expect(html).toContain("由 客戶 處理");
  });
});

describe("五列數字換成一張水平堆疊條", () => {
  it("五段都在，寬度加起來 100%，段間 2px", () => {
    const bar = doc.querySelector(".flex.h-\\[26px\\]")!;
    expect(bar, "要有一條 26px 高的堆疊條").toBeTruthy();
    const segs = [...bar.querySelectorAll(":scope > span")];
    expect(segs.length).toBe(5);
    const pcts = segs.map((s) => parseFloat(/calc\(([\d.]+)% - 2px\)/.exec(s.getAttribute("style")!)![1]));
    // 每段是 toFixed(1)，五段加起來的捨入誤差最多 0.5pp
    expect(Math.abs(pcts.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.5);
    expect(segs.every((s) => /margin-right:\s*2px/.test(s.getAttribute("style")!))).toBe(true);
  });

  it("每一段的比例＝那個面向的月存 ÷ 月存合計（走 computePassport，不是另抄一份公式）", () => {
    const bar = doc.querySelector(".flex.h-\\[26px\\]")!;
    const segs = [...bar.querySelectorAll(":scope > span")];
    const monthlies = [PASSPORT.house, PASSPORT.car, PASSPORT.retire, PASSPORT.support, PASSPORT.travel]
      .map((f) => f.monthly);
    const total = monthlies.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(RESULT.totalMonthlyWan, 6);
    segs.forEach((s, i) => {
      const pct = parseFloat(/calc\(([\d.]+)% - 2px\)/.exec(s.getAttribute("style")!)![1]);
      expect(pct).toBeCloseTo((monthlies[i] / total) * 100, 1);
    });
  });

  it("⚠️ 桌機的兩段門檻：≥13% 寫「面向 X萬」、≥6.5% 只寫面向名、更小的交給圖例", () => {
    const segs = [...doc.querySelector(".flex.h-\\[26px\\]")!.querySelectorAll(":scope > span")];
    // 桌機那一份是 hidden sm:inline 的那個 span
    const labels = segs.map((s) => s.querySelector(".sm\\:inline")!.textContent!.trim());
    // 預設護照：房 3／車 1／退休 0.5／扶養 1／旅遊 1（合計 6.5 萬）
    expect(labels[0]).toBe("購房 3萬");        // 46.2% → 寫得下全名＋金額
    expect(labels[1]).toBe("購車 1萬");        // 15.4% → 還寫得下
    expect(labels[2]).toBe("退休");            // 7.7%  → 只寫得下面向名
    expect(labels[3]).toBe("扶養 1萬");
    expect(labels[4]).toBe("旅遊 1萬");
  });

  it("⚠️⚠️ 手機另有一組照 270px 條寬重算的門檻（32% / 17%）——不然標籤會疊到隔壁色塊", () => {
    const segs = [...doc.querySelector(".flex.h-\\[26px\\]")!.querySelectorAll(":scope > span")];
    const narrow = segs.map((s) => s.querySelector(".sm\\:hidden")!.textContent!.trim());
    expect(narrow[0]).toBe("購房 3萬");   // 46.2% ≥ 32
    expect(narrow.slice(1), "15.4% / 7.7% 在 270px 上都塞不下，一律交給圖例").toEqual(["", "", "", ""]);
    // 兩份標籤是同一條規則的兩組門檻，順序不能對調
    const bar = doc.querySelector(".flex.h-\\[26px\\]")!.innerHTML;
    expect(bar.indexOf("sm:hidden")).toBeLessThan(bar.indexOf("hidden sm:inline"));
  });

  it("條上沒標到的那幾段，答案一定在下方的完整圖例裡", () => {
    const leg = $$(".grid > div").filter((d) => /月存 .* 萬$/.test(d.textContent!.trim()));
    expect(leg.length, "圖例要列滿五段（含條上沒標到的）").toBe(5);
    for (const t of ["購房", "購車", "退休", "扶養", "旅遊"])
      expect(leg.some((d) => d.textContent!.includes(t))).toBe(true);
  });

  it("⚠️ 每一段掛 overflow-hidden 當最後的安全網（門檻是比例、條寬會縮）", () => {
    const segs = [...doc.querySelector(".flex.h-\\[26px\\]")!.querySelectorAll(":scope > span")];
    expect(segs.every((s) => /overflow-hidden/.test(s.className))).toBe(true);
  });

  it("圖例寫的是每個面向真正算得出來的能力（走 passport.ts 的結果）", () => {
    expect(html).toContain(`可購房價 ${new Intl.NumberFormat("en-US").format(Math.round(RESULT.house.price / 10000))} 萬`);
    expect(html).toContain(`可扶養約 ${RESULT.support.kids.toFixed(2)} 位`);
  });

  it("五列 divide-y 的清單真的被換掉了", () => {
    expect(doc.querySelector(".divide-y")).toBeNull();
  });
});

describe("大數字保留、其餘收合、CTA 一主三次", () => {
  it("每月應存合計那個大數字還在", () => {
    expect(html).toContain(`${RESULT.totalMonthlyWan.toFixed(1)} 萬`);
    expect(html).toContain("MY LIFE PASSPORT");
  });

  it("必達目標與下一步收進 details", () => {
    // ⚠️ 頁面上不只一個 details（待辦的「已完成 N 項」也是），要指名找。
    const det = [...doc.querySelectorAll("details")]
      .find((d) => d.querySelector("summary")?.textContent?.includes("必達目標優先序與下一步"))!;
    expect(det).toBeTruthy();
    expect(det.querySelector("summary")!.textContent).toContain("必達目標優先序與下一步");
    expect(det.textContent).toContain("退休生活規劃");
    expect(det.textContent).toContain("下一步：補完現況、選一位教練");
    // 收合前的畫面上不可以還有一整塊必達目標卡
    expect($$("div").filter((d) => d.textContent!.trim() === "你的必達目標 · 優先序").length).toBe(0);
  });

  it("四顆同權重 CTA 降成一主三次：一顆填色按鈕 ＋ 三個文字連結", () => {
    const links = $$("a[href^='/portal']").filter((a) => /藍圖|補資料|重新調整|版本紀錄/.test(a.textContent!));
    expect(links.length).toBe(4);
    const primary = links.filter((a) => /bg-\[#c99a5b\]/.test(a.className));
    expect(primary.length, "主行動只能有一顆").toBe(1);
    expect(primary[0].getAttribute("href")).toBe("/portal/plan");
    expect(links.filter((a) => /underline/.test(a.className)).length).toBe(3);
  });
});
