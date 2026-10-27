// 電子簽署的資料層：範本（版本化）、範本組合、公司印鑑、文件實例與簽署人、預存簽名檔。
// 規則與型別住 lib/docs.ts；這一支只管「存在哪、什麼順序寫、什麼時候鎖」。
//
// ⚠️ neon-http 沒有互動式交易：多列一起寫用 db.batch()（單一交易）。
// ⚠️ startSigning 必須冪等：同案同範本 key 在非 void 狀態下只能有一份（部分唯一索引守著），
//    重複按「啟動」回既有進度，不重產、不重寄。
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { unstable_cache, updateTag } from "next/cache";
import { db } from "@/Shared/db";
import { docInstances, docSets, docSigners, docTemplates, signatures, siteSettings } from "@/Shared/db/schema";
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
  validSignaturePng,
  validateTemplate,
  type DocCategory,
  type DocSetKind,
  type DocSignerSlot,
  type DocVars,
  type SlotContext,
  type TemplateInput,
} from "./docs";
import { addDaysISO, todayISO } from "./license";

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
export async function listTemplates(): Promise<DocTemplate[]> {
  return db.select().from(docTemplates).orderBy(asc(docTemplates.category), asc(docTemplates.key), desc(docTemplates.version));
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
    .where(and(eq(docTemplates.key, key), eq(docTemplates.enabled, true)))
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
    note: String(x.note ?? "").trim().slice(0, 400),
  };
}

/**
 * 存範本：沒有 key＝新文件（version 1）；有 key＝**插新版本**（舊版列不動——已發出的實例指著舊版本列）。
 * 回傳新列。錯誤用 Error(訊息) 丟出讓 action 直接給人看。
 */
export async function saveTemplate(raw: unknown, createdBy: string | null): Promise<DocTemplate> {
  const t = sanitizeTemplateInput(raw);
  const errs = validateTemplate(t);
  if (errs.length) throw new Error(errs.join("；"));
  const key = t.key ?? crypto.randomUUID();
  let version = 1;
  if (t.key) {
    const prev = await db.select({ v: docTemplates.version }).from(docTemplates).where(eq(docTemplates.key, key)).orderBy(desc(docTemplates.version)).limit(1);
    version = (prev[0]?.v ?? 0) + 1;
  }
  const rows = await db
    .insert(docTemplates)
    .values({
      key,
      version,
      category: t.category,
      name: t.name,
      html: t.html,
      useSeal: t.useSeal,
      required: t.required,
      signDays: t.signDays,
      signers: t.signers,
      note: t.note ?? "",
      createdBy,
    })
    .returning();
  return rows[0];
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

export async function deleteSignature(o: SignatureOwner): Promise<void> {
  await db.delete(signatures).where(and(eq(signatures.ownerKind, o.kind), eq(signatures.ownerId, o.id)));
}

// ── 啟動簽署 ─────────────────────────────────────────────────────────────────
export type StartSigningInput = {
  caseType: DocCategory;
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
  const toCreate: { inst: typeof docInstances.$inferInsert; signers: Omit<typeof docSigners.$inferInsert, "instanceId">[] }[] = [];
  for (const t of templates) {
    if (live.some((i) => i.templateKey === t.key && i.status !== "void")) continue;
    const resolved = resolveSlots(t.signers as DocSignerSlot[], input.ctx);
    if (!resolved.ok) return { ok: false, error: `「${t.name}」缺少簽署人：${resolved.missing.map((r) => ({ company: "公司代表", member: "成員", client: "客戶", coach: "教練" })[r]).join("、")}` };
    const html = renderTemplate({ html: t.html, signers: t.signers as DocSignerSlot[], useSeal: t.useSeal }, input.vars, { seal });
    toCreate.push({
      inst: {
        caseType: input.caseType,
        caseId: input.caseId,
        templateId: t.id,
        templateKey: t.key,
        version: t.version,
        title: t.name,
        required: t.required,
        htmlSnapshot: html,
        hash: sha256(html),
        status: "pending",
        expiresAt: t.signDays ? addDaysISO(today, t.signDays) : null,
        createdBy: input.createdBy,
      },
      signers: resolved.signers.map((s) => ({ ...s, status: "pending" })),
    });
  }

  for (const c of toCreate) {
    // 一份實例＋它的簽署人一起寫；實例先拿 id，再 batch 寫簽署人。
    const [inst] = await db.insert(docInstances).values(c.inst).onConflictDoNothing().returning();
    if (!inst) continue; // 同時有人按了啟動：部分唯一索引擋下，沿用對方那一份
    if (c.signers.length) await db.insert(docSigners).values(c.signers.map((s) => ({ ...s, instanceId: inst.id })));
  }
  const all = await listInstancesForCase(input.caseType, input.caseId);
  return { ok: true, instances: all.filter((i) => i.status !== "void"), created: toCreate.length, existing: live.length, noTemplates: false };
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

  const now = new Date();
  await db
    .update(docSigners)
    .set({ status: "signed", consentAt: now, signatureImg: img, signedAt: now, ip: input.ip, ua: input.ua?.slice(0, 300) ?? null, hashAtSign: inst.hash })
    .where(and(eq(docSigners.id, mine.id), eq(docSigners.status, "pending")));
  if (input.saveAsDefault) {
    const owner: SignatureOwner | null = mine.coachId ? { kind: "coach", id: mine.coachId } : mine.clientUserId ? { kind: "client_user", id: mine.clientUserId } : null;
    if (owner) await saveSignature(owner, img).catch(() => {});
  }

  const after = await getInstance(inst.id);
  if (!after) return { ok: false, error: "寫入後讀不到文件" };
  const status = instanceStatusFrom(after.signers);
  if (status === "completed") {
    const finalHtml = applySignatures(after.htmlSnapshot, after.signers);
    await db
      .update(docInstances)
      .set({ status: "completed", htmlSnapshot: finalHtml, finalHash: sha256(finalHtml), completedAt: now, updatedAt: now })
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
    db.update(docSigners).set({ status: "declined", declineReason: reason.trim().slice(0, 400) || null, signedAt: now }).where(eq(docSigners.id, mine.id)),
    db.update(docInstances).set({ status: "declined", updatedAt: now }).where(eq(docInstances.id, inst.id)),
  ]);
  return { ok: true };
}

/** 作廢（後台）：留痕不刪。作廢後同案同 key 可以重新啟動產新版本。 */
export async function voidInstance(instanceId: string, reason: string): Promise<void> {
  await db
    .update(docInstances)
    .set({ status: "void", voidedAt: new Date(), voidReason: reason.trim().slice(0, 400) || null, updatedAt: new Date() })
    .where(and(eq(docInstances.id, instanceId), ne(docInstances.status, "void")));
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
