// 電子簽署的資料層：範本（版本化）、範本組合、公司印鑑、文件實例與簽署人、預存簽名檔。
// 規則與型別住 lib/docs.ts；這一支只管「存在哪、什麼順序寫、什麼時候鎖」。
//
// ⚠️ neon-http 沒有互動式交易：多列一起寫用 db.batch()（單一交易）。
// ⚠️ startSigning 必須冪等：同案同範本 key 在非 void 狀態下只能有一份（部分唯一索引守著），
//    重複按「啟動」回既有進度，不重產、不重寄。
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { unstable_cache, updateTag } from "next/cache";
import { db } from "@/Shared/db";
import { docInstances, docSets, docSigners, docTasks, docTemplates, signatures, signerProfiles, siteSettings, coaches, coachDisplayName } from "@/Shared/db/schema";
import {
  applySignatures,
  canSignNow,
  instanceStatusFrom,
  isDocCategory,
  isDocSetKind,
  isSigner,
  normalizeHtml,
  renderTemplate,
  resolveSlots,
  sanitizeSlots,
  sanitizeAsks,
  asksForRole,
  checkAnswers,
  type DocAsk,
  validSignaturePng,
  validateTemplate,
  type DocCategory,
  type DocCaseType,
  type DocSetKind,
  type DocSettings,
  DEFAULT_DOC_SETTINGS,
  sanitizeDocSettings,
  isStale,
  E_SIGN_CLAUSE,
  type DocSignerSlot,
  type DocVars,
  type SlotContext,
  type TemplateInput,
  fmtDateTaipei,
} from "./docs";
import { addDaysISO, todayISO } from "./license";
import { sanitizeTemplateHtml } from "./docsSanitize";
import { allocCode } from "./codeAlloc";
import { varDef, varsInHtml } from "./docsVars";
import type { CodeKind } from "./codes";

/** 合約編號的號段：案件類型 → code_counters 的 kind。 */
const DOC_NO_KIND: Record<DocCaseType, CodeKind> = { training: "doc_training", client_service: "doc_service", coach_doc: "doc_coach" };

/** Postgres 23505＝unique_violation。neon-http／drizzle 把原始錯誤包了一層，沿 cause 往下看。 */
export function isUniqueViolation(e: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const o = cur as { code?: unknown; cause?: unknown };
    if (o.code === "23505") return true;
    cur = o.cause;
  }
  return /duplicate key value/.test(e instanceof Error ? e.message : String(e));
}

export type DocTemplate = typeof docTemplates.$inferSelect;
export type DocInstance = typeof docInstances.$inferSelect;
export type DocSigner = typeof docSigners.$inferSelect;
export type DocSet = typeof docSets.$inferSelect;

export const sha256 = (s: string) => createHash("sha256").update(normalizeHtml(s), "utf8").digest("hex");

// ── 公司印鑑（site_settings key='doc_seal'）──────────────────────────────────
export const DOC_SEAL_KEY = "doc_seal";
export const DOC_SEAL_TAG = "doc-seal";
export type DocSeal = { img: string | null; updatedAt: string | null };

export const getDocSeal = unstable_cache(
  async (): Promise<DocSeal> => {
    try {
      const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, DOC_SEAL_KEY)).limit(1);
      const v = (rows[0]?.value ?? null) as { img?: string } | null;
      const img = validSignaturePng(v?.img);
      return { img, updatedAt: rows[0]?.updatedAt?.toISOString() ?? null };
    } catch {
      return { img: null, updatedAt: null };
    }
  },
  ["lantu-doc-seal"],
  { tags: [DOC_SEAL_TAG] },
);

/** 大小章合成一張 PNG（Ray：合約已套用公司大小章，不另設每份合約的公司簽章步驟）。 */
export async function saveDocSeal(img: unknown, updatedBy: string | null): Promise<void> {
  const v = img == null || img === "" ? null : validSignaturePng(img);
  if (img && !v) throw new Error("invalid-png");
  await db
    .insert(siteSettings)
    .values({ key: DOC_SEAL_KEY, value: { img: v }, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: { img: v }, updatedAt: new Date(), updatedBy } });
  updateTag(DOC_SEAL_TAG);
}

// ── 範本 ─────────────────────────────────────────────────────────────────────
/** 全部版本（後台用）。 */
export async function listTemplates(opts: { includeArchived?: boolean } = {}): Promise<DocTemplate[]> {
  const order = [asc(docTemplates.category), asc(docTemplates.key), desc(docTemplates.version)];
  return opts.includeArchived
    ? db.select().from(docTemplates).orderBy(...order)
    : db.select().from(docTemplates).where(isNull(docTemplates.archivedAt)).orderBy(...order);
}

/**
 * 刪除範本（所有版本一起）。沒有任何文件引用過 → 真刪；有 → 封存（archived_at、enabled=false）。
 * 兩種都會把這個 key 從所有範本組合拿掉，之後啟動簽署不會再產這一份。
 */
export async function deleteTemplate(key: string): Promise<{ ok: true; mode: "deleted" | "archived" } | { ok: false; error: string }> {
  const versions = await db.select({ id: docTemplates.id }).from(docTemplates).where(eq(docTemplates.key, key));
  if (!versions.length) return { ok: false, error: "找不到這份範本" };
  const used = await db.select({ id: docInstances.id }).from(docInstances).where(eq(docInstances.templateKey, key)).limit(1);
  const sets = await db.select().from(docSets);
  const touched = sets.filter((s) => s.templateKeys.includes(key));
  for (const s of touched) {
    await db.update(docSets).set({ templateKeys: s.templateKeys.filter((k) => k !== key), updatedAt: new Date() }).where(eq(docSets.id, s.id));
  }
  if (used.length) {
    await db.update(docTemplates).set({ archivedAt: new Date(), enabled: false }).where(eq(docTemplates.key, key));
    return { ok: true, mode: "archived" };
  }
  await db.delete(docTemplates).where(eq(docTemplates.key, key));
  return { ok: true, mode: "deleted" };
}

