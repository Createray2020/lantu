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
      from: { path: "^src/lib/engine" },
      to: { path: "^src/(Shared/db|app)|@clerk" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
