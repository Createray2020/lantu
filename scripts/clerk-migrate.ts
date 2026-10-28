// Clerk 開發實例 → 正式實例 搬遷腳本（2026/10/28）
//
// 背景：coaches.id 與 client_users.id 直接是 Clerk userId，換 Clerk 實例後每個人會拿到新 id，
// 所以不是叫大家重新註冊，而是「在正式實例建同一批人 → 拿到新舊 id 對照 → 一個交易把資料庫全部改掉」。
//
// 用法（依序）：
//   npx tsx scripts/clerk-migrate.ts export              # 讀 dev 實例所有使用者 → scripts/tmp/clerk-users.json
//   npx tsx scripts/clerk-migrate.ts create              # 在 prod 實例建人（冪等）→ scripts/tmp/idmap.json
//   npx tsx scripts/clerk-migrate.ts remap --dry-run     # 只印：每張表會改幾筆、對不上的 id、沒接到的欄位
//   npx tsx scripts/clerk-migrate.ts remap --rehearse    # 走完整個真寫路徑＋事後對照，最後 rollback（彩排）
//   npx tsx scripts/clerk-migrate.ts remap --apply       # 真寫（單一交易；失敗整包回滾）
//
// 環境變數：
//   CLERK_SECRET_KEY        dev 實例（.env.local 既有）
//   CLERK_PROD_SECRET_KEY   prod 實例（當天放進 .env.local 或 shell export）
//   DATABASE_URL            Neon（.env.local 既有）
//
// 注意：
//   - scripts/tmp/ 在 .gitignore 裡，匯出的使用者清單不會進 repo。
//   - remap --apply 之前一定要先備份（docs/clerk-production-cutover.md 有指令）。
//   - 對不上 idmap 的 DB 列（示範帳號、已在 Clerk 刪掉的人）維持原樣不動，會列在報告裡。

/* eslint-disable @typescript-eslint/no-explicit-any */ // Clerk API 回應是鬆散 JSON，跟 seed-*.ts 同做法
import { config } from "dotenv";
config({ path: ".env.local" });
import { Pool } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const TMP = path.join(process.cwd(), "scripts", "tmp");
const USERS_FILE = path.join(TMP, "clerk-users.json");
const IDMAP_FILE = path.join(TMP, "idmap.json");
const CLERK_API = "https://api.clerk.com/v1";

type ExportedUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  google: boolean;
  password: boolean;
  lastSignInAt: number | null;
};

function die(msg: string): never { console.error(`✗ ${msg}`); process.exit(1); }