/** 每個 key 的最新版本（不管 enabled）。 */
export function latestByKey(rows: DocTemplate[]): DocTemplate[] {
  const m = new Map<string, DocTemplate>();
  for (const r of rows) {
    const cur = m.get(r.key);
    if (!cur || r.version > cur.version) m.set(r.key, r);
  }
  return [...m.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "zh-Hant"));
}

export async function getTemplate(id: string): Promise<DocTemplate | null> {
  const rows = await db.select().from(docTemplates).where(eq(docTemplates.id, id)).limit(1);
  return rows[0] ?? null;
}

/** 某 key 的最新**啟用**版本（啟動簽署用）。 */
export async function latestEnabledTemplate(key: string): Promise<DocTemplate | null> {
  const rows = await db
    .select()
    .from(docTemplates)
    .where(and(eq(docTemplates.key, key), eq(docTemplates.enabled, true), isNull(docTemplates.archivedAt)))
    .orderBy(desc(docTemplates.version))
    .limit(1);
  return rows[0] ?? null;
}

export function sanitizeTemplateInput(raw: unknown): TemplateInput {
  const x = (raw ?? {}) as Record<string, unknown>;
  const signDaysRaw = x.signDays == null || x.signDays === "" ? null : Number(x.signDays);
  return {
    key: typeof x.key === "string" && x.key.trim() ? x.key.trim() : null,
    category: isDocCategory(x.category) ? x.category : "training",
    name: String(x.name ?? "").trim(),
    html: String(x.html ?? ""),
    useSeal: x.useSeal !== false,
    required: x.required !== false,
    signDays: signDaysRaw == null || !Number.isFinite(signDaysRaw) ? null : Math.floor(signDaysRaw),
    signers: sanitizeSlots(x.signers),
    asks: sanitizeAsks(x.asks),
    itemIds: Array.isArray(x.itemIds) ? [...new Set(x.itemIds.filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim()))].slice(0, 50) : [],
    note: String(x.note ?? "").trim().slice(0, 400),
  };
}

/**
 * 存範本：沒有 key＝新文件（version 1）；有 key＝**插新版本**（舊版列不動——已發出的實例指著舊版本列）。
 * 回傳新列。錯誤用 Error(訊息) 丟出讓 action 直接給人看。
 */
export async function saveTemplate(raw: unknown, createdBy: string | null): Promise<DocTemplate> {
  const t0 = sanitizeTemplateInput(raw);
  // 白名單消毒在驗證之前：{{…}} 是純文字會原樣留下，驗證看的就是真正會存進去的內容。
  const t = { ...t0, html: sanitizeTemplateHtml(t0.html) };
  const errs = validateTemplate(t);
  if (errs.length) throw new Error(errs.join("；"));
  const key = t.key ?? crypto.randomUUID();
  // 版本號先讀後寫：兩位管理員同時存同一份會撞 (key, version) 唯一索引 → 重讀一次再試，最多三次。
  for (let attempt = 0; attempt < 3; attempt++) {
    let version = 1;
    if (t.key) {
      const prev = await db.select({ v: docTemplates.version }).from(docTemplates).where(eq(docTemplates.key, key)).orderBy(desc(docTemplates.version)).limit(1);
      version = (prev[0]?.v ?? 0) + 1;
    }
    try {
      const rows = await db
        .insert(docTemplates)
        .values({ key, version, category: t.category, name: t.name, html: t.html, useSeal: t.useSeal, required: t.required, signDays: t.signDays, signers: t.signers, asks: t.asks, itemIds: t.itemIds, note: t.note ?? "", createdBy })
        .returning();
      return rows[0];
    } catch (e) {
      if (!isUniqueViolation(e) || attempt === 2) throw new Error(isUniqueViolation(e) ? "有人同時在存這份範本，請重新整理再試" : (e instanceof Error ? e.message : String(e)));
    }
  }
  throw new Error("存檔失敗");
}

/** 啟用／停用某一個版本列（不產新版本）。停用最新版＝這個 key 暫時不能被啟動。 */
export async function setTemplateEnabled(id: string, enabled: boolean): Promise<void> {
  await db.update(docTemplates).set({ enabled }).where(eq(docTemplates.id, id));
}

// ── 範本組合 ─────────────────────────────────────────────────────────────────
export async function listSets(kind?: DocSetKind): Promise<DocSet[]> {
  return kind ? db.select().from(docSets).where(eq(docSets.kind, kind)) : db.select().from(docSets);
}

export async function getSet(kind: DocSetKind, ref: string): Promise<string[]> {
  const rows = await db.select().from(docSets).where(and(eq(docSets.kind, kind), eq(docSets.ref, ref))).limit(1);
  return rows[0]?.templateKeys ?? [];
}

export async function saveSet(kindRaw: unknown, refRaw: unknown, keysRaw: unknown): Promise<void> {
  if (!isDocSetKind(kindRaw)) throw new Error("invalid-kind");
  const ref = String(refRaw ?? "").trim();
  if (!ref) throw new Error("missing-ref");
  const keys = Array.isArray(keysRaw) ? [...new Set(keysRaw.map((k) => String(k).trim()).filter(Boolean))] : [];
  await db
    .insert(docSets)
    .values({ kind: kindRaw, ref, templateKeys: keys, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [docSets.kind, docSets.ref], set: { templateKeys: keys, updatedAt: new Date() } });
}

// ── 預存簽名檔 ───────────────────────────────────────────────────────────────
export type SignatureOwner = { kind: "coach" | "client_user"; id: string };

export async function getSignature(o: SignatureOwner): Promise<string | null> {
  const rows = await db.select({ img: signatures.img }).from(signatures).where(and(eq(signatures.ownerKind, o.kind), eq(signatures.ownerId, o.id))).limit(1);
  return rows[0]?.img ?? null;
}

export async function saveSignature(o: SignatureOwner, img: unknown): Promise<void> {
  const v = validSignaturePng(img);
  if (!v) throw new Error("invalid-png");
  await db
    .insert(signatures)
    .values({ ownerKind: o.kind, ownerId: o.id, img: v, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [signatures.ownerKind, signatures.ownerId], set: { img: v, updatedAt: new Date() } });
}

