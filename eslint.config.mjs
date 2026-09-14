import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ⚠️ 裝置端的殼層不能 rm，所以要刪的東西是「mv 到 _to_delete/」等人工清掉。
    //    裡面躺著一整份舊的 .next（_to_delete/.next_old_20260909），
    //    eslint 照樣會去 lint 它 —— 1086 個 error 全部出自那裡，
    //    等於 `npm run check` 從那天起就永遠是紅的、蓋掉真正的錯。
    "_to_delete/**",
  ]),
]);

export default eslintConfig;
