import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, it, expect } from "vitest";

/**
 * 全站 logo 一律走 BrandMark（讀後台上傳的品牌 icon）。
 * 2026/09/25 以前 12 個地方各自寫死一份「L＋弧線」SVG，後台換 logo 官網左上角卻不會跟著換。
 */
describe("品牌標誌不可再寫死", () => {
  it("src 內不再出現舊的 48×48 手繪 logo", () => {
    const hits = execSync(`grep -rln --exclude=brandMark.test.ts 'viewBox="0 0 48 48"' src || true`, { encoding: "utf8" }).trim();
    expect(hits, "改用 <BrandMark />").toBe("");
  });

  it("BrandMark 讀的是品牌 icon 路由", () => {
    const src = readFileSync(new URL("../components/BrandMark.tsx", import.meta.url), "utf8");
    expect(src).toContain('src="/api/brand/icon"');
  });
});
