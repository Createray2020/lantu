// 電子簽署（內部點點簽）的純規則層：範本渲染、簽名位、簽署順序、狀態機、簽名圖驗證。
// 不碰 DB、不碰 Next —— server action、client component、測試都 import 這一支。
// 讀寫住 lib/docsStore.ts。地基語意見 schema.ts「電子簽署」那一段。
//
// 2026/10/28 Ray 定案：
//   · 自建、不串第三方；簽署的對象是凍結 HTML 快照＋SHA-256，簽完把簽名圖貼進簽名位再鎖 final hash。
//   · 簽署人由後台設定：每份範本多個簽名位，每位有分類（公司／成員／客戶／教練）與順序。
//   · 「雙方同意以本系統電子簽署方式為之」同時放在範本條款與簽署介面的同意勾選旁。

export type DocRole = "company" | "member" | "client" | "coach";
export type DocSignerSlot = { role: DocRole; seq: number; label?: string };
export type DocCategory = "training" | "client_service";
/** 實例的案件類型：兩個業務消費者＋補簽任務（coach_doc，不觸發任何業務後續）。 */
export type DocCaseType = DocCategory | "coach_doc";
export const CASE_TYPE_LABEL: Record<DocCaseType, string> = { training: "培訓", client_service: "顧問服務", coach_doc: "補簽" };
export type DocSetKind = "training_item" | "service_item";
export type DocInstanceStatus = "pending" | "completed" | "declined" | "expired" | "void";
export type DocSignerStatus = "pending" | "signed" | "declined";

export const DOC_ROLES: { value: DocRole; label: string; hint: string }[] = [
  { value: "member", label: "成員", hint: "申請人／本人（培訓文件的簽署人）" },
  { value: "coach", label: "教練", hint: "案件的簽署教練" },
  { value: "client", label: "客戶", hint: "案件的客戶（簽約人）" },
  { value: "company", label: "公司", hint: "公司代表（核心成員），啟動時指定" },
];
export const ROLE_LABEL: Record<DocRole, string> = { member: "成員", coach: "教練", client: "客戶", company: "公司" };

export const DOC_CATEGORIES: { value: DocCategory; label: string }[] = [
  { value: "training", label: "培訓文件" },
  { value: "client_service", label: "顧問服務合約" },
];
export const CATEGORY_LABEL: Record<DocCategory, string> = { training: "培訓文件", client_service: "顧問服務合約" };

export const DOC_SET_KINDS: { value: DocSetKind; label: string; category: DocCategory }[] = [
  { value: "training_item", label: "培訓方案", category: "training" },
  { value: "service_item", label: "顧問服務方案", category: "client_service" },
];

export const STATUS_LABEL: Record<DocInstanceStatus, string> = {
  pending: "待簽署",
  completed: "已完成",
  declined: "已拒簽",
  expired: "已逾期",
  void: "已作廢",
};

/** 範本條款與簽署介面都要出現的那一句（Ray 2026/10/28）。 */
export const E_SIGN_CLAUSE = "雙方同意以本系統電子簽署方式為之，電子簽名與親筆簽名具同等效力。";
/** 簽署頁的同意勾選文字（預設不得勾選）。 */
export const CONSENT_LABEL = "我已確認本份文件內容，並同意使用本人簽名簽署。";

export const TEMPLATE_NAME_MAX = 80;
export const TEMPLATE_HTML_MAX = 400_000;
export const SIGNATURE_MAX_CHARS = 400_000;
/** 催簽：待簽超過幾天進待辦（後台可改，存 site_settings doc_settings）；同一位一天最多催一次。 */
export const DEFAULT_NUDGE_DAYS = 7;
export type DocSettings = { nudgeDays: number };
export const DEFAULT_DOC_SETTINGS: DocSettings = { nudgeDays: DEFAULT_NUDGE_DAYS };
export function sanitizeDocSettings(v: unknown): DocSettings {
  const x = (v ?? {}) as { nudgeDays?: unknown };
  const n = Number(x.nudgeDays);
  return { nudgeDays: Number.isFinite(n) && n >= 1 && n <= 90 ? Math.floor(n) : DEFAULT_NUDGE_DAYS };
}
/** 這一份是不是「卡太久」：還在待簽、而且從建立（或最後一次催）起超過 nudgeDays。 */
export function isStale(inst: { status: string; createdAt: Date | string }, lastActivity: Date | string | null, nudgeDays: number, now: Date = new Date()): boolean {
  if (inst.status !== "pending") return false;
  const base = new Date(lastActivity ?? inst.createdAt).getTime();
  return now.getTime() - base >= nudgeDays * 86_400_000;
} // base64 PNG 約 300KB，手寫簽名通常 10–30KB

