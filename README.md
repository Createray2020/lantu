# 嵐途 LAN TU · 全方位財務規劃

財務教練的客戶財務規劃系統：教練端管理多位客戶、每年重製一份完整規劃並持續檢視；客戶端檢視自己的規劃與報告。理解自己・做出選擇・走向未來。

## 技術棧
Next.js 16 (App Router) · TypeScript · Tailwind v4 · Neon (Postgres) · Drizzle ORM · Clerk · Vercel · 手機為主 PWA

> Next.js 16 將 `middleware` 更名為 `proxy`（見 `src/proxy.ts`）。動 Next 相關程式前先看 `node_modules/next/dist/docs/`。

## 結構（模組化單體，Contract/Internal 邊界由 dependency-cruiser 把關）
```
src/
  Shared/db/        資料層：schema（coaches/clients/plans/reviews/action_items/attachments/org_settings）+ Neon/Drizzle client
  lib/engine.ts     由 v12 單檔原型移植的財務引擎（純函式：比率/健康/缺口/退休/教育/金流/蒙地卡羅/稅務/KYC）
  proxy.ts          Clerk 授權（Next 16 Proxy）
  app/              landing・sign-in・sign-up・dashboard（P0 佔位，驗證引擎已接上）
```

## 資料模型（三層）
客戶 Client → 年度版本 Plan（每年一份，整份案件存 `data` jsonb）／諮詢 Review（掛客戶層時間軸，可標記對應版本）→ 動作 action_items。品牌設定 org_settings（後台上傳 Logo）。

## 開發
```bash
npm install
# 本機已附 .env.local（Neon DATABASE_URL 與 Clerk keys）
npm run db:generate   # 由 schema 產生 migration
npm run db:migrate    # 套用到 Neon
npm run dev
```

## 品質關卡
```bash
npm run test       # vitest（引擎測試）
npm run check      # lint + test + tsc --noEmit
npm run depcruise  # 模組邊界檢查
```

## 進度
- **P0（完成）**：骨架、Clerk 登入、Neon+Drizzle 七張表、引擎移植＋測試、production build 綠。
- P1 客戶管理三層（列表／客戶詳情三分頁／教練儀表板／年度重製／版本比較）。
- P2 規劃輸入與分析移植。P3 進階功能（一生金流表、情境模擬…）。P4 報告書品牌包裝。P5 PWA＋部署。
