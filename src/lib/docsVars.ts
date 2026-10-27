// 範本可用的欄位目錄：後台編輯器列給人看、預覽用示範值、啟動時由各消費者（培訓／顧問服務）組出真值。
// ⚠️ 加欄位時三處一起改：這裡的目錄、對應消費者的 buildVars、預覽示範值。
import { E_SIGN_CLAUSE, type DocCategory, type DocVars } from "./docs";

export type VarDef = { key: string; label: string; for: DocCategory[] | "all" };

export const VAR_CATALOG: VarDef[] = [
  { key: "title", label: "文件名稱", for: "all" },
  { key: "today", label: "產生日期", for: "all" },
  { key: "esign_clause", label: "電子簽署條款（固定句）", for: "all" },
  { key: "company.name", label: "公司名稱（品牌設定）", for: "all" },
  { key: "member.name", label: "成員／申請人姓名", for: ["training"] },
  { key: "member.email", label: "成員 Email", for: ["training"] },
  { key: "member.code", label: "成員教練編號（已發號才有）", for: ["training"] },
  { key: "item.name", label: "方案名稱（營業項目）", for: "all" },
  { key: "item.price", label: "方案定價", for: "all" },
  { key: "case.amount", label: "本案應收金額", for: "all" },
  { key: "case.no", label: "案件編號", for: ["client_service"] },
  { key: "case.from", label: "服務起日", for: ["client_service"] },
  { key: "case.to", label: "服務迄日", for: ["client_service"] },
  { key: "coach.name", label: "簽署教練姓名", for: ["client_service"] },
  { key: "coach.code", label: "簽署教練編號", for: ["client_service"] },
  { key: "client.name", label: "客戶／簽約人姓名", for: ["client_service"] },
  { key: "client.email", label: "客戶 Email", for: ["client_service"] },
];

export const varsFor = (cat: DocCategory) => VAR_CATALOG.filter((v) => v.for === "all" || v.for.includes(cat));

export const SAMPLE_VARS: DocVars = {
  title: "文件標題",
  today: "2026-10-28",
  esign_clause: E_SIGN_CLAUSE,
  "company.name": "嵐途財務規劃",
  "member.name": "王小美",
  "member.email": "mei@example.com",
  "member.code": "FC2610001",
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
<p>立約人：{{company.name}}（以下簡稱甲方）</p>
<p>　　　　{{member.name}}（以下簡稱乙方）</p>

<h2>第一條　合作內容</h2>
<p>（在這裡寫條款內容）</p>

<h2>第二條　費用</h2>
<p>方案：{{item.name}}，費用新台幣 {{case.amount}} 元整。</p>

<h2>第三條　電子簽署</h2>
<p>{{esign_clause}}</p>

<p style="margin-top:28px">{{seal}}</p>
<p>中華民國　　　年　　　月　　　日（{{today}}）</p>`;
