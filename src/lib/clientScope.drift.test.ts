import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 「讀範圍」不可以外洩到「寫入路徑」的漂移測試。
 *
 * 共同執案上線後，同一個問題有兩種答案：
 *   ownedClient(me)    → 我是主責，可讀可寫
 *   readableClient(me) → 我是主責 **或** 已接受的協作教練，只可讀
 *
 * 這兩把尺長得很像，而且把寫入條件從 owned 換成 readable，測試不會壞、畫面不會變，
 * 只是協作教練從此改得動別人的客戶——出事時完全查不出來是哪一次改動造成的。
 * 所以這裡不驗行為，驗的是「有沒有哪支寫入函式沾到讀範圍」。
 */

const R = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** 把一支檔案切成「函式名 → 函式原始碼」。夠用就好：這些檔案都是一層 export function。 */
function functionsOf(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(?:export\s+)?async\s+function\s+([A-Za-z0-9_]+)/g;
  const marks: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) marks.push({ name: m[1], at: m.index });
  marks.forEach((mk, i) => {
    const raw = src.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : src.length);
    // 切到第一個「頂格的 }」為止：下一支函式前面的說明註解（裡面常常正好在講
    // readableClient 不可以用在這裡）不能算進上一支函式，否則這支測試會自己咬自己。
    const end = raw.indexOf("\n}\n");
    out[mk.name] = end >= 0 ? raw.slice(0, end + 3) : raw;
  });
  return out;
}

const READ_SCOPE = /readableClient|readablePlan|readableClientId|getClientForRead|getPlanForRead/;

describe("寫入路徑一律只認主責", () => {
  const WRITERS: Record<string, string[]> = {
    "src/lib/clients.ts": ["createClient", "updateClient", "setClientStatus"],
    "src/lib/plans.ts": ["updatePlanData", "updatePlanMeta", "clonePlan", "createPlan", "deletePlan"],
  };

  for (const [file, names] of Object.entries(WRITERS)) {
    const fns = functionsOf(R(file));
    it.each(names)(`${file} → %s 不碰讀範圍`, (name) => {
      expect(fns[name], `${file} 找不到 ${name}()，改過名字就要順手更新這支測試`).toBeTruthy();
      expect(READ_SCOPE.test(fns[name]), `${name}() 用到了「可讀範圍」——協作教練會因此變成可寫`).toBe(false);
    });
  }

  it("lib/reviews.ts 完全不引用可讀範圍（諮詢紀錄與動作項目只有主責能寫）", () => {
    expect(READ_SCOPE.test(R("src/lib/reviews.ts"))).toBe(false);
  });

  it("教練端的寫入 server actions 不引用可讀範圍", () => {
    expect(READ_SCOPE.test(R("src/app/dashboard/actions.ts"))).toBe(false);
  });

  it("回復版本（寫入）走 getPlan 而不是 getPlanForRead", () => {
    const src = R("src/app/dashboard/plans/[planId]/history/actions.ts");
    expect(src).toContain("getPlan(");
    expect(src).not.toContain("getPlanForRead");
  });
});

describe("讀取路徑確實放寬了（不然這個功能等於沒做）", () => {
  it("getClientForRead / getPlanForRead 用的是 readableClient", () => {
    const clients = functionsOf(R("src/lib/clients.ts"));
    expect(clients["getClientForRead"]).toMatch(/readableClient/);
    const plans = functionsOf(R("src/lib/plans.ts"));
    expect(plans["readablePlan"]).toMatch(/readableClient/);
  });

  it("客戶詳情頁與報告書頁都有把 readOnly 接上（協作教練不能看到可寫的畫面）", () => {
    expect(R("src/app/dashboard/clients/[id]/page.tsx")).toMatch(/readOnly=\{/);
    expect(R("src/app/dashboard/plans/[planId]/edit/page.tsx")).toMatch(/readOnly=\{[^}]*isOwner/);
  });
});
