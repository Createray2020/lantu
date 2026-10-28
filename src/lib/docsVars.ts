// 範本可用的欄位目錄：後台編輯器列給人看、預覽用示範值、啟動時由各消費者（培訓／顧問服務）組出真值。
// ⚠️ 加欄位時三處一起改：這裡的目錄、對應消費者的 buildVars、預覽示範值。
//
// 2026/10/28 Ray：「合約欄位大部分都要自動帶入，簽約人只需要簽名」。欄位分四組：
//   person  申請人／簽約人自己填一次的簽約資料（signer_profiles）
//   admin   行政確認或系統算出來的（推薦教練、付款方式、說明會、報名日、合約編號）
//   check   ☑／☐ 勾選欄——系統依資料替你打勾（key 一律 xxx.is_yyy）
//   base    文件本身（名稱、日期、條款、公司）
// 「本人確認項」（年滿 18、同意行銷…）不在這裡：那是簽署人自己作答的 {{ask:key}}，定義住範本 asks。
import { E_SIGN_CLAUSE, SIGN_DATE_KEY, type DocCategory, type DocVars } from "./docs";

export type VarGroup = "base" | "person" | "admin" | "check";
export const VAR_GROUP_LABEL: Record<VarGroup, string> = { base: "文件", person: "簽約人資料", admin: "行政／系統", check: "勾選欄（自動打勾）" };
export type VarDef = { key: string; label: string; for: DocCategory[] | "all"; group: VarGroup; need?: "person" | "admin" };

export const VAR_CATALOG: VarDef[] = [
  // 文件
  { key: "title", label: "文件名稱", for: "all", group: "base" },
  { key: "today", label: "產生日期", for: "all", group: "base" },
  { key: SIGN_DATE_KEY, label: "簽署日期（簽完才帶入）", for: "all", group: "base" },
  { key: "doc.no", label: "合約編號", for: "all", group: "base" },
  { key: "doc.expires", label: "簽署期限", for: "all", group: "base" },
  { key: "esign_clause", label: "電子簽署條款（固定句）", for: "all", group: "base" },
  { key: "company.name", label: "公司名稱（品牌設定）", for: "all", group: "base" },
  { key: "item.name", label: "方案名稱（營業項目）", for: "all", group: "base" },
  { key: "item.price", label: "方案定價", for: "all", group: "base" },
  { key: "case.amount", label: "本案應收金額", for: "all", group: "base" },
  // 培訓：成員／申請人
  { key: "member.name", label: "成員／申請人姓名", for: ["training"], group: "person" },
  { key: "member.email", label: "成員 Email", for: ["training"], group: "person", need: "person" },
  { key: "member.phone", label: "成員電話", for: ["training"], group: "person", need: "person" },
  { key: "member.id_no", label: "成員身分證／護照號碼", for: ["training"], group: "person", need: "person" },
  { key: "member.birth", label: "成員出生日期", for: ["training"], group: "person", need: "person" },
  { key: "member.address", label: "成員通訊地址", for: ["training"], group: "person", need: "person" },
  { key: "member.invoice", label: "發票方式（一句話）", for: ["training"], group: "person", need: "person" },
  { key: "member.invoice_carrier", label: "雲端發票載具", for: ["training"], group: "person" },
  { key: "member.invoice_tax_id", label: "發票統一編號", for: ["training"], group: "person" },
  { key: "member.invoice_title", label: "發票抬頭", for: ["training"], group: "person" },
  { key: "member.code", label: "成員教練編號（已發號才有）", for: ["training"], group: "person" },
  { key: "member.kind", label: "成員身分（實習／合作／報聘）", for: ["training"], group: "admin" },
  // 培訓：行政／系統
  { key: "ref.name", label: "推薦教練姓名", for: ["training"], group: "admin" },
  { key: "ref.code", label: "推薦教練編號", for: ["training"], group: "admin" },
  { key: "pay.method", label: "付款方式（依已確認收款）", for: ["training"], group: "admin" },
  { key: "pay.date", label: "付款日期", for: ["training"], group: "admin" },
  { key: "brief.date", label: "說明會日期", for: ["training"], group: "admin", need: "admin" },
  { key: "brief.version", label: "公版介紹版本", for: ["training"], group: "admin", need: "admin" },
  { key: "enroll.date", label: "報名日（送出申請日）", for: ["training"], group: "admin" },
  { key: "enroll.resign_date", label: "補簽：原報名日", for: ["training"], group: "admin" },
  // 培訓：勾選欄
  { key: "pay.is_bank", label: "付款：匯款一次付清", for: ["training"], group: "check" },
  { key: "pay.is_card", label: "付款：信用卡一次付清", for: ["training"], group: "check" },
  { key: "pay.is_zero", label: "付款：零卡分期", for: ["training"], group: "check" },
  { key: "brief.is_meeting", label: "說明：嵐途說明會", for: ["training"], group: "check" },
  { key: "brief.is_public", label: "說明：公版介紹內容", for: ["training"], group: "check" },
  { key: "member.is_intern", label: "身分：實習教練", for: ["training"], group: "check" },
  { key: "member.is_partner", label: "身分：合作教練", for: ["training"], group: "check" },
  { key: "member.is_hired", label: "身分：報聘教練", for: ["training"], group: "check" },
  { key: "member.invoice_is_personal", label: "發票：個人", for: ["training"], group: "check" },
  { key: "member.invoice_is_company", label: "發票：公司", for: ["training"], group: "check" },
  { key: "enroll.is_resign", label: "已報名者之補簽", for: ["training"], group: "check" },
  // 顧問服務
  { key: "case.no", label: "案件編號", for: ["client_service"], group: "base" },
  { key: "case.from", label: "服務起日", for: ["client_service"], group: "base" },
  { key: "case.to", label: "服務迄日", for: ["client_service"], group: "base" },
  { key: "coach.name", label: "簽署教練姓名", for: ["client_service"], group: "admin" },
  { key: "coach.code", label: "簽署教練編號", for: ["client_service"], group: "admin" },
  { key: "client.name", label: "客戶／簽約人姓名", for: ["client_service"], group: "person" },
  { key: "client.email", label: "客戶 Email", for: ["client_service"], group: "person" },
];

