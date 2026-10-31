import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 2026/11/01 Ray 回報：切深色後一點頭像就跳回淺色。
// 選單裡的切換鈕每次打開都重新掛載，不能拿頁面帶來的舊帳號值蓋掉本人剛選的。
for (const [file, setf] of [["ThemeToggle.tsx", "setTheme"], ["UiScaleToggle.tsx", "setScale"]] as const) {
  describe(`${file}：本人選過的值優先`, () => {
    const src = readFileSync(join(process.cwd(), "src/components", file), "utf8");
    it("pick 會記下 picked", () => {
      expect(src).toMatch(/function pick\([^)]*\) \{\n\s*picked = v;/);
    });
    it("同步一律用 picked ?? initial，沒有直接拿 initial 蓋回", () => {
      expect(src).not.toContain(`if (persist) ${setf}(initial);`);
      expect(src.split(`if (persist) ${setf}(picked ?? initial);`).length - 1).toBe(2);
    });
  });
}
