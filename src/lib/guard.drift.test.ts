import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 「到期唯讀」的漂移測試。
 *
 * 使用期限的鎖是掛在每一支寫入型 server action 上的。漏掉一支，那條路徑就是
 * 「到期後仍可寫」的破口 —— 而且畫面上完全看不出來（頂欄照樣顯示已到期、橫幅照樣掛著）。
 * 所以這裡不驗行為，驗的是「每一支 actions 檔有沒有把該接的閘接上」。
 *
 * 接法二選一：
 *   · requireWritableCoach()（推薦，一行搞定，見 lib/guard.ts）
 *   · licenseState(me).expired 自己判斷（回傳 { ok:false } 型的 action 用這個，
 *     因為 Next 在正式環境會把 throw 出去的訊息換成沒有意義的 digest）
 *
 * ⚠️ 這支測試上一版有兩個洞，兩個都是「掃不到」而不是「掃出來放行」：
 *   1. ROOT 只有 src/app/dashboard —— /admin、/portal、/coaches 一支都沒看過。
 *   2. 比對條件是 `name === "actions.ts"`，檔名恰好等於 actions.ts 才算。
 *      collabActions.ts、licenseActions.ts 這種命名方式一律漏掉。
 * 兩個洞加起來，當時實際只掃到 6 支中的 5 支。現在改成掃 src/app 底下所有
 * /[Aa]ctions.ts$/，並依所在區域套不同的閘。
 */

const ROOT = join(process.cwd(), "src/app");
// 只認正式程式碼：actions.ts、collabActions.ts、licenseActions.ts 都算；測試檔不算。
const IS_ACTIONS = (name: string) => /[Aa]ctions\.ts$/.test(name) && !/\.test\.ts$/.test(name);

/**
 * 例外清單。加進來要寫清楚理由 —— 沒有理由的例外就是破口。
 */
const EXEMPT: Record<string, string> = {
  "src/app/dashboard/apply/actions.ts": "申請成為教練：當下還不是教練，沒有期限可檢查",
  "src/app/dashboard/learn/actions.ts": "學習區進度：到期的人正是最需要把課補完的人，擋住等於斷了續約的路",
};

/**
 * 區域分類。三個區域的租戶與閘完全不同，混在同一條斷言裡只會逼人加例外：
 *   /admin   後台：走 ensureCoach() + isAdmin()。**刻意不吃個人使用期限** ——
 *            那是核心成員與管理員的權限，不因為某個人的授權到期就關掉整個後台。
 *   client   /portal、/bizcheck、/coaches：租戶是客戶（ensureClientUser），
 *            跟教練的使用期限無關。
 *   coach    其餘（/dashboard…）：必須接上到期唯讀閘。
 */
const ADMIN = /^src\/app\/admin\//;
const CLIENT_SIDE = /^src\/app\/(portal|bizcheck|coaches)\//;

function actionFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) actionFiles(p, out);
    else if (IS_ACTIONS(name)) out.push(p);
  }
  return out;
}

const files = actionFiles(ROOT).map((f) => [f.slice(f.indexOf("src/")), f] as const);
const src = (p: string) => readFileSync(p, "utf8");

const adminFiles = files.filter(([label]) => ADMIN.test(label));
const clientFiles = files.filter(([label]) => CLIENT_SIDE.test(label));
const coachFiles = files.filter(([label]) => !ADMIN.test(label) && !CLIENT_SIDE.test(label));

describe("掃描範圍本身", () => {
  it("三個區域都掃得到檔案（路徑或命名改了要讓測試壞掉，不是靜靜通過）", () => {
    expect(coachFiles.length).toBeGreaterThanOrEqual(6);
    expect(adminFiles.length).toBeGreaterThanOrEqual(5);
    expect(clientFiles.length).toBeGreaterThanOrEqual(3);
  });

  it("不是只認檔名恰好等於 actions.ts（xxxActions.ts 也要掃到）", () => {
    const labels = files.map(([l]) => l);
    expect(labels).toContain("src/app/dashboard/clients/[id]/collabActions.ts");
    expect(labels).toContain("src/app/admin/licenseActions.ts");
  });
});

describe("教練端每一支 actions 都接上使用期限的唯讀閘", () => {
  it.each(coachFiles)("%s", (label, path) => {
    if (EXEMPT[label]) return;
    const s = src(path);
    const guarded = s.includes("requireWritableCoach") || s.includes("licenseState");
    expect(guarded, `${path} 沒有接上到期唯讀閘（requireWritableCoach 或 licenseState）`).toBe(true);
  });

  it("不要繞過 guard 自己寫 ensureCoach 當寫入檢查", () => {
    const offenders = coachFiles
      .filter(([label]) => !EXEMPT[label])
      .filter(([, path]) => {
        const s = src(path);
        return s.includes("ensureCoach") && !s.includes("licenseState");
      })
      .map(([label]) => label);
    expect(offenders).toEqual([]);
  });
});

describe("後台走的是 isAdmin，不吃個人使用期限（這是刻意的）", () => {
  it.each(adminFiles)("%s", (label, path) => {
    expect(
      src(path).includes("isAdmin"),
      `${path} 沒有檢查 isAdmin —— /admin 的閘是管理員身分，不是教練身分`,
    ).toBe(true);
  });
});

describe("客戶端／公開頁的 actions 認的是客戶身分", () => {
  it.each(clientFiles)("%s", (label, path) => {
    expect(
      src(path).includes("ensureClientUser"),
      `${path} 既不是教練端也沒有驗客戶身分——這一區的租戶是客戶（ensureClientUser）`,
    ).toBe(true);
  });
});
