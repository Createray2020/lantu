// build.mjs（TPL_DIR=scripts/practice）的第一步：攤成純 JSON。不要單獨執行。
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATES } from "./case";

const rows = TEMPLATES.map((t) => ({
  key: t.key, name: t.name, label: t.label, lifeStage: t.lifeStage, data: t.build(), walk: (t as { walk?: string[] }).walk ?? [],
}));
writeFileSync(join(process.cwd(), "scripts/practice/raw.json"), JSON.stringify(rows));
console.log(`raw.json：${rows.length} 份`);