// ── 簽名圖（PNG data URL）────────────────────────────────────────────────────
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 只收 image/png 的 data URL，base64 字元集與 PNG magic bytes 都驗死（同資安盤點 #10 的 logo 作法）。 */
export function validSignaturePng(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
  if (!m) return null;
  if (s.length > SIGNATURE_MAX_CHARS) return null;
  const head = b64Head(m[1].slice(0, 16));
  if (head.length < 8 || PNG_MAGIC.some((b, i) => head[i] !== b)) return null;
  return s;
}

function b64Head(b64: string): number[] {
  if (typeof atob === "function") {
    const bin = atob(b64);
    return Array.from(bin, (c) => c.charCodeAt(0));
  }
  // Node 沒有全域 atob 的舊版本
  return Array.from(Buffer.from(b64, "base64"));
}

// ── 簽名位與範本 ─────────────────────────────────────────────────────────────
const ROLE_SET = new Set<string>(["company", "member", "client", "coach"]);
export const isDocRole = (v: unknown): v is DocRole => typeof v === "string" && ROLE_SET.has(v);
export const isDocCategory = (v: unknown): v is DocCategory => v === "training" || v === "client_service";
export const isDocSetKind = (v: unknown): v is DocSetKind => v === "training_item" || v === "service_item";