// ── 簽約資料（signer_profiles）──────────────────────────────────────────────
export type SignerProfile = typeof signerProfiles.$inferSelect;
export type SignerProfileInput = {
  idNo: string; birthDate: string | null; phone: string; email: string; address: string;
  invoiceKind: "personal" | "company"; invoiceCarrier: string; invoiceTaxId: string; invoiceTitle: string;
};
export const PROFILE_FIELD_LABEL: Record<keyof SignerProfileInput, string> = {
  idNo: "身分證字號／護照號碼", birthDate: "出生日期", phone: "電話", email: "Email", address: "通訊地址",
  invoiceKind: "發票開立方式", invoiceCarrier: "雲端發票載具", invoiceTaxId: "統一編號", invoiceTitle: "發票抬頭",
};

export function sanitizeProfileInput(raw: unknown): SignerProfileInput {
  const x = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string, max = 120) => String(x[k] ?? "").trim().slice(0, max);
  const bd = str("birthDate", 10);
  return {
    idNo: str("idNo", 30).toUpperCase(),
    birthDate: /^\d{4}-\d{2}-\d{2}$/.test(bd) ? bd : null,
    phone: str("phone", 30),
    email: str("email", 120),
    address: str("address", 200),
    invoiceKind: x.invoiceKind === "company" ? "company" : "personal",
    invoiceCarrier: str("invoiceCarrier", 30),
    invoiceTaxId: str("invoiceTaxId", 10),
    invoiceTitle: str("invoiceTitle", 80),
  };
}

export async function getSignerProfile(o: SignatureOwner): Promise<SignerProfile | null> {
  const rows = await db.select().from(signerProfiles).where(and(eq(signerProfiles.ownerKind, o.kind), eq(signerProfiles.ownerId, o.id))).limit(1);
  return rows[0] ?? null;
}

export async function saveSignerProfile(o: SignatureOwner, raw: unknown): Promise<SignerProfile> {
  const v = sanitizeProfileInput(raw);
  const rows = await db
    .insert(signerProfiles)
    .values({ ownerKind: o.kind, ownerId: o.id, ...v, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [signerProfiles.ownerKind, signerProfiles.ownerId], set: { ...v, updatedAt: new Date() } })
    .returning();
  return rows[0];
}

/** 發票方式一句話＋各欄；給範本變數用。prefix 是變數前綴（member／client）。 */
export function profileVars(prefix: "member" | "client", p: SignerProfile | null, fallback: { email?: string; phone?: string } = {}): DocVars {
  const company = p?.invoiceKind === "company";
  const invoice = !p ? "" : company ? `公司（統一編號 ${p.invoiceTaxId}　抬頭 ${p.invoiceTitle}）` : `個人${p.invoiceCarrier ? `（雲端發票載具 ${p.invoiceCarrier}）` : ""}`;
  return {
    [`${prefix}.email`]: p?.email || fallback.email || "",
    [`${prefix}.phone`]: p?.phone || fallback.phone || "",
    [`${prefix}.id_no`]: p?.idNo ?? "",
    [`${prefix}.birth`]: p?.birthDate ?? "",
    [`${prefix}.address`]: p?.address ?? "",
    [`${prefix}.invoice`]: invoice,
    [`${prefix}.invoice_carrier`]: company ? "" : (p?.invoiceCarrier ?? ""),
    [`${prefix}.invoice_tax_id`]: company ? p!.invoiceTaxId : "",
    [`${prefix}.invoice_title`]: company ? p!.invoiceTitle : "",
    [`${prefix}.invoice_is_personal`]: !!p && !company,
    [`${prefix}.invoice_is_company`]: company,
  };
}

/** 簽約資料缺哪些（合約必印的）：身分證／護照、電話、Email、地址；發票依方式看載具或統編＋抬頭（載具可空：可印紙本）。 */
export function profileMissing(p: SignerProfile | null): string[] {
  if (!p) return [PROFILE_FIELD_LABEL.idNo, PROFILE_FIELD_LABEL.birthDate, PROFILE_FIELD_LABEL.phone, PROFILE_FIELD_LABEL.email, PROFILE_FIELD_LABEL.address, PROFILE_FIELD_LABEL.invoiceKind];
  const out: string[] = [];
  if (!p.idNo) out.push(PROFILE_FIELD_LABEL.idNo);
  if (!p.birthDate) out.push(PROFILE_FIELD_LABEL.birthDate);
  if (!p.phone) out.push(PROFILE_FIELD_LABEL.phone);
  if (!p.email) out.push(PROFILE_FIELD_LABEL.email);
  if (!p.address) out.push(PROFILE_FIELD_LABEL.address);
  if (p.invoiceKind === "company" && (!p.invoiceTaxId || !p.invoiceTitle)) out.push("公司發票的統一編號與抬頭");
  return out;
}

export async function deleteSignature(o: SignatureOwner): Promise<void> {
  await db.delete(signatures).where(and(eq(signatures.ownerKind, o.kind), eq(signatures.ownerId, o.id)));
}

// ── 啟動簽署 ─────────────────────────────────────────────────────────────────
export type StartSigningInput = {
  caseType: DocCaseType;
  caseId: string;
  setKind: DocSetKind;
  setRef: string;
  vars: DocVars;
  ctx: SlotContext;
  createdBy: string | null;
};
export type StartSigningResult =
  | { ok: true; instances: DocInstance[]; created: number; existing: number; noTemplates: boolean }
  | { ok: false; error: string };

/**
 * 依範本組合替案件產文件實例。冪等：已有非 void 實例的 key 直接沿用。
 * 範本組合是空的（或沒有啟用的版本）→ ok:true、noTemplates:true，由呼叫端決定（培訓：直接開通）。
 */
