// 2026/10/28 一次性：把三份培訓範本（報名契約、個資同意書、保密同意書）裡的空白線「＿＿」與「□」
// 換成自動帶入欄位／系統勾選欄／本人確認項／簽名位，各存成**新版本**（舊版列不動）。
// 之後要調，直接在 /admin/docs 的編輯器改即可；這支只是替 Ray 省下第一次手工替換。
//
// 跑法：DATABASE_URL 在 .env.local；`npx tsx scripts/docs-rewrite-training-templates.ts`（加 --dry 只印不寫）。
// 冪等：同一個 key 的最新版若已含 {{doc.no}} 或 {{ask: 就跳過。
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import { validateTemplate, type DocAsk, type DocSignerSlot } from "../src/lib/docs";

const env = fs.readFileSync(".env.local", "utf8");
const url = /DATABASE_URL=["']?([^"'\n]+)/.exec(env)?.[1];
if (!url) throw new Error("no DATABASE_URL");
const sql = neon(url);
const dry = process.argv.includes("--dry");

type Row = { id: string; key: string; version: number; name: string; html: string; category: string; use_seal: boolean; required: boolean; sign_days: number | null; signers: DocSignerSlot[]; note: string; item_ids: string[] };

const ADULT: DocAsk = { key: "adult", label: "本人確認已年滿 18 歲，且具完全行為能力（未受監護或輔助宣告）", kind: "must", role: "member" };

/** 每份範本：名稱關鍵字 → 替換規則與確認項 */
const PLANS: { match: RegExp; asks: DocAsk[]; rep: [string, string][] }[] = [
  {
    match: /培訓報名契約/,
    asks: [
      { key: "replay", label: "同意於報名完成後立即開通課程回放（數位內容，依法可能不適用 7 天解除權）", kind: "opt", role: "member" },
      { key: "reviewed", label: "本人確認已於簽約前取得本契約全文，並經 3 日以上之合理期間審閱", kind: "must", role: "member" },
      ADULT,
    ],
    rep: [
      ["合約編號：＿＿＿＿＿＿＿＿", "合約編號：{{doc.no}}"],
      ["姓名＿＿＿＿＿＿ 教練編號＿＿＿＿＿＿", "姓名 {{ref.name}}　教練編號 {{ref.code}}"],
      ["□ 匯款一次付清，匯入甲方指定之公司帳戶 □ 信用卡，一次付清 □ 零卡分期", "{{pay.is_bank}} 匯款一次付清，匯入甲方指定之公司帳戶　{{pay.is_card}} 信用卡，一次付清　{{pay.is_zero}} 零卡分期"],
      ["□ 嵐途說明會（日期：＿＿＿＿＿＿）", "{{brief.is_meeting}} 嵐途說明會（日期：{{brief.date}}）"],
      ["□ 嵐途公版介紹內容（版本：＿＿＿＿＿＿）", "{{brief.is_public}} 嵐途公版介紹內容（版本：{{brief.version}}）"],
      ["<p>□ 乙方同意甲方於報名完成後立即開通課程回放", "<p>{{ask:replay}} 乙方同意甲方於報名完成後立即開通課程回放"],
      ["<p>□ 二、乙方確認已於簽約前取得本契約全文", "<p>{{ask:reviewed}} 二、乙方確認已於簽約前取得本契約全文"],
      ["<p>□ 乙方已於＿＿年＿＿月＿＿日參加甲方說明會", "<p>{{enroll.is_resign}} 乙方已於 {{enroll.resign_date}} 參加甲方說明會"],
      ["乙方：{{member.name}}　簽名：＿＿＿＿＿＿", "乙方：{{member.name}}　簽名：{{sign:member:1}}"],
      ["<p>□ 乙方確認已年滿18歲，且具完全行為能力（未受監護或輔助宣告）。</p>", "<p>{{ask:adult}} 乙方確認已年滿18歲，且具完全行為能力（未受監護或輔助宣告）。</p>"],
      ["身分證字號或護照號碼：＿＿＿＿＿＿＿＿", "身分證字號或護照號碼：{{member.id_no}}"],
      ["電話：＿＿＿＿＿＿＿＿　Email：＿＿＿＿＿＿＿＿", "電話：{{member.phone}}　Email：{{member.email}}"],
      ["通訊地址：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿", "通訊地址：{{member.address}}"],
      ["發票開立方式：□ 個人（雲端發票載具：＿＿＿＿＿＿） □ 公司（統一編號：＿＿＿＿＿＿ 抬頭：＿＿＿＿＿＿）", "發票開立方式：{{member.invoice_is_personal}} 個人（雲端發票載具：{{member.invoice_carrier}}）　{{member.invoice_is_company}} 公司（統一編號：{{member.invoice_tax_id}}　抬頭：{{member.invoice_title}}）"],
      ["簽約日期：線上簽署時由系統自動記錄", "產生日期：{{today}}　簽約日期：{{sign.date}}"],
    ],
  },
  {
    match: /個人資料蒐集/,
    asks: [
      { key: "marketing", label: "本人同意本公司寄送課程、講座及活動資訊", kind: "opt", role: "member" },
      { key: "privacy", label: "本人已詳閱並瞭解上述告知事項，同意本公司依上述範圍蒐集、處理及利用本人之個人資料", kind: "must", role: "member" },
      ADULT,
    ],
    rep: [
      ["<p>□ 本人同意本公司寄送課程、講座及活動資訊。（選勾）</p>", "<p>{{ask:marketing}} 本人同意本公司寄送課程、講座及活動資訊。（選勾）</p>"],
      ["【同意聲明】□ 本人已詳閱", "【同意聲明】{{ask:privacy}} 本人已詳閱"],
      ["立同意書人：{{member.name}}（簽名）", "立同意書人：{{member.name}}　簽名：{{sign:member:1}}"],
      ["身分：□ 實習教練（INTERN） □ 合作教練（PARTNER） □ 報聘教練", "身分：{{member.is_intern}} 實習教練（INTERN）　{{member.is_partner}} 合作教練（PARTNER）　{{member.is_hired}} 報聘教練"],
      ["<p>□ 本人確認已年滿18歲，且具完全行為能力（未受監護或輔助宣告）。</p>", "<p>{{ask:adult}} 本人確認已年滿18歲，且具完全行為能力（未受監護或輔助宣告）。</p>"],
      ["日期：線上簽署時由系統自動記錄", "產生日期：{{today}}　簽署日期：{{sign.date}}"],
    ],
  },
  {
    match: /保密暨個人資料保護/,
    asks: [],
    rep: [
      ["乙方自＿＿年＿＿月＿＿日（開始參與培訓、實習或合作日）", "乙方自 {{enroll.date}}（開始參與培訓、實習或合作日）"],
      ["乙方：{{member.name}}　簽名：＿＿＿＿＿＿", "乙方：{{member.name}}　簽名：{{sign:member:1}}"],
      ["身分：□ 實習教練（INTERN） □ 合作教練（PARTNER） □ 報聘教練", "身分：{{member.is_intern}} 實習教練（INTERN）　{{member.is_partner}} 合作教練（PARTNER）　{{member.is_hired}} 報聘教練"],
      ["身分證字號或護照號碼：＿＿＿＿＿＿＿＿", "身分證字號或護照號碼：{{member.id_no}}"],
      ["電話：＿＿＿＿＿＿＿＿　Email：＿＿＿＿＿＿＿＿", "電話：{{member.phone}}　Email：{{member.email}}"],
      ["簽署日期：線上簽署時由系統自動記錄", "產生日期：{{today}}　簽署日期：{{sign.date}}"],
    ],
  },
];

async function main() {
const rows = (await sql`select distinct on (key) id,key,version,name,html,category,use_seal,required,sign_days,signers,note,item_ids from doc_templates where category='training' and archived_at is null order by key, version desc`) as Row[];
for (const r of rows) {
  const plan = PLANS.find((p) => p.match.test(r.name));
  if (!plan) { console.log(`skip（沒有規則）: ${r.name}`); continue; }
  if (/\{\{doc\.no\}\}|\{\{ask:/.test(r.html)) { console.log(`skip（已轉換）: ${r.name} v${r.version}`); continue; }
  let html = r.html;
  const miss: string[] = [];
  for (const [from, to] of plan.rep) {
    if (!html.includes(from)) { miss.push(from.slice(0, 30)); continue; }
    html = html.split(from).join(to);
  }
  const t = { key: r.key, category: r.category as "training", name: r.name, html, useSeal: r.use_seal, required: r.required, signDays: r.sign_days, signers: r.signers, asks: plan.asks, itemIds: r.item_ids ?? [], note: r.note };
  const errs = validateTemplate(t);
  console.log(`${r.name} v${r.version} → v${r.version + 1}：替換 ${plan.rep.length - miss.length}/${plan.rep.length}${miss.length ? `，沒找到：${miss.join(" | ")}` : ""}${errs.length ? `，驗證錯誤：${errs.join("；")}` : ""}`);
  if (errs.length || dry) continue;
  await sql`insert into doc_templates (key, version, category, name, html, use_seal, required, sign_days, signers, asks, item_ids, enabled, note, created_by)
    values (${r.key}, ${r.version + 1}, ${r.category}, ${r.name}, ${html}, ${r.use_seal}, ${r.required}, ${r.sign_days}, ${JSON.stringify(r.signers)}::jsonb, ${JSON.stringify(plan.asks)}::jsonb, ${JSON.stringify(r.item_ids ?? [])}::jsonb, true, ${r.note}, null)`;
  console.log("  ✓ 已存新版本");
}
}
main().catch((e) => { console.error(e); process.exit(1); });
