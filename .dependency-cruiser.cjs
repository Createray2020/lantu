/** 模組化單體邊界防護（對齊 finance-closed-loop 慣例）。 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "禁止循環依賴。",
      from: {},
      to: { circular: true },
    },
    {
      name: "shared-no-app-deps",
      severity: "error",
      comment: "Shared 不可依賴 app（業務/頁面層）。",
      from: { path: "^src/Shared" },
      to: { path: "^src/app" },
    },
    {
      name: "engine-is-pure",
      severity: "error",
      comment: "lib/engine 為純函式，不可依賴 db / app / clerk。",
      // 測試檔不在此限：漂移測試的工作就是拿引擎的輸出去對 app 層的標籤，
      // 兩邊都要 import 才對得起來。規則要管的是「正式程式碼裡的引擎」。
      from: { path: "^src/lib/engine", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/(Shared/db|app)|@clerk" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