export async function startSigning(input: StartSigningInput): Promise<StartSigningResult> {
  const keys = await getSet(input.setKind, input.setRef);
  const templates = (await Promise.all(keys.map((k) => latestEnabledTemplate(k)))).filter((t): t is DocTemplate => !!t);
  const live = await listInstancesForCase(input.caseType, input.caseId);
  if (!templates.length) return { ok: true, instances: live.filter((i) => i.status !== "void"), created: 0, existing: live.length, noTemplates: true };

  const seal = (await getDocSeal()).img;
  const today = todayISO();
  const toCreate: { inst: typeof docInstances.$inferInsert & { id: string }; signers: Omit<typeof docSigners.$inferInsert, "instanceId">[] }[] = [];
  for (const t of templates) {
    if (live.some((i) => i.templateKey === t.key && i.status !== "void")) continue;
    const resolved = resolveSlots(t.signers as DocSignerSlot[], input.ctx);
    if (!resolved.ok) return { ok: false, error: `「${t.name}」缺少簽署人：${resolved.missing.map((r) => ({ company: "公司代表", member: "成員", client: "客戶", coach: "教練" })[r]).join("、")}` };
    // title 永遠有值（範本名）；呼叫端給了就用呼叫端的。範本 HTML 再過一次白名單（舊資料或直接寫 DB 的也擋）。
    // 合約編號先配再渲染（文件上要印）；配了號但後面沒插成（撞到別人同時啟動的那一份）就讓這個號空掉——寧可跳號也不重號。
    const docNo = await allocCode(DOC_NO_KIND[input.caseType]);
    const expiresAt = t.signDays ? addDaysISO(today, t.signDays) : null;
    const html = renderTemplate({ html: sanitizeTemplateHtml(t.html), signers: t.signers as DocSignerSlot[], useSeal: t.useSeal, asks: t.asks as DocAsk[] }, { title: t.name, "doc.no": docNo, "doc.expires": expiresAt ?? "", ...input.vars }, { seal });
    toCreate.push({
      inst: {
        id: crypto.randomUUID(),
        caseType: input.caseType,
        caseId: input.caseId,
        templateId: t.id,
        templateKey: t.key,
        version: t.version,
        title: t.name,
        docNo,
        required: t.required,
        htmlSnapshot: html,
        hash: sha256(html),
        status: "pending",
        expiresAt,
        createdBy: input.createdBy,
      },
      signers: resolved.signers.map((s) => ({ ...s, status: "pending" })),
    });
  }

  let created = 0;
  for (const c of toCreate) created += (await insertInstanceWithSigners(c.inst, c.signers)) ? 1 : 0;
  const all = await listInstancesForCase(input.caseType, input.caseId);
  return { ok: true, instances: all.filter((i) => i.status !== "void"), created, existing: live.length, noTemplates: false };
}

/**
 * 實例＋簽署人一起寫（db.batch＝單一交易）。id 由程式先產，所以不需要 returning 再寫第二句——
 * 分兩句寫的話第二句失敗會留下「永遠待簽、沒有簽署人」的孤兒實例（而且占著部分唯一索引）。
 * 同案同 key 已有一份（別人同時按了啟動）：實例 DO NOTHING、簽署人 FK 找不到 → 整個 batch 回滾 → 回 false，沿用對方那一份。
 */
async function insertInstanceWithSigners(inst: typeof docInstances.$inferInsert & { id: string }, signers: Omit<typeof docSigners.$inferInsert, "instanceId">[]): Promise<boolean> {
  try {
    if (signers.length) {
      await db.batch([
        db.insert(docInstances).values(inst).onConflictDoNothing(),
        db.insert(docSigners).values(signers.map((s) => ({ ...s, instanceId: inst.id }))),
      ]);
    } else {
      await db.insert(docInstances).values(inst).onConflictDoNothing();
    }
  } catch (e) {
    // FK 失敗＝實例沒插成（撞到既有的那一份）；其他錯誤往上丟
    if (/foreign key|violates|23503/i.test(e instanceof Error ? e.message : String(e)) || isUniqueViolation(e)) return false;
    throw e;
  }
  const rows = await db.select({ id: docInstances.id }).from(docInstances).where(eq(docInstances.id, inst.id)).limit(1);
  return rows.length > 0;
}

export async function listInstancesForCase(caseType: string, caseId: string): Promise<DocInstance[]> {
  return db.select().from(docInstances).where(and(eq(docInstances.caseType, caseType), eq(docInstances.caseId, caseId))).orderBy(asc(docInstances.createdAt));
}

export type InstanceWithSigners = DocInstance & { signers: DocSigner[] };

export async function getInstance(id: string): Promise<InstanceWithSigners | null> {
  const rows = await db.select().from(docInstances).where(eq(docInstances.id, id)).limit(1);
  if (!rows[0]) return null;
  const signers = await db.select().from(docSigners).where(eq(docSigners.instanceId, id)).orderBy(asc(docSigners.seq), asc(docSigners.role));
  return { ...rows[0], signers };
}

export async function withSigners(list: DocInstance[]): Promise<InstanceWithSigners[]> {
  if (!list.length) return [];
  const rows = await db.select().from(docSigners).where(inArray(docSigners.instanceId, list.map((i) => i.id))).orderBy(asc(docSigners.seq), asc(docSigners.role));
  return list.map((i) => ({ ...i, signers: rows.filter((s) => s.instanceId === i.id) }));
}

/** 案件的文件進度：必簽幾份、完成幾份、全部完成了沒。 */
export function caseProgress(list: { required: boolean; status: string }[]): { required: number; done: number; allDone: boolean; anyDeclined: boolean } {
  const live = list.filter((i) => i.status !== "void");
  const req = live.filter((i) => i.required);
  const done = req.filter((i) => i.status === "completed").length;
  return { required: req.length, done, allDone: req.length > 0 && done === req.length, anyDeclined: live.some((i) => i.status === "declined") };
}

// ── 我的文件 ─────────────────────────────────────────────────────────────────
export type Identity = { coachId?: string | null; clientUserId?: string | null };

/** 這個人是簽署人的所有實例（含已完成），新→舊。 */
export async function listMyInstances(me: Identity): Promise<InstanceWithSigners[]> {
  const conds = [];
  if (me.coachId) conds.push(eq(docSigners.coachId, me.coachId));
  if (me.clientUserId) conds.push(eq(docSigners.clientUserId, me.clientUserId));
  if (!conds.length) return [];
  const mine = await db.select({ id: docSigners.instanceId }).from(docSigners).where(or(...conds));
  const ids = [...new Set(mine.map((r) => r.id))];
  if (!ids.length) return [];
  const list = await db.select().from(docInstances).where(and(inArray(docInstances.id, ids), ne(docInstances.status, "void"))).orderBy(desc(docInstances.createdAt));
  return withSigners(list);
}

