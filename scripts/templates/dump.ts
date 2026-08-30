// build.mjs 的第一步：把 cases.ts（TypeScript ＋ 引擎 import）攤成純 JSON，
// 讓瀏覽器那一段拿得到。不要直接執行這支，跑 build.mjs 就好。
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATES } from "./cases";

const rows = TEMPLATES.map((t) => ({
  key: t.key, name: t.name, label: t.label, lifeStage: t.lifeStage, data: t.build(),
}));
writeFileSync(join(process.cwd(), "scripts/templates/raw.json"), JSON.stringify(rows));
console.log(`raw.json：${rows.length} 份`);