export const varsFor = (cat: DocCategory) => VAR_CATALOG.filter((v) => v.for === "all" || v.for.includes(cat));
export const varDef = (key: string) => VAR_CATALOG.find((v) => v.key === key);

/** html 裡用到的變數 key（不含 sign／seal／ask）。啟動前的「缺什麼」檢查靠它。 */
export function varsInHtml(html: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) if (m[1] !== "seal" && !out.includes(m[1])) out.push(m[1]);
  return out;
}

export const SAMPLE_VARS: DocVars = {
  title: "文件標題",
  today: "2026-10-28",
  "doc.no": "T2610001",
  "doc.expires": "2026-11-11",
  esign_clause: E_SIGN_CLAUSE,
  "company.name": "嵐途財務規劃",
  "member.name": "王小美",
  "member.email": "mei@example.com",
  "member.phone": "0912-345-678",
  "member.id_no": "A123456789",
  "member.birth": "1990-05-20",
  "member.address": "桃園市中壢區中正路 100 號",
  "member.invoice": "個人（雲端發票載具 /ABC+123）",
  "member.invoice_carrier": "/ABC+123",
  "member.invoice_tax_id": "",
  "member.invoice_title": "",
  "member.code": "FC2610001",
  "member.kind": "實習教練",
  "ref.name": "陳教練",
  "ref.code": "FC2609002",
  "pay.method": "銀行轉帳",
  "pay.date": "2026-10-20",
  "brief.date": "2026-10-15",
  "brief.version": "",
  "enroll.date": "2026-10-18",
  "enroll.resign_date": "",
  "pay.is_bank": true,
  "pay.is_card": false,
  "pay.is_zero": false,
  "brief.is_meeting": true,
  "brief.is_public": false,
  "member.is_intern": true,
  "member.is_partner": false,
  "member.is_hired": false,
  "member.invoice_is_personal": true,
  "member.invoice_is_company": false,
  "enroll.is_resign": false,
  "item.name": "180 天財務教練培育計畫",
  "item.price": "30,000",
  "case.amount": "30,000",
  "case.no": "2611001",
  "case.from": "2026-11-01",
  "case.to": "2027-04-29",
  "coach.name": "陳教練",
  "coach.code": "FC2609002",
  "client.name": "林先生",
  "client.email": "lin@example.com",
};

/** 新範本的起手式：標題、條款佔位、電子簽署條款、簽名欄會自動補。 */
export const STARTER_HTML = `<h1>{{title}}</h1>
<p>合約編號：{{doc.no}}</p>
<p>立約人：{{company.name}}（以下簡稱甲方）</p>
<p>　　　　{{member.name}}（以下簡稱乙方）</p>

<h2>第一條　合作內容</h2>
<p>（在這裡寫條款內容）</p>

<h2>第二條　費用</h2>
<p>方案：{{item.name}}，費用新台幣 {{case.amount}} 元整。</p>

<h2>第三條　電子簽署</h2>
<p>{{esign_clause}}</p>

<p style="margin-top:28px">{{seal}}</p>
<p>產生日期：{{today}}　簽署日期：{{sign.date}}</p>`;