/** 輪到我簽、而且還沒簽的份數（首頁待辦用）。 */
export async function countMyPending(me: Identity): Promise<number> {
  const list = await listMyInstances(me);
  return list.filter((i) => i.status === "pending" && i.signers.some((s) => isSigner(s, me) && canSignNow(s, i.signers))).length;
}

// ── 簽署 ─────────────────────────────────────────────────────────────────────
export type SignInput = {
  instanceId: string;
  me: Identity;
  consent: boolean;
  answers?: unknown;     // 本人確認項的作答 {key: true/false}；必勾沒勾在這裡擋
  signatureImg: unknown;
  hashSeen: string;      // 簽署頁拿到的 instance.hash，確認按下時看到的就是現在這份
  saveAsDefault: boolean;
  ip: string | null;
  ua: string | null;
};
export type SignResult = { ok: true; completed: boolean; instance: InstanceWithSigners } | { ok: false; error: string };

export async function consentAndSign(input: SignInput): Promise<SignResult> {
  const inst = await getInstance(input.instanceId);
  if (!inst) return { ok: false, error: "找不到這份文件" };
  if (inst.status !== "pending") return { ok: false, error: "這份文件已經不在待簽狀態" };
  if (inst.expiresAt && inst.expiresAt < todayISO()) {
    await db.update(docInstances).set({ status: "expired", updatedAt: new Date() }).where(eq(docInstances.id, inst.id));
    return { ok: false, error: "簽署期限已過，請聯絡負責人重新啟動" };
  }
  const mine = inst.signers.find((s) => isSigner(s, input.me));
  if (!mine) return { ok: false, error: "你不是這份文件的簽署人" };
  if (!canSignNow(mine, inst.signers)) return { ok: false, error: mine.status === "signed" ? "你已經簽過這份文件" : "還沒輪到你簽署" };
  if (!input.consent) return { ok: false, error: "請先勾選同意" };
  if (input.hashSeen !== inst.hash) return { ok: false, error: "文件內容已更新，請重新載入後再確認" };
  const img = validSignaturePng(input.signatureImg);
  if (!img) return { ok: false, error: "簽名圖不正確，請重新簽一次" };
  // 本人確認項：依這一列的 role 取範本定義；必勾沒勾不給簽。範本列不在了（不該發生）就當沒有確認項。
  const tpl = await getTemplate(inst.templateId);
  const myAsks = asksForRole((tpl?.asks as DocAsk[] | undefined) ?? [], mine.role);
  const ans = checkAnswers(myAsks, input.answers);
  if (!ans.ok) return { ok: false, error: `請先確認：${ans.missing.map((a) => a.label).join("、")}` };

  const now = new Date();
  await db
    .update(docSigners)
    .set({ status: "signed", consentAt: now, answers: ans.answers, signatureImg: img, signedAt: now, ip: input.ip, ua: input.ua?.slice(0, 300) ?? null, hashAtSign: inst.hash })
    .where(and(eq(docSigners.id, mine.id), eq(docSigners.status, "pending")));
  if (input.saveAsDefault) {
    const owner: SignatureOwner | null = mine.coachId ? { kind: "coach", id: mine.coachId } : mine.clientUserId ? { kind: "client_user", id: mine.clientUserId } : null;
    if (owner) await saveSignature(owner, img).catch(() => {});
  }

  const after = await getInstance(inst.id);
  if (!after) return { ok: false, error: "寫入後讀不到文件" };
  const status = instanceStatusFrom(after.signers);
  if (status === "completed") {
    // 原始快照（hash／hash_at_sign 對應的內容）不動；貼了簽名的版本另存 signed_html，才能事後重算每位簽署人確認過的雜湊。
    const finalHtml = applySignatures(after.htmlSnapshot, after.signers, (tpl?.asks as DocAsk[] | undefined) ?? []);
    await db
      .update(docInstances)
      .set({ status: "completed", signedHtml: finalHtml, finalHash: sha256(finalHtml), completedAt: now, updatedAt: now })
      .where(and(eq(docInstances.id, inst.id), eq(docInstances.status, "pending")));
    const done = await getInstance(inst.id);
    return { ok: true, completed: true, instance: done ?? after };
  }
  return { ok: true, completed: false, instance: after };
}

export async function declineSign(instanceId: string, me: Identity, reason: string): Promise<{ ok: boolean; error?: string }> {
  const inst = await getInstance(instanceId);
  if (!inst) return { ok: false, error: "找不到這份文件" };
  if (inst.status !== "pending") return { ok: false, error: "這份文件已經不在待簽狀態" };
  const mine = inst.signers.find((s) => isSigner(s, me));
  if (!mine || mine.status !== "pending") return { ok: false, error: "你不是這份文件的待簽人" };
  const now = new Date();
  await db.batch([
    db.update(docSigners).set({ status: "declined", declineReason: reason.trim().slice(0, 400) || null, signedAt: now }).where(and(eq(docSigners.id, mine.id), eq(docSigners.status, "pending"))),
    db.update(docInstances).set({ status: "declined", updatedAt: now }).where(eq(docInstances.id, inst.id)),
  ]);
  return { ok: true };
}

/** 作廢（後台）：留痕不刪。作廢後同案同 key 可以重新啟動產新版本。 */
export async function voidInstance(instanceId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  // 已完成的合約不可作廢覆寫（需求書第十一節）：後續修訂另開新文件。
  const rows = await db
    .update(docInstances)
    .set({ status: "void", voidedAt: new Date(), voidReason: reason.trim().slice(0, 400) || null, updatedAt: new Date() })
    .where(and(eq(docInstances.id, instanceId), ne(docInstances.status, "void"), ne(docInstances.status, "completed")))
    .returning({ id: docInstances.id });
  return rows.length ? { ok: true } : { ok: false, error: "已完成的文件不能作廢；要修訂請另發新文件" };
}

