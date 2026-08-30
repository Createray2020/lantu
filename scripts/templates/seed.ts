// 步驟 2：把 built.json 寫進資料庫成為共用示範範本。
//
//   npx tsx scripts/templates/seed.ts
//
// ⚠️ 冪等：同名的舊範本先刪再寫（plans 跟著 CASCADE），重跑不會長出第二份「雙薪育兒家庭」。
// ⚠️ WHERE 一律帶 is_template：這支只准碰範本那幾列。少了它，一個同名的真實客戶
//    就會連同他所有規劃被刪掉——而且沒有任何人會發現。
// ⚠️ 不發客戶編號（code 留 null）。範本不是客戶：發了會吃掉當月的一個流水號，
//    而且那個號會印在報告書表頭上，客戶會看到一組不屬於自己的編號。
//    完整理由見 src/lib/templates.ts 的 createTemplate()。
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../src/Shared/db/schema";
import { planSnapshot } from "../../src/lib/snapshot";

const { clients, plans } = schema;
const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

const YEAR = 2026;
const today = new Date().toISOString().slice(0, 10);

type Built = { key: string; name: string; label: string; lifeStage: string; data: any };

async function main() {
  const rows: Built[] = JSON.parse(
    readFileSync(join(process.cwd(), "scripts/templates/built.json"), "utf8"),
  );

  for (let i = 0; i < rows.length; i++) {
    const t = rows[i];
    // 舊的同名範本先收掉。只刪 is_template 的列。
    await db.delete(clients).where(and(eq(clients.isTemplate, true), eq(clients.name, t.name)));

    const snap = planSnapshot(t.data);
    const [row] = await db
      .insert(clients)
      .values({
        coachId: null,
        clientUserId: null,
        name: t.name,
        contact: {},
        source: "示範範本",
        tags: (t.data.tags as string[]) ?? [],
        lifeStage: t.lifeStage,
        status: "active",
        birthDate: t.data.profile?.birth || null,
        code: null,
        isTemplate: true,
        templateLabel: t.label,
        templateOrder: i,
      })
      .returning({ id: clients.id });

    await db.insert(plans).values({
      clientId: row.id,
      year: YEAR,
      track: "coach",
      label: `${YEAR} 示範版`,
      status: "draft",
      basedOnDate: today,
      data: t.data,
      healthGrade: snap.healthGrade,
      netWorth: snap.netWorth,
    });
    console.log(`✓ ${t.name}　${snap.healthGrade}　淨值 ${Number(snap.netWorth).toLocaleString()}`);
  }

  // 收尾檢查：範本身上不該有任何租戶欄位，否則它就不只是「大家共用的那一份」了。
  const all = await db.select().from(clients).where(eq(clients.isTemplate, true));
  const dirty = all.filter((c) => c.coachId || c.clientUserId || c.code);
  if (dirty.length) {
    console.error("⚠️ 有範本帶著租戶欄位：", dirty.map((c) => c.name));
    process.exit(1);
  }
  const ids = all.map((c) => c.id);
  const ps = ids.length ? await db.select({ clientId: plans.clientId }).from(plans).where(inArray(plans.clientId, ids)) : [];
  console.log(`\n範本 ${all.length} 份、規劃 ${ps.length} 份。`);
}

main();
