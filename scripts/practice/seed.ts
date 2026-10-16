// 把 scripts/practice/built.json 寫進 Ray 名下，成為一位真實客戶（會發客戶編號）。
//
//   npx tsx scripts/practice/seed.ts
//
// 冪等：Ray 名下同名、tag 含「練習用」的舊客戶先刪再寫（plans CASCADE）。只碰 Ray 自己的列。
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { and, arrayContains, eq, sql } from "drizzle-orm";
import * as schema from "../../src/Shared/db/schema";
import { planSnapshot } from "../../src/lib/snapshot";
import { formatCode, ymTaipei } from "../../src/lib/codes";

const { coaches, clients, plans, codeCounters } = schema;
const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
const OWNER_EMAIL = "createray2020@gmail.com";
const YEAR = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);

type Built = { key: string; name: string; label: string; lifeStage: string; data: any };

// 同 lib/codeAlloc.ts 的單語句 upsert（那支走 @/ alias，tsx 直接跑解析不到，所以這裡抄一份）。
async function allocClientCode(): Promise<string> {
  const ym = ymTaipei(new Date());
  const rows = await db.insert(codeCounters).values({ kind: "client", ym, lastSeq: 1 })
    .onConflictDoUpdate({ target: [codeCounters.kind, codeCounters.ym], set: { lastSeq: sql`${codeCounters.lastSeq} + 1` } })
    .returning({ seq: codeCounters.lastSeq });
  return formatCode("client", ym, rows[0]?.seq ?? 1);
}

async function main() {
  const [owner] = await db.select({ id: coaches.id, name: coaches.name }).from(coaches).where(eq(coaches.email, OWNER_EMAIL)).limit(1);
  if (!owner) throw new Error(`找不到 ${OWNER_EMAIL} 的教練列`);
  console.log(`掛在：${owner.name}（${owner.id}）`);

  const rows: Built[] = JSON.parse(readFileSync(join(process.cwd(), "scripts/practice/built.json"), "utf8"));
  for (const t of rows) {
    const del = await db.delete(clients)
      .where(and(eq(clients.coachId, owner.id), eq(clients.name, t.name), arrayContains(clients.tags, ["練習用"])))
      .returning({ id: clients.id, code: clients.code });
    if (del.length) console.log(`  先收掉舊的：${del.map((d) => d.code).join(", ")}`);

    const clientId = randomUUID();
    const snap = planSnapshot(t.data);
    const code = await allocClientCode();
    await db.batch([
      db.insert(clients).values({
        id: clientId, coachId: owner.id, name: t.name, contact: {}, source: "練習用",
        tags: (t.data.tags as string[]) ?? [], lifeStage: t.lifeStage, status: "active",
        birthDate: t.data.profile?.birth || null, code,
      }),
      db.insert(plans).values({
        clientId, year: YEAR, track: "coach", label: `${YEAR} 初版`, status: "draft",
        basedOnDate: today, data: t.data, healthGrade: snap.healthGrade, netWorth: snap.netWorth,
      }),
    ]);
    console.log(`✓ ${t.name}　編號 ${code}　${snap.healthGrade}　淨值 ${Number(snap.netWorth).toLocaleString()}　id ${clientId}`);
  }
}
main();
