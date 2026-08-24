import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// 官網公開頁的守門條件很容易「加了列表、忘了單人頁」——而單人頁是直連網址就打得到的，
// 漏一條等於開了一扇後門。這裡不模擬 DB，只逐字檢查兩支查詢共用同一份條件清單。
//
// 同樣的手法見 guard.drift.test.ts（掃 action 有沒有接上寫入閘）。
const SRC = readFileSync("src/lib/coachProfile.ts", "utf8");

describe("公開教練查詢的四道門檻", () => {
  it("條件清單只有一份（PUBLIC_CONDITIONS）", () => {
    expect(SRC).toContain("const PUBLIC_CONDITIONS = () => [");
  });

  it("四道條件一條都不能少", () => {
    const block = SRC.split("const PUBLIC_CONDITIONS = () => [")[1].split("];")[0];
    expect(block).toContain('eq(coaches.status, "active")');       // 帳號已開通
    expect(block).toContain("eq(coachProfiles.published, true)");   // 管理員沒下架
    expect(block).toContain("eq(coachProfiles.selfHidden, false)"); // 教練沒自己隱藏
    expect(block).toContain("isNotNull(coaches.rankCode)");         // 已定級
  });

  it("列表與單人頁都吃同一份條件（單人頁不能自己寫一套）", () => {
    expect(SRC).toContain("and(...PUBLIC_CONDITIONS())");
    expect(SRC).toContain("and(eq(coaches.id, coachId), ...PUBLIC_CONDITIONS())");
  });

  it("⚠️ 首頁人數刻意少一條：把「自己隱藏」的教練算回來", () => {
    // Ray 2026/08/24 拍板：隱藏是「不想被公開陳列」不是「不存在」，公司規模該含他們。
    // 但仍不含沒填檔案／未定級的人。這條測試守的是「不要哪天順手改成共用 PUBLIC_CONDITIONS」。
    const fn = SRC.split("export async function countPublicCoaches")[1].split("\n}")[0];
    expect(fn).not.toContain("selfHidden");
    expect(fn).toContain("isNotNull(coaches.rankCode)");
    expect(fn).toContain("eq(coachProfiles.published, true)");
  });
});

describe("對外型別不得挾帶自填職稱", () => {
  it("PublicCoach 沒有 title 欄位", () => {
    // 教練自填的職稱（「執行長」那種）是對內稱謂，Ray 2026/08/24 拍板不上官網。
    // 型別上直接不給，才不會有人 `{...coach}` 就把頭銜渲染出去。
    const t = SRC.split("export type PublicCoach = {")[1].split("};")[0];
    expect(t).not.toMatch(/^\s*title\s*:/m);
    expect(t).toContain("rankLabel: string | null;");
  });

  it("兩支公開查詢都不 select coaches.title", () => {
    for (const fn of ["listPublicCoaches", "getPublicCoach"]) {
      const body = SRC.split(`export async function ${fn}`)[1].split("\n}")[0];
      expect(body, fn).not.toContain("coaches.title");
    }
  });
});