async function clerk(secret: string, method: string, p: string, body?: unknown): Promise<any> {
  const res = await fetch(`${CLERK_API}${p}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) throw new Error(`Clerk ${method} ${p} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

function primaryEmail(u: any): string {
  const hit = (u.email_addresses ?? []).find((e: any) => e.id === u.primary_email_address_id) ?? u.email_addresses?.[0];
  return (hit?.email_address ?? "").toLowerCase();
}

// ── export ─────────────────────────────────────────────────────────────────────
async function cmdExport() {
  const secret = process.env.CLERK_SECRET_KEY || die("缺 CLERK_SECRET_KEY（dev）");
  if (!secret.startsWith("sk_test_")) die("CLERK_SECRET_KEY 不是 dev 金鑰（應為 sk_test_…）——export 只能從 dev 實例讀");
  const out: ExportedUser[] = [];
  for (let offset = 0; ; offset += 100) {
    const page: any[] = await clerk(secret, "GET", `/users?limit=100&offset=${offset}&order_by=created_at`);
    for (const u of page) {
      out.push({
        id: u.id,
        email: primaryEmail(u),
        firstName: u.first_name ?? null,
        lastName: u.last_name ?? null,
        google: (u.external_accounts ?? []).some((a: any) => a.provider === "oauth_google"),
        password: !!u.password_enabled,
        lastSignInAt: u.last_sign_in_at ?? null,
      });
    }
    if (page.length < 100) break;
  }
  const noEmail = out.filter((u) => !u.email);
  if (noEmail.length) console.warn(`⚠ ${noEmail.length} 人沒有 email，無法搬：${noEmail.map((u) => u.id).join(", ")}`);
  const dupEmail = out.map((u) => u.email).filter((e, i, a) => e && a.indexOf(e) !== i);
  if (dupEmail.length) die(`同一 email 出現多次（prod 會撞）：${[...new Set(dupEmail)].join(", ")}`);
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(out, null, 2));
  console.log(`✓ 匯出 ${out.length} 人 → ${path.relative(process.cwd(), USERS_FILE)}`);
  console.log(`  Google 登入 ${out.filter((u) => u.google).length}、密碼登入 ${out.filter((u) => u.password).length}（密碼不會搬，請他們登入時按「忘記密碼」）`);
}

// ── create ─────────────────────────────────────────────────────────────────────
async function cmdCreate() {
  const secret = process.env.CLERK_PROD_SECRET_KEY || die("缺 CLERK_PROD_SECRET_KEY（prod）");
  if (!secret.startsWith("sk_live_")) die("CLERK_PROD_SECRET_KEY 不是正式金鑰（應為 sk_live_…）");
  if (!fs.existsSync(USERS_FILE)) die("先跑 export");
  const users: ExportedUser[] = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  const idmap: Record<string, string> = fs.existsSync(IDMAP_FILE) ? JSON.parse(fs.readFileSync(IDMAP_FILE, "utf8")) : {};
  let created = 0, reused = 0, skipped = 0;
  for (const u of users) {
    if (!u.email) { skipped++; continue; }
    if (idmap[u.id]) { reused++; continue; }
    // 冪等：prod 已有同 email 就直接取用（例如上次跑到一半）
    const existing: any[] = await clerk(secret, "GET", `/users?email_address=${encodeURIComponent(u.email)}&limit=1`);
    if (existing.length) {
      idmap[u.id] = existing[0].id; reused++;
    } else {
      const made = await clerk(secret, "POST", "/users", {
        email_address: [u.email],
        first_name: u.firstName ?? undefined,
        last_name: u.lastName ?? undefined,
        skip_password_requirement: true,
        skip_password_checks: true,
        external_id: u.id, // 留舊 id 當線索，之後查 Clerk 後台對得回來
      });
      idmap[u.id] = made.id; created++;
    }
    fs.writeFileSync(IDMAP_FILE, JSON.stringify(idmap, null, 2)); // 每筆就存，中斷可續跑
    console.log(`  ${u.email}  ${u.id} → ${idmap[u.id]}`);
  }
  console.log(`✓ 新建 ${created}、沿用 ${reused}、略過（無 email）${skipped} → ${path.relative(process.cwd(), IDMAP_FILE)}`);
}

// ── remap ──────────────────────────────────────────────────────────────────────
type FkRef = { constraint: string; table: string; column: string; refTable: "coaches" | "client_users" };

// 不是外鍵、但存了 Clerk id 的欄位（偵察 2026/10/28 schema.ts 得出）
const JSONB_TARGETS: { table: string; column: string; kind: "arr_coachId" | "str_arr" }[] = [
  { table: "acct_receipts", column: "sharers", kind: "arr_coachId" }, // [{name, coachId}]
  { table: "acct_receipts", column: "allocs", kind: "arr_coachId" },  // [{to, v, mode, label, coachId}]
  { table: "doc_tasks", column: "target_coach_ids", kind: "str_arr" }, // ["user_…"]
];
const PLAIN_TARGETS: { table: string; column: string }[] = [
  { table: "comp_surveys", column: "submitter_id" },
  // 下面五個是 2026/10/28 dry-run 的安全網掃出來的（純 text 欄、單一 id、沒外鍵）
  { table: "acct_receipts", column: "entered_by" },
  { table: "client_notes", column: "author_id" },
  { table: "notifications", column: "recipient_id" },   // coaches.id 或 client_users.id
  { table: "plan_revisions", column: "editor_id" },
  { table: "service_case_log", column: "actor_id" },
];

async function cmdRemap(mode: "dry-run" | "rehearse" | "apply") {
  const apply = mode !== "dry-run";
  const url = process.env.DATABASE_URL || die("缺 DATABASE_URL");
  if (!fs.existsSync(IDMAP_FILE)) die("先跑 create");
  const idmap: Record<string, string> = JSON.parse(fs.readFileSync(IDMAP_FILE, "utf8"));
  const pairs = Object.entries(idmap);
  if (!pairs.length) die("idmap 是空的");

  const pool = new Pool({ connectionString: url });
  const c = await pool.connect();
  const q = async (text: string, params?: unknown[]) => (await c.query(text, params)).rows;

  try {
    // 整段（含 dry-run）都在同一個交易裡：DATABASE_URL 是 Neon 的 -pooler 端點（pgbouncer transaction mode），
    // 交易外的連續語句可能落到不同後端，temp table 會憑空消失。dry-run 最後 rollback、apply 才 commit。
    await q("begin");
    // 1) 動態抓所有指向 coaches.id / client_users.id 的外鍵
    const fks: FkRef[] = (await q(`
      select tc.constraint_name as constraint, tc.table_name as table, kcu.column_name as column, ccu.table_name as ref_table
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
        and ccu.table_name in ('coaches','client_users') and ccu.column_name = 'id'
      order by tc.table_name, kcu.column_name`)).map((r: any) => ({ constraint: r.constraint, table: r.table, column: r.column, refTable: r.ref_table }));
    console.log(`外鍵：${fks.length} 條指向 coaches.id / client_users.id`);

    await q(`create temp table id_map(old text primary key, new text not null unique) on commit drop`);
    await q(`insert into id_map select * from unnest($1::text[], $2::text[])`, [pairs.map((p) => p[0]), pairs.map((p) => p[1])]);

    // 2) 範圍報告
    console.log("\n── 主表 ──");
    for (const t of ["coaches", "client_users"] as const) {
      const [{ total, matched }] = await q(`select count(*)::int total, count(m.new)::int matched from ${t} left join id_map m on m.old = ${t}.id`);
      const orphans = await q(`select ${t}.id, ${t}.email from ${t} left join id_map m on m.old = ${t}.id where m.new is null order by 2`);
      console.log(`${t}: ${total} 筆，對得上 ${matched}，對不上 ${total - matched}${orphans.length ? "：" : ""}`);
      for (const o of orphans) console.log(`    - ${o.id}  ${o.email ?? ""}  （維持原樣，不動）`);
    }
    console.log("\n── 外鍵欄 ──");
    let fkRows = 0;
    for (const f of fks) {
      const [{ n }] = await q(`select count(*)::int n from ${f.table} t join id_map m on m.old = t.${f.column}`);
      if (n) { console.log(`${f.table}.${f.column} → ${n} 筆`); fkRows += n; }
    }
    console.log(`外鍵欄合計 ${fkRows} 筆`);
    console.log("\n── 非外鍵欄 ──");
    for (const p of PLAIN_TARGETS) {
      const [{ n }] = await q(`select count(*)::int n from ${p.table} t join id_map m on m.old = t.${p.column}`);
      console.log(`${p.table}.${p.column} → ${n} 筆`);
    }
    for (const j of JSONB_TARGETS) {
      const [{ n }] = await q(`select count(*)::int n from ${j.table} where exists (select 1 from id_map m where ${j.column}::text like '%' || m.old || '%')`);
      console.log(`${j.table}.${j.column}（jsonb）→ ${n} 筆`);
    }

    // 3) 安全網：掃所有 text/jsonb 欄位，找還有舊 id 卻沒被上面接住的欄位
    console.log("\n── 安全網掃描（舊 id 出現在沒處理的欄位）──");
    const handled = new Set([
      ...fks.map((f) => `${f.table}.${f.column}`),
      ...PLAIN_TARGETS.map((p) => `${p.table}.${p.column}`),
      ...JSONB_TARGETS.map((j) => `${j.table}.${j.column}`),
      "coaches.id", "client_users.id",
    ]);
    const cols = await q(`select table_name, column_name, data_type from information_schema.columns
      where table_schema='public' and data_type in ('text','character varying','jsonb','json') order by 1,2`);
    let leaks = 0;
    for (const col of cols) {
      const key = `${col.table_name}.${col.column_name}`;
      if (handled.has(key)) continue;
      let n = 0;
      try {
        [{ n }] = await q(`select count(*)::int n from "${col.table_name}" where exists (select 1 from pg_temp.id_map m where "${col.column_name}"::text like '%' || m.old || '%')`);
      } catch (e) { throw new Error(`掃描 ${key} 失敗：${(e as Error).message}`); }
      if (n) { console.log(`⚠ ${key} 有 ${n} 筆含舊 id，腳本沒處理——先看是什麼再決定`); leaks++; }
    }
    if (!leaks) console.log("乾淨，沒有漏網欄位");

    if (!apply) { await q("rollback"); console.log("\n（dry-run，未寫入）"); return; }
    if (leaks) { await q("rollback"); die("有漏網欄位，先處理再 --apply"); }

    // 4) 真寫
    console.log("\n── 寫入 ──");
    try {
      for (const f of fks) await q(`alter table ${f.table} alter constraint ${f.constraint} deferrable initially deferred`);
      await q(`set constraints all deferred`);

      for (const t of ["coaches", "client_users"]) {
        const r = await c.query(`update ${t} set id = m.new from id_map m where m.old = ${t}.id`);
        console.log(`${t}.id 改 ${r.rowCount} 筆`);
      }
      for (const f of fks) {
        const r = await c.query(`update ${f.table} t set ${f.column} = m.new from id_map m where m.old = t.${f.column}`);
        if (r.rowCount) console.log(`${f.table}.${f.column} 改 ${r.rowCount} 筆`);
      }
      for (const p of PLAIN_TARGETS) {
        const r = await c.query(`update ${p.table} t set ${p.column} = m.new from id_map m where m.old = t.${p.column}`);
        console.log(`${p.table}.${p.column} 改 ${r.rowCount} 筆`);
      }
      for (const j of JSONB_TARGETS) {
        const sql = j.kind === "str_arr"
          ? `update ${j.table} set ${j.column} = (select coalesce(jsonb_agg(coalesce(m.new, e)), '[]'::jsonb) from jsonb_array_elements_text(${j.column}) e left join id_map m on m.old = e)
             where exists (select 1 from id_map m where ${j.column}::text like '%' || m.old || '%')`
          : `update ${j.table} set ${j.column} = (select coalesce(jsonb_agg(case when m.new is not null then e || jsonb_build_object('coachId', m.new) else e end), '[]'::jsonb)
               from jsonb_array_elements(${j.column}) e left join id_map m on m.old = e->>'coachId')
             where exists (select 1 from id_map m where ${j.column}::text like '%' || m.old || '%')`;
        const r = await c.query(sql);
        console.log(`${j.table}.${j.column} 改 ${r.rowCount} 筆`);
      }

      await q(`set constraints all immediate`); // 這裡就會驗外鍵，有錯直接丟出去回滾
      for (const f of fks) await q(`alter table ${f.table} alter constraint ${f.constraint} not deferrable`);

      // 5) 事後對照（commit 前做，彩排模式也看得到）
      const [{ n: leftover }] = await q(`select count(*)::int n from (select id from coaches union all select id from client_users) x where x.id = any($1::text[])`, [pairs.map((p) => p[0])]);
      const [{ n: moved }] = await q(`select count(*)::int n from (select id from coaches union all select id from client_users) x where x.id = any($1::text[])`, [pairs.map((p) => p[1])]);
      const [{ n: jsonLeft }] = await q(`select count(*)::int n from acct_receipts r where exists (
        select 1 from id_map m where m.old in (select e->>'coachId' from jsonb_array_elements(coalesce(r.sharers,'[]')) e)
                                   or m.old in (select e->>'coachId' from jsonb_array_elements(coalesce(r.allocs,'[]')) e))`);
      console.log(`\n事後檢查：主表已換成新 id ${moved} 筆、還留舊 id ${leftover} 筆（應等於「對不上」）、jsonb 還含舊 id ${jsonLeft} 筆（應為 0）`);

      if (mode === "rehearse") { await q("rollback"); console.log("\n（彩排：已 rollback，未寫入）"); return; }
      await q("commit");
      console.log("\n✓ 已提交");
    } catch (e) {
      await q("rollback");
      throw e;
    }
  } catch (e) {
    try { await q("rollback"); } catch { /* 已回滾 */ }
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

// ── main ───────────────────────────────────────────────────────────────────────
const [cmd, flag] = process.argv.slice(2);
(async () => {
  if (cmd === "export") await cmdExport();
  else if (cmd === "create") await cmdCreate();
  else if (cmd === "remap") {
    if (flag !== "--dry-run" && flag !== "--rehearse" && flag !== "--apply") die("remap 要帶 --dry-run、--rehearse 或 --apply");
    await cmdRemap(flag.slice(2) as "dry-run" | "rehearse" | "apply");
  } else die("用法：export | create | remap --dry-run | remap --rehearse | remap --apply");
})().catch((e) => { console.error(e); process.exit(1); });