/** 後台總覽：全部非 void 實例（可選狀態），新→舊。 */
export async function listAllInstances(opts: { status?: string; limit?: number } = {}): Promise<InstanceWithSigners[]> {
  const conds = [ne(docInstances.status, "void")];
  if (opts.status) conds.push(eq(docInstances.status, opts.status));
  const list = await db.select().from(docInstances).where(and(...conds)).orderBy(desc(docInstances.createdAt)).limit(opts.limit ?? 200);
  return withSigners(list);
}

/** 把逾期的待簽實例標成 expired（列表頁順手跑，不另開 cron）。 */
export async function sweepExpired(): Promise<number> {
  const today = todayISO();
  const rows = await db
    .update(docInstances)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(docInstances.status, "pending"), sql`${docInstances.expiresAt} < ${today}`, sql`${docInstances.expiresAt} is not null`))
    .returning({ id: docInstances.id });
  return rows.length;
}

// ── 設定（催簽天數）────────────────────────────────────────────────────────
export const DOC_SETTINGS_KEY = "doc_settings";
export const getDocSettings = unstable_cache(
  async (): Promise<DocSettings> => {
    try {
      const rows = await db.select().from(siteSettings).where(eq(siteSettings.key, DOC_SETTINGS_KEY)).limit(1);
      return rows[0] ? sanitizeDocSettings(rows[0].value) : DEFAULT_DOC_SETTINGS;
    } catch {
      return DEFAULT_DOC_SETTINGS;
    }
  },
  ["lantu-doc-settings"],
  { tags: [DOC_SEAL_TAG] },
);
export async function saveDocSettings(v: unknown, updatedBy: string | null): Promise<void> {
  const value = sanitizeDocSettings(v);
  await db.insert(siteSettings).values({ key: DOC_SETTINGS_KEY, value, updatedAt: new Date(), updatedBy }).onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date(), updatedBy } });
  updateTag(DOC_SEAL_TAG);
}

// ── 催簽與重新開放 ─────────────────────────────────────────────────────────
/**
 * 催簽（站內）：把「現在輪到、還沒簽」的簽署人記一次提醒。同一份一天最多一次。
 * 誰能催：這份文件的其他簽署人（例如教練催客戶）或後台管理員。
 */
export async function remindInstance(instanceId: string, by: Identity & { admin?: boolean }): Promise<{ ok: boolean; error?: string; reminded?: string[] }> {
  const inst = await getInstance(instanceId);
  if (!inst) return { ok: false, error: "找不到這份文件" };
  if (inst.status !== "pending") return { ok: false, error: "這份文件已經不在待簽狀態" };
  if (!by.admin && !inst.signers.some((s) => isSigner(s, by))) return { ok: false, error: "你不是這份文件的簽署人" };
  const targets = inst.signers.filter((s) => canSignNow(s, inst.signers) && !isSigner(s, by));
  if (!targets.length) return { ok: false, error: "現在輪到的是你自己，沒有人可以催" };
  const dayAgo = Date.now() - 86_400_000;
  const fresh = targets.filter((s) => !s.lastRemindedAt || s.lastRemindedAt.getTime() < dayAgo);
  if (!fresh.length) return { ok: false, error: "今天已經提醒過了，明天再催" };
  await db.update(docSigners).set({ remindCount: sql`${docSigners.remindCount} + 1`, lastRemindedAt: new Date() }).where(inArray(docSigners.id, fresh.map((s) => s.id)));
  return { ok: true, reminded: fresh.map((s) => s.displayName || s.label) };
}

/** 重新開放：逾期（或快逾期）的文件延長期限、回到待簽；不重建、不要求已簽的人重簽。 */
export async function reopenInstance(instanceId: string, days: number, by: Identity & { admin?: boolean }): Promise<{ ok: boolean; error?: string; expiresAt?: string }> {
  const inst = await getInstance(instanceId);
  if (!inst) return { ok: false, error: "找不到這份文件" };
  if (inst.status !== "pending" && inst.status !== "expired") return { ok: false, error: "只有待簽或逾期的文件可以延長" };
  // 只有後台或「教練端」簽署人（教練／成員／公司代表）能延長；客戶不能自己把過期合約重開。
  const coachSide = !!by.coachId && inst.signers.some((s) => s.coachId === by.coachId);
  if (!by.admin && !coachSide) return { ok: false, error: "只有負責教練或後台可以延長期限" };
  const d = Math.max(1, Math.min(365, Math.floor(days) || 14));
  const proposed = addDaysISO(todayISO(), d);
  // 只往後延、不縮短：原本期限更晚就維持原本的
  const expiresAt = inst.expiresAt && inst.expiresAt > proposed ? inst.expiresAt : proposed;
  await db.update(docInstances).set({ status: "pending", expiresAt, updatedAt: new Date() }).where(eq(docInstances.id, inst.id));
  return { ok: true, expiresAt };
}

/** 這個人身上有沒有「被催」的待簽文件（客戶 portal 橫幅用）。 */
export async function hasReminderFor(me: Identity): Promise<boolean> {
  const list = await listMyInstances(me);
  return list.some((i) => i.status === "pending" && i.signers.some((s) => isSigner(s, me) && s.status === "pending" && !!s.lastRemindedAt));
}

// ── 待辦（後台／教練）──────────────────────────────────────────────────────
export type DocTodo = {
  instance: InstanceWithSigners;
  kind: "stale" | "expired" | "declined";
  waitingOn: string;
  days: number;
  /** 2026/11/01：卡住的這份，本人那一格的人已經簽完「同範本同版本」的另一份 → 這份是重複的，建議作廢 */
  dupSigned?: { name: string; at: string } | null;
};