export function sanitizeSlots(input: unknown): DocSignerSlot[] {
  if (!Array.isArray(input)) return [];
  const out: DocSignerSlot[] = [];
  for (const x of input) {
    if (!x || typeof x !== "object") continue;
    const r = (x as { role?: unknown }).role;
    if (!isDocRole(r)) continue;
    const seqRaw = Number((x as { seq?: unknown }).seq);
    const seq = Number.isFinite(seqRaw) && seqRaw >= 1 ? Math.floor(seqRaw) : 1;
    const label = String((x as { label?: unknown }).label ?? "").trim().slice(0, 40);
    out.push({ role: r, seq, ...(label ? { label } : {}) });
  }
  // 同 role 同 seq 只留一個（兩個「教練 1」是同一個簽名位）
  const seen = new Set<string>();
  return out.filter((s) => {
    const k = `${s.role}:${s.seq}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.seq - b.seq || a.role.localeCompare(b.role));
}

export const slotKey = (s: { role: string; seq: number }) => `${s.role}:${s.seq}`;
export const slotLabel = (s: DocSignerSlot) => s.label || `${ROLE_LABEL[s.role]}簽名`;

/** html 裡出現的 {{sign:role:seq}}。 */
export function slotsInHtml(html: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*sign:([a-z_]+):(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const k = `${m[1]}:${Number(m[2])}`;
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

export type TemplateInput = {
  key?: string | null;
  category: DocCategory;
  name: string;
  html: string;
  useSeal: boolean;
  required: boolean;
  signDays: number | null;
  signers: DocSignerSlot[];
  note?: string;
};

/** 範本存檔前的檢查：回傳錯誤清單（空＝可存）。 */
export function validateTemplate(t: TemplateInput): string[] {
  const errs: string[] = [];
  if (!t.name.trim()) errs.push("請填文件名稱");
  if (t.name.length > TEMPLATE_NAME_MAX) errs.push(`文件名稱最多 ${TEMPLATE_NAME_MAX} 字`);
  if (!t.html.trim()) errs.push("內容不能是空的");
  if (t.html.length > TEMPLATE_HTML_MAX) errs.push("內容太長");
  if (!t.signers.length) errs.push("至少要有一個簽署人");
  const inHtml = new Set(slotsInHtml(t.html));
  const declared = new Set(t.signers.map(slotKey));
  for (const k of inHtml) if (!declared.has(k)) errs.push(`內容裡有 {{sign:${k}}} 但簽署人清單沒有這一位`);
  if (t.signDays != null && (!Number.isFinite(t.signDays) || t.signDays < 1 || t.signDays > 365)) errs.push("簽署期限要在 1–365 天");
  return errs;
}

/** 沒寫在內容裡的簽名位會自動補在文末——這裡算出要補的。 */
export function missingSlots(t: { html: string; signers: DocSignerSlot[] }): DocSignerSlot[] {
  const inHtml = new Set(slotsInHtml(t.html));
  return t.signers.filter((s) => !inHtml.has(slotKey(s)));
}

// ── 渲染 ────────────────────────────────────────────────────────────────────
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export type DocVars = Record<string, string | number | null | undefined>;

/**
 * 把範本變成「這一案的文件」：帶欄位、放簽名位、放大小章。
 *   {{client.name}}     → 變數（HTML 轉義；沒有的變數印空字串）
 *   {{sign:coach:1}}    → <span class="sign-slot" data-slot="coach:1">…</span>
 *   {{seal}}            → 公司大小章（opts.seal 是 PNG data URL；沒有或 useSeal=false 就印空）
 * 沒寫在內容裡的簽名位補在文末一個「簽署欄」區塊。
 */
export function renderTemplate(
  t: { html: string; signers: DocSignerSlot[]; useSeal: boolean },
  vars: DocVars,
  opts: { seal?: string | null } = {},
): string {
  const seal = t.useSeal && opts.seal ? `<img class="doc-seal" src="${opts.seal}" alt="公司印鑑" />` : "";
  const labelOf = (k: string) => {
    const s = t.signers.find((x) => slotKey(x) === k);
    return s ? slotLabel(s) : k;
  };
  let html = t.html
    .replace(/\{\{\s*seal\s*\}\}/g, () => seal)
    .replace(/\{\{\s*sign:([a-z_]+):(\d+)\s*\}\}/g, (_m, role: string, seq: string) => {
      const k = `${role}:${Number(seq)}`;
      return `<span class="sign-slot" data-slot="${k}"><span class="sign-slot-label">${escapeHtml(labelOf(k))}</span></span>`;
    })
    .replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path: string) => {
      const v = vars[path];
      return v == null ? "" : escapeHtml(String(v));
    });
  html = stripActiveHtml(html);
  const extra = missingSlots(t);
  if (extra.length) {
    html += `\n<section class="doc-sign-block"><h3>簽署欄</h3>${extra
      .map((s) => `<div class="doc-sign-row"><span class="sign-slot" data-slot="${slotKey(s)}"><span class="sign-slot-label">${escapeHtml(slotLabel(s))}</span></span></div>`)
      .join("")}</section>`;
  }
  return html;
}

/** 範本是後台管理員寫的 HTML，但文件要直接嵌進簽署頁與列印頁：script／事件屬性／javascript: 一律拿掉。 */
export function stripActiveHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, '$1=$2#$2');
}

/** 雜湊前的正規化：換行統一、去頭尾空白。同一份內容在不同平台存出來要算出同一個 hash。 */
export function normalizeHtml(html: string): string {
  return html.replace(/\r\n?/g, "\n").trim();
}

export type SignedSigner = {
  role: string;
  seq: number;
  displayName: string;
  signatureImg: string | null;
  signedAt: Date | string | null;
};

/** 全員簽完：把簽名圖貼進簽名位（取代佔位 span 的內容），日期用台北日期。 */
export function applySignatures(html: string, signers: SignedSigner[]): string {
  return html.replace(
    /<span class="sign-slot" data-slot="([a-z_]+:\d+)">[\s\S]*?<\/span><\/span>/g,
    (whole, k: string) => {
      const [role, seqS] = k.split(":");
      const s = signers.find((x) => x.role === role && x.seq === Number(seqS));
      if (!s?.signatureImg) return whole;
      const when = s.signedAt ? fmtDateTaipei(s.signedAt) : "";
      return `<span class="sign-slot signed" data-slot="${k}"><img class="sign-img" src="${s.signatureImg}" alt="${escapeHtml(s.displayName)} 簽名" /><span class="sign-meta">${escapeHtml(s.displayName)}　${when}</span></span>`;
    },
  );
}

export function fmtDateTaipei(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const p = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(dt);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// ── 簽署順序與狀態 ─────────────────────────────────────────────────────────
export type SignerLite = { seq: number; status: DocSignerStatus | string };

/** 現在輪到的順位：最小的還沒簽的 seq；全簽完回 null。 */
export function currentSeq(signers: SignerLite[]): number | null {
  const pending = signers.filter((s) => s.status === "pending").map((s) => s.seq);
  return pending.length ? Math.min(...pending) : null;
}

/** 這一位現在能不能簽（他的順位到了、而且他還沒簽）。同 seq 的人可以並行。 */
export function canSignNow(me: SignerLite, all: SignerLite[]): boolean {
  if (me.status !== "pending") return false;
  if (all.some((s) => s.status === "declined")) return false;
  const cur = currentSeq(all);
  return cur != null && me.seq === cur;
}

/** 由簽署人推實例狀態。 */
export function instanceStatusFrom(signers: SignerLite[]): Extract<DocInstanceStatus, "pending" | "completed" | "declined"> {
  if (signers.some((s) => s.status === "declined")) return "declined";
  if (signers.length && signers.every((s) => s.status === "signed")) return "completed";
  return "pending";
}

export function isExpired(expiresAt: string | null | undefined, todayISO: string): boolean {
  return !!expiresAt && expiresAt < todayISO;
}

// ── 把簽名位對到人 ──────────────────────────────────────────────────────────
export type Party = { coachId?: string | null; clientUserId?: string | null; name: string };
export type SlotContext = Partial<Record<DocRole, Party | null>>;
export type ResolvedSigner = {
  role: DocRole;
  seq: number;
  label: string;
  coachId: string | null;
  clientUserId: string | null;
  displayName: string;
};

/**
 * 啟動時把範本的簽名位解析成具體的人。缺哪一種角色就回 missing，由呼叫端決定要擋還是要先選人。
 * member／coach／company 都是教練表的人（coachId）；client 是客戶帳號（clientUserId）。
 */
export function resolveSlots(slots: DocSignerSlot[], ctx: SlotContext): { ok: true; signers: ResolvedSigner[] } | { ok: false; missing: DocRole[] } {
  const missing: DocRole[] = [];
  const signers: ResolvedSigner[] = [];
  for (const s of slots) {
    const p = ctx[s.role];
    const id = s.role === "client" ? p?.clientUserId : p?.coachId;
    if (!p || !id) {
      if (!missing.includes(s.role)) missing.push(s.role);
      continue;
    }
    signers.push({
      role: s.role,
      seq: s.seq,
      label: slotLabel(s),
      coachId: s.role === "client" ? null : id,
      clientUserId: s.role === "client" ? id : null,
      displayName: p.name,
    });
  }
  return missing.length ? { ok: false, missing } : { ok: true, signers };
}

/** 登入者是不是這一列簽署人。 */
export function isSigner(row: { coachId: string | null; clientUserId: string | null }, me: { coachId?: string | null; clientUserId?: string | null }): boolean {
  return (!!row.coachId && row.coachId === me.coachId) || (!!row.clientUserId && row.clientUserId === me.clientUserId);
}

/** 簽署頁與列印頁共用的文件樣式（inline，讓快照不依賴站方 CSS）。 */
export const DOC_CSS = `
.doc-body{font-family:system-ui,-apple-system,"Noto Sans TC","PingFang TC",sans-serif;line-height:1.8;color:#111;background:#fff;max-width:760px;margin:0 auto;padding:32px 36px}
.doc-body h1{font-size:22px;text-align:center;letter-spacing:.1em;margin:0 0 20px}
.doc-body h2{font-size:16px;margin:22px 0 8px}
.doc-body h3{font-size:14px;margin:18px 0 6px}
.doc-body p{margin:6px 0}
.doc-body table{border-collapse:collapse;width:100%;font-size:13px}
.doc-body td,.doc-body th{border:1px solid #bbb;padding:5px 8px;text-align:left}
.doc-seal{height:110px;float:right;margin:0 0 8px 12px}
.doc-sign-block{margin-top:28px;border-top:1px solid #ccc;padding-top:14px}
.doc-sign-row{margin:10px 0}
.sign-slot{display:inline-block;min-width:200px;min-height:64px;border-bottom:1px solid #333;vertical-align:bottom;position:relative;padding:0 6px}
.sign-slot-label{position:absolute;left:6px;bottom:2px;font-size:11px;color:#888}
.sign-slot.signed{border-bottom-color:#333}
.sign-img{height:60px;display:block}
.sign-meta{font-size:11px;color:#444}
@media print{.doc-body{padding:0;max-width:none}}
`;
