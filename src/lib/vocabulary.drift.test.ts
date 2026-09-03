import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 對外用語的漂移測試（2026/09/03 Ray 拍板）。
 *
 * 報聘文件改版時定調：嵐途是專業顧問公司，制度用語不使用傳直銷語彙。
 *   · 介紹人 → 推薦人（申請表、進度卡、待確認頁、後台一律同一個詞）
 *   · 上線   → 推薦人（uplineId 的顯示名稱；DB 欄位名不動）
 *   · 下線   → 直屬夥伴 / 團隊
 *   · 候選人 → 申請人（報聘語境是申請，不是甄選）
 *
 * ⚠️ 為什麼要一支測試而不是改完就算：這四個詞是「改一個地方就漏一個地方」的典型——
 *    畫面上出現舊詞不會壞任何功能，一條功能測試都不會紅，只有使用者看得到。
 *    下一個人寫新頁面時很容易憑印象再打一次「上線」。
 *
 * 白名單只有一種：「上線」當**部署／正式啟用**用（上線前、上線後、上線時、上線那天、
 * 上線初期、改版上線），以及 plans.ts 的「留下線索」。
 */

const ROOT = process.cwd();
const SELF = "src/lib/vocabulary.drift.test.ts";
const ALLOW_FILES = new Set([SELF, "src/lib/plans.ts"]);

// 部署語境的「上線」——這些不是組織用語，留著。
const DEPLOY_SENSE = /上線(前|後|時|那天|初期)|改版上線/g;

const BANNED: Array<[string, string]> = [
  ["介紹人", "改用「推薦人」"],
  ["候選人", "報聘語境改用「申請人」"],
  ["上線", "組織語境改用「推薦人」（部署語境請寫上線前／上線後／上線時）"],
  ["下線", "改用「直屬夥伴」或「團隊」"],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("對外用語不回頭（推薦人／直屬夥伴／申請人）", () => {
  const files = walk(join(ROOT, "src")).map((p) => p.slice(ROOT.length + 1));

  it("掃得到東西（避免路徑改掉之後這支測試變成空跑）", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  for (const [word, hint] of BANNED) {
    it(`全站不出現「${word}」——${hint}`, () => {
      const hits: string[] = [];
      for (const rel of files) {
        if (ALLOW_FILES.has(rel)) continue;
        const src = readFileSync(join(ROOT, rel), "utf8").replace(DEPLOY_SENSE, "");
        src.split("\n").forEach((line, i) => {
          if (line.includes(word)) hits.push(`${rel}:${i + 1}  ${line.trim()}`);
        });
      }
      expect(hits).toEqual([]);
    });
  }
});