/** 卡住的文件：待簽超過 nudgeDays（從建立或最後一次催算）、逾期、拒簽。opts.coachId 只看那位教練是簽署人的。 */
export async function listDocTodos(opts: { coachId?: string } = {}): Promise<DocTodo[]> {
  const { nudgeDays } = await getDocSettings();
  await sweepExpired();
  const list = opts.coachId ? await listMyInstances({ coachId: opts.coachId }) : await listAllInstances({ limit: 500 });
  const now = new Date();
  const out: DocTodo[] = [];
  for (const i of list) {
    const pendingNow = i.signers.filter((s) => canSignNow(s, i.signers));
    const waitingOn = pendingNow.map((s) => s.displayName || s.label).join("、");
    const lastRemind = pendingNow.map((s) => s.lastRemindedAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);
    const base = Math.max(new Date(i.createdAt).getTime(), lastRemind || 0);
    const days = Math.floor((now.getTime() - base) / 86_400_000);
    if (i.status === "declined") out.push({ instance: i, kind: "declined", waitingOn: i.signers.find((s) => s.status === "declined")?.displayName ?? "", days });
    else if (i.status === "expired") out.push({ instance: i, kind: "expired", waitingOn, days });
    else if (isStale(i, lastRemind ? new Date(lastRemind) : null, nudgeDays, now)) out.push({ instance: i, kind: "stale", waitingOn, days });
  }
  await markDupSigned(out);
  return out;
}

/**
 * 重複發出的偵測（2026/11/01 Ray：邱浩軍拒簽「我剛剛簽過了」）：本人那一格（member／coach）的人，
 * 同範本同版本已經有一份「已完成」→ 這份卡住的是重複的。只讀不改，給清單標示與作廢原因預填。
 */
async function markDupSigned(todos: DocTodo[]) {
  const want = todos.flatMap((t) => t.instance.signers
    .filter((s) => (s.role === "member" || s.role === "coach") && s.coachId && s.status !== "signed")
    .map((s) => ({ t, coachId: s.coachId as string, name: s.displayName || s.label })));
  if (!want.length) return;
  // 兩段查（不用 join）：先找同範本已完成的文件，再找那些文件裡這幾個人的簽名。標示失敗不該拖垮整個待辦清單。
  let rows: { coachId: string | null; signedAt: Date | null; key: string; version: number; id: string }[] = [];
  try {
    const insts = await db.select({ id: docInstances.id, key: docInstances.templateKey, version: docInstances.version }).from(docInstances)
      .where(and(eq(docInstances.status, "completed"), inArray(docInstances.templateKey, [...new Set(want.map((w) => w.t.instance.templateKey))])));
    if (!insts.length) return;
    const sg = await db.select({ coachId: docSigners.coachId, signedAt: docSigners.signedAt, instanceId: docSigners.instanceId }).from(docSigners)
      .where(and(inArray(docSigners.instanceId, insts.map((i) => i.id)), inArray(docSigners.coachId, [...new Set(want.map((w) => w.coachId))])));
    rows = sg.flatMap((x) => { const i = insts.find((y) => y.id === x.instanceId); return i ? [{ coachId: x.coachId, signedAt: x.signedAt, key: i.key, version: i.version, id: i.id }] : []; });
  } catch {
    return;
  }
  for (const w of want) {
    if (w.t.dupSigned) continue;
    const hit = rows.find((r) => r.coachId === w.coachId && r.key === w.t.instance.templateKey && r.version === w.t.instance.version && r.id !== w.t.instance.id);
    if (hit) w.t.dupSigned = { name: w.name, at: hit.signedAt ? new Date(hit.signedAt).toISOString().slice(0, 10) : "" };
  }
}

// ── 補簽任務 ─────────────────────────────────────────────────────────────────
export type DocTask = typeof docTasks.$inferSelect;
export type DocTaskView = DocTask & { total: number; done: number; rows: { coachId: string; name: string; instanceId: string | null; status: string }[] };

/**
 * 建立補簽任務：用範本「最新啟用版」替每位對象產一份實例（case_type='coach_doc'，case_id=`${taskId}:${coachId}`）。
 * 簽署人＝那位教練本人（member）；範本若有 company 簽名位，由建立任務的管理員擔任。
 */
/**
 * 補簽時要略過的人（LT04，2026/10/29 Ray 定案）：同一份範本「同一版本」已經有待簽或已完成的文件
 * （不管是從報聘培訓流程來的、還是之前的補簽任務），且他是本人那一格（member／coach）。
 * 拒簽、逾期、作廢的不算——那些要重發。重試時已成功建立的也因此不會重複產生。
 */
export async function coachesWithLiveDoc(templateKey: string, version: number, coachIds: string[]): Promise<Set<string>> {
  if (!coachIds.length) return new Set();
  const insts = await db.select({ id: docInstances.id }).from(docInstances)
    .where(and(eq(docInstances.templateKey, templateKey), eq(docInstances.version, version), inArray(docInstances.status, ["pending", "completed"])));
  if (!insts.length) return new Set();
  const rows = await db.select({ coachId: docSigners.coachId, role: docSigners.role }).from(docSigners)
    .where(and(inArray(docSigners.instanceId, insts.map((i) => i.id)), inArray(docSigners.coachId, coachIds)));
  return new Set(rows.filter((r) => r.role === "member" || r.role === "coach").map((r) => r.coachId).filter((x): x is string => !!x));
}

export type DocTaskResult = { ok: true; task: DocTask | null; title: string; created: number; skipped: string[]; already: string[] } | { ok: false; error: string };

