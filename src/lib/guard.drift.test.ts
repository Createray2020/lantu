import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 「到期唯讀」的漂移測試。
 *
 * 使用期限的鎖是掛在每一支寫入型 server action 上的。漏掉一支，那條路徑就是
 * 「到期後仍可寫」的破口 —— 而且畫面上完全看不出來（頂欄照樣顯示已到期、橫幅照樣掛著）。
 * 所以這裡不驗行為，驗的是「教練端的 actions.ts 有沒有把閘接上」。
 *
 * 接法二選一：
 *   · requireWritableCoach()（推薦，一行搞定，見 lib/guard.ts）
 *   · licenseState(me).expired 自己判斷（回傳 { ok:false } 型的 action 用這個，
 *     因為 Next 在正式環境會把 throw 出去的訊息換成沒有意義的 digest）
 */

const ROOT = join(process.cwd(), "src/app/dashboard");

/**
 * 例外清單。加進來要寫清楚理由 —— 沒有理由的例外就是破口。
 * apply：這是「成為教練」的入口，呼叫的當下還不是教練、也還沒有任何期限可檢查。
 */
const EXEMPT: Record<string, string> = {
  "src/app/dashboard/apply/actions.ts": "申請成為教練：當下還不是教練，沒有期限可檢查",
  "src/app/dashboard/learn/actions.ts": "學習區進度：到期的人正是最需要把課補完的人，擋住等於斷了續約的路",
};

function actionFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) actionFiles(p, out);
    else if (name === "actions.ts") out.push(p);
  }
  return out;
}

describe("教練端每一支 actions.ts 都接上使用期限的唯讀閘", () => {
  const files = actionFiles(ROOT);

  it("至少掃得到檔案（路徑改了要讓測試壞掉，不是靜靜通過）", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files.map((f) => [f.slice(f.indexOf("src/")), f] as const))(
    "%s",
    (label, path) => {
      if (EXEMPT[label]) return;
      const src = readFileSync(path, "utf8");
      const guarded =
        src.includes("requireWritableCoach") || src.includes("licenseState");
      expect(guarded, `${path} 沒有接上到期唯讀閘（requireWritableCoach 或 licenseState）`).toBe(true);
    },
  );

  it("不要繞過 guard 自己寫 ensureCoach 當寫入檢查", () => {
    // 例外：profile/actions.ts 的 admin 上下架用得到 ensureCoach + isAdmin，
    //       requests/actions.ts 需要回 { ok:false } 而不是 throw。
    //       兩者都已另外檢查 licenseState，上面那條測試涵蓋。
    const offenders = files.filter((f) => {
      const label = f.slice(f.indexOf("src/"));
      if (EXEMPT[label]) return false;
      const src = readFileSync(f, "utf8");
      return src.includes("ensureCoach") && !src.includes("licenseState");
    });
    expect(offenders).toEqual([]);
  });
});