export async function createDocTask(input: { templateKey: string; coachIds: string[]; deadline: string | null; note?: string }, createdBy: string): Promise<DocTaskResult> {
  const t = await latestEnabledTemplate(input.templateKey);
  if (!t) return { ok: false, error: "找不到啟用中的範本" };
  const ids = [...new Set(input.coachIds.filter(Boolean))];
  if (!ids.length) return { ok: false, error: "請選至少一位對象" };
  const allPeople = await db.select({ id: coaches.id, name: coachDisplayName, email: coaches.email, code: coaches.code }).from(coaches).where(inArray(coaches.id, ids));
  const live = await coachesWithLiveDoc(t.key, t.version, ids);
  const already = allPeople.filter((p) => live.has(p.id)).map((p) => p.name ?? p.id);
  const people = allPeople.filter((p) => !live.has(p.id));
  const targets = ids.filter((id) => !live.has(id));
  if (!targets.length) return { ok: true, task: null, title: t.name, created: 0, skipped: [], already };
  const admin = (await db.select({ id: coaches.id, name: coachDisplayName }).from(coaches).where(eq(coaches.id, createdBy)).limit(1))[0];
  const deadline = input.deadline && /^\d{4}-\d{2}-\d{2}$/.test(input.deadline) ? input.deadline : null;
  const [task] = await db.insert(docTasks).values({ templateKey: t.key, templateVersion: t.version, title: t.name, deadline, targetCoachIds: targets, note: (input.note ?? "").trim().slice(0, 400), createdBy }).returning();
  const seal = (await getDocSeal()).img;
  let created = 0;
  const skipped: string[] = [];
  for (const p of people) {
    const resolved = resolveSlots(t.signers as DocSignerSlot[], { member: { coachId: p.id, name: p.name ?? "" }, coach: { coachId: p.id, name: p.name ?? "" }, company: admin ? { coachId: admin.id, name: admin.name ?? "" } : null });
    if (!resolved.ok) { skipped.push(p.name ?? p.id); continue; }
    const docNo = await allocCode(DOC_NO_KIND.coach_doc);
    const prof = await getSignerProfile({ kind: "coach", id: p.id });
    const html = coachDocHtml(t, p, { docNo, deadline, today: todayISO(), prof, seal });
    const ok = await insertInstanceWithSigners(
      { id: crypto.randomUUID(), caseType: "coach_doc", caseId: `${task.id}:${p.id}`, templateId: t.id, templateKey: t.key, version: t.version, title: t.name, docNo, required: t.required, htmlSnapshot: html, hash: sha256(html), status: "pending", expiresAt: deadline, createdBy },
      resolved.signers.map((s) => ({ ...s, status: "pending" })),
    );
    if (ok) created++;
  }
  return { ok: true, task, title: t.name, created, skipped, already };
}

/** 補簽文件（coach_doc）的內容：建立與重產（LT12）共用同一套變數。 */
function coachDocHtml(
  t: Pick<DocTemplate, "name" | "html" | "signers" | "useSeal" | "asks">,
  p: { name: string | null; email: string | null; code: string | null },
  o: { docNo: string; deadline: string | null; today: string; prof: SignerProfile | null; seal: string | null },
): string {
  const vars: DocVars = { title: t.name, today: o.today, "doc.no": o.docNo, "doc.expires": o.deadline ?? "", esign_clause: E_SIGN_CLAUSE, "member.name": p.name ?? "", "member.email": p.email ?? "", "member.code": p.code ?? "", ...profileVars("member", o.prof, { email: p.email ?? "" }) };
  return renderTemplate({ html: sanitizeTemplateHtml(t.html), signers: t.signers as DocSignerSlot[], useSeal: t.useSeal, asks: t.asks as DocAsk[] }, vars, { seal: o.seal });
}

/** 範本有沒有用到「要本人填」的簽約資料欄位（成員身分證、電話、地址…）。 */
export function usesPersonVars(html: string): boolean {
  return varsInHtml(html).some((k) => k.startsWith("member.") && varDef(k)?.need === "person");
}

/**
 * LT12（2026/10/29）：已開通教練的補簽文件，當初發出時他還沒填簽約資料 → 身分證／電話／地址空白。
 * 他補填之後，把「還沒有任何人簽過」的補簽文件用新資料重產（快照與雜湊一起換，簽署頁會重新載入新雜湊）。
 * 已有人簽過、已完成、拒簽、作廢的一律不動（Ray：已簽完的不改寫）。回傳重產了幾份。
 */
export async function refreshUnsignedCoachDocs(coachId: string): Promise<number> {
  const mine = await db.select({ instanceId: docSigners.instanceId, role: docSigners.role }).from(docSigners).where(eq(docSigners.coachId, coachId));
  const ids = [...new Set(mine.filter((r) => r.role === "member").map((r) => r.instanceId))];
  if (!ids.length) return 0;
  const insts = await db.select().from(docInstances).where(and(inArray(docInstances.id, ids), eq(docInstances.caseType, "coach_doc"), eq(docInstances.status, "pending")));
  if (!insts.length) return 0;
  const all = await db.select().from(docSigners).where(inArray(docSigners.instanceId, insts.map((i) => i.id)));
  const [p] = await db.select({ id: coaches.id, name: coachDisplayName, email: coaches.email, code: coaches.code }).from(coaches).where(eq(coaches.id, coachId)).limit(1);
  if (!p) return 0;
  const prof = await getSignerProfile({ kind: "coach", id: coachId });
  const seal = (await getDocSeal()).img;
  let n = 0;
  for (const inst of insts) {
    if (all.some((s) => s.instanceId === inst.id && s.status !== "pending")) continue;
    const t = await getTemplate(inst.templateId);
    if (!t || !usesPersonVars(t.html)) continue;
    const today = inst.createdAt ? fmtDateTaipei(inst.createdAt) : todayISO();
    const html = coachDocHtml(t, p, { docNo: inst.docNo ?? "", deadline: inst.expiresAt, today, prof, seal });
    if (html === inst.htmlSnapshot) continue;
    await db.update(docInstances).set({ htmlSnapshot: html, hash: sha256(html), updatedAt: new Date() }).where(and(eq(docInstances.id, inst.id), eq(docInstances.status, "pending")));
    n++;
  }
  return n;
}

export async function listDocTasks(): Promise<DocTaskView[]> {
  const tasks = await db.select().from(docTasks).orderBy(desc(docTasks.createdAt));
  if (!tasks.length) return [];
  const insts = await db.select().from(docInstances).where(and(eq(docInstances.caseType, "coach_doc"), ne(docInstances.status, "void")));
  const ids = [...new Set(tasks.flatMap((t) => t.targetCoachIds))];
  const names = ids.length ? await db.select({ id: coaches.id, name: coachDisplayName }).from(coaches).where(inArray(coaches.id, ids)) : [];
  const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? id.slice(0, 8);
  return tasks.map((t) => {
    const rows = t.targetCoachIds.map((cid) => {
      const inst = insts.find((i) => i.caseId === `${t.id}:${cid}`) ?? null;
      return { coachId: cid, name: nameOf(cid), instanceId: inst?.id ?? null, status: inst?.status ?? "none" };
    });
    return { ...t, total: rows.length, done: rows.filter((r) => r.status === "completed").length, rows };
  });
}
