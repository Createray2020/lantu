// 服務年期（原「顧問服務案件」，2026/10/28 案件進度定案後改名）：收款、合約、發票的共同關聯單位，掛在服務案件（caseStore）底下。
// 一客戶一案件；首次委任＝第一期、年度續約＝下一期。建第一期時順便 ensureCase（案件主軸）。
//
// 三個入口都落到這裡：建客戶時勾「建立付費顧問服務案件」／客戶頁「收款與合約」／新年度續約。
// 三組狀態各自獨立、各自可追溯：
//   · 收款：acct_receipts(case_type='client_service', case_id)，verified 由帳務後台改
//   · 合約：doc_instances(case_type='client_service')
//   · 發票：invoices(case_type, case_id)，公司人工回填
// 「啟動簽約流程」的門檻在後端（startCaseSigning）：主責教練本人＋全額確認＋客戶已綁帳號。
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, clientUsers, coaches, coachDisplayName, invoices, serviceTerms } from "@/Shared/db/schema";
import { ensureCase, autoCheck, completeStage, getCase, getCaseByClient, stagesOf } from "./caseStore";
import { getAcctState, createCoachFeeReceipt, receiptsForCase, type CoachFeeInput } from "./acctStore";
import { caseFunding, type Receipt } from "./acctEngine";
import { startSigning, listInstancesForCase, withSigners, caseProgress, isUniqueViolation, type InstanceWithSigners } from "./docsStore";
import { getBrand, getOrgOwnerId } from "./brand";
import { E_SIGN_CLAUSE, type DocVars } from "./docs";
import { todayISO } from "./license";
import { fmtMoney0 } from "./money";

export type ServiceTerm = typeof serviceTerms.$inferSelect;
/** @deprecated 舊名，等於 ServiceTerm（年期）。案件主軸請用 caseStore.ServiceCase。 */
export type ServiceCase = ServiceTerm;
export type Invoice = typeof invoices.$inferSelect;

export type CaseInput = {
  itemId: string;
  kind?: "first" | "renewal";
  serviceYear?: number;
  from?: string | null;
  to?: string | null;
  amountDue: number;
  promoCoachId?: string | null;
  taxIncl?: boolean;
  note?: string;
};

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ── 建案 ─────────────────────────────────────────────────────────────────────
/**
 * 替客戶建一個服務案件。方案一定要是後台建好的營業項目（沒建的服務不能拿來簽）。
 * 案件編號＝客戶編號-序；同客戶同年度已有未終止的案就回既有那一案（同年度加試算版本不等於新案）。
 */
export async function createServiceCase(coachId: string, clientId: string, input: CaseInput): Promise<{ ok: true; case: ServiceCase; existed: boolean } | { ok: false; error: string }> {
  const S = await getAcctState();
  const item = S.items.find((i) => i.id === input.itemId);
  if (!item) return { ok: false, error: "方案不存在：請先在帳務後台建立這個營業項目" };
  const [client] = await db.select({ id: clients.id, code: clients.code, coachId: clients.coachId }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return { ok: false, error: "找不到客戶" };
  const year = input.serviceYear ?? Number(todayISO().slice(0, 4));
  const existing = await db
    .select()
    .from(serviceTerms)
    .where(and(eq(serviceTerms.clientId, clientId), eq(serviceTerms.serviceYear, year)))
    .orderBy(desc(serviceTerms.createdAt));
  const live = existing.find((c) => c.status === "open" || c.status === "completed");
  if (live) return { ok: true, case: live, existed: true };

  const prior = await db.select({ id: serviceTerms.id }).from(serviceTerms).where(eq(serviceTerms.clientId, clientId));
  const kind = input.kind ?? (prior.length ? "renewal" : "first");
  // 案件主軸：一客戶一案件，第一期建立時一起長出來（冪等）
  const mainCase = await ensureCase(clientId, client.coachId ?? coachId, { type: "coach", id: coachId });
  const base = client.code ?? clientId.slice(0, 8);
  let seq = prior.length + 1;
  // 編號唯一：萬一撞到（同客戶以前有終止的案）就往後找
  for (let i = 0; i < 20; i++) {
    const caseNo = `${base}-${seq}`;
    const amountDue = Math.max(0, Number(input.amountDue) || item.price || 0);
    try {
      const [row] = await db
        .insert(serviceTerms)
        .values({
          caseId: mainCase.id, clientId, coachId, promoCoachId: input.promoCoachId ?? null, caseNo, kind, itemId: item.id, itemName: item.name, serviceYear: year,
          fromDate: isDate(input.from) ? input.from : null, toDate: isDate(input.to) ? input.to : null, amountDue, taxIncl: input.taxIncl !== false,
          note: (input.note ?? "").trim().slice(0, 400),
        })
        .returning();
      return { ok: true, case: row, existed: false };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // 撞到的是「同客戶同年度已有活案」的索引（雙擊）→ 回既有那一案；撞到案號就往後找
      const again = (await db.select().from(serviceTerms).where(and(eq(serviceTerms.clientId, clientId), eq(serviceTerms.serviceYear, year))).orderBy(desc(serviceTerms.createdAt)))
        .find((c) => c.status === "open" || c.status === "completed");
      if (again) return { ok: true, case: again, existed: true };
      seq++;
    }
  }
  return { ok: false, error: "案件編號配不出來，請再試一次" };
}

export async function getServiceCase(id: string): Promise<ServiceCase | null> {
  const rows = await db.select().from(serviceTerms).where(eq(serviceTerms.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listCasesForClient(clientId: string): Promise<ServiceCase[]> {
  return db.select().from(serviceTerms).where(eq(serviceTerms.clientId, clientId)).orderBy(desc(serviceTerms.serviceYear), desc(serviceTerms.createdAt));
}

// ── 檢視（三組狀態）──────────────────────────────────────────────────────────
export type CaseView = {
  case: ServiceCase;
  receipts: Receipt[];
  funding: ReturnType<typeof caseFunding>;
  docs: InstanceWithSigners[];
  progress: ReturnType<typeof caseProgress>;
  invoice: Invoice | null;
  clientBound: boolean;      // 客戶已綁登入帳號（才有簽約人）
};

export async function caseView(c: ServiceCase): Promise<CaseView> {
  const [receipts, instances, inv, cl] = await Promise.all([
    receiptsForCase("client_service", c.id),
    listInstancesForCase("client_service", c.id),
    db.select().from(invoices).where(and(eq(invoices.caseType, "client_service"), eq(invoices.caseId, c.id))).orderBy(desc(invoices.createdAt)).limit(1),
    db.select({ cu: clients.clientUserId }).from(clients).where(eq(clients.id, c.clientId)).limit(1),
  ]);
  const live = instances.filter((i) => i.status !== "void");
  return {
    case: c,
    receipts,
    funding: caseFunding(receipts, c.amountDue),
    docs: await withSigners(live),
    progress: caseProgress(live),
    invoice: inv[0] ?? null,
    clientBound: !!(c.signerClientUserId || cl[0]?.cu),
  };
}

// ── 收款 ─────────────────────────────────────────────────────────────────────
/** 替案件記一筆付款（教練登錄，待後台查帳）。走顧問費那條（有執案／開發教練、拆分快照）。 */
export async function addCasePayment(coachId: string, c: ServiceCase, clientName: string, input: Omit<CoachFeeInput, "clientId" | "clientName" | "caseId" | "itemId" | "promoCoachId">): Promise<string | null> {
  return createCoachFeeReceipt(coachId, { ...input, clientId: c.clientId, clientName, caseId: c.id, itemId: c.itemId, promoCoachId: c.promoCoachId ?? null });
}

// ── 啟動簽約 ─────────────────────────────────────────────────────────────────
export type StartCaseResult = { ok: true; docs: number; noTemplates: boolean } | { ok: false; error: string; needLogin?: boolean };

/**
 * 教練按「啟動簽約流程」。後端驗：本人是主責教練、收款達全額、客戶已綁帳號、方案有範本組合。
 * 冪等：再按回既有進度。公司簽名位（若範本有）＝組織擁有者。
 */
export async function startCaseSigning(coachId: string, caseId: string): Promise<StartCaseResult> {
  const c = await getServiceCase(caseId);
  if (!c) return { ok: false, error: "找不到案件" };
  if (c.coachId !== coachId) return { ok: false, error: "只有主責教練可以啟動簽約" };
  if (c.status === "terminated" || c.status === "refunded") return { ok: false, error: "這個案件已終止" };
  const funding = caseFunding(await receiptsForCase("client_service", c.id), c.amountDue);
  if (!funding.met) return { ok: false, error: `公司尚未確認全額收款：應收 ${fmtMoney0(c.amountDue)}，已確認 ${fmtMoney0(funding.confirmed)}${funding.pending ? `（${fmtMoney0(funding.pending)} 待查帳）` : ""}` };

  const [cl] = await db.select({ name: clients.name, cu: clients.clientUserId, contact: clients.contact }).from(clients).where(eq(clients.id, c.clientId)).limit(1);
  if (!cl) return { ok: false, error: "找不到客戶" };
  const signerId = c.signerClientUserId ?? cl.cu ?? null;
  if (!signerId) return { ok: false, error: "客戶還沒有登入帳號：先用「專用登入連結」讓客戶登入綁定，再啟動簽約", needLogin: true };
  if (!c.signerClientUserId) await db.update(serviceTerms).set({ signerClientUserId: signerId, updatedAt: new Date() }).where(eq(serviceTerms.id, c.id));

  const [[cu], [co], ownerId, brand] = await Promise.all([
    db.select({ id: clientUsers.id, name: clientUsers.name, email: clientUsers.email }).from(clientUsers).where(eq(clientUsers.id, signerId)).limit(1),
    db.select({ id: coaches.id, name: coachDisplayName, code: coaches.code }).from(coaches).where(eq(coaches.id, c.coachId)).limit(1),
    getOrgOwnerId(),
    getBrand(),
  ]);
  const owner = ownerId ? (await db.select({ id: coaches.id, name: coachDisplayName }).from(coaches).where(eq(coaches.id, ownerId)).limit(1))[0] : null;
  const vars: DocVars = {
    today: todayISO(),
    esign_clause: E_SIGN_CLAUSE,
    "company.name": brand.brandName,
    "client.name": cl.name,
    "client.email": cu?.email ?? cl.contact?.email ?? "",
    "coach.name": co?.name ?? "",
    "coach.code": co?.code ?? "",
    "item.name": c.itemName,
    "item.price": fmtMoney0(c.amountDue),
    "case.amount": fmtMoney0(c.amountDue),
    "case.no": c.caseNo,
    "case.from": c.fromDate ?? "",
    "case.to": c.toDate ?? "",
  };
  const r = await startSigning({
    caseType: "client_service",
    caseId: c.id,
    setKind: "service_item",
    setRef: c.itemId,
    vars,
    ctx: {
      client: { clientUserId: signerId, name: cl.name },
      coach: co ? { coachId: co.id, name: co.name ?? "" } : null,
      company: owner ? { coachId: owner.id, name: owner.name ?? "" } : null,
    },
    createdBy: coachId,
  });
  if (!r.ok) return r;
  if (r.noTemplates) return { ok: false, error: `「${c.itemName}」還沒有掛合約範本：請到後台「電子簽署 › 範本組合」設定` };
  return { ok: true, docs: r.instances.length, noTemplates: false };
}

/** 文件全部簽完（docsHooks）：這一期合約標完成（不是結案），並送出階段 4 的完成訊號。冪等。 */
export async function onCaseDocsCompleted(termId: string): Promise<void> {
  const c = await getServiceCase(termId);
  if (!c || c.status !== "open") return;
  const live = (await listInstancesForCase("client_service", c.id)).filter((i) => i.status !== "void");
  if (live.length && caseProgress(live).allDone) {
    await db.update(serviceTerms).set({ status: "completed", updatedAt: new Date() }).where(and(eq(serviceTerms.id, c.id), eq(serviceTerms.status, "open")));
    await recheckCommission(c.clientId);
  }
}

/**
 * 階段 4「正式委託」的完成訊號（三個既有零件）：合約完成＋全額收款確認＋客戶已綁登入帳號。
 * 三個各自發生時都呼叫這裡；三個都到齊就自動推進到階段 5。只對第一期（kind=first）判定——
 * 續約期的簽約／收款不會把案件退回第 4 階。冪等。
 */
export async function recheckCommission(clientId: string): Promise<void> {
  const bundle = await getCaseByClient(clientId);
  if (!bundle || bundle.case.status === "closed") return;
  const terms = await listCasesForClient(clientId);
  const first = terms.find((t) => t.kind === "first" && t.status !== "terminated" && t.status !== "refunded") ?? terms[terms.length - 1];
  if (!first) return;
  const [cl] = await db.select({ cu: clients.clientUserId }).from(clients).where(eq(clients.id, clientId)).limit(1);
  const bound = !!(first.signerClientUserId || cl?.cu);
  const funding = caseFunding(await receiptsForCase("client_service", first.id), first.amountDue);
  const live = (await listInstancesForCase("client_service", first.id)).filter((i) => i.status !== "void");
  const signed = live.length > 0 && caseProgress(live).allDone;
  const caseId = bundle.case.id;
  if (signed) await autoCheck(caseId, "commission", "contract");
  if (funding.met) await autoCheck(caseId, "commission", "paid");
  if (bound) await autoCheck(caseId, "commission", "setup");
  if (bundle.case.stage === "commission" && signed && funding.met && bound) {
    await completeStage(caseId, "commission", { type: "system", name: "系統" }, { auto: true, reason: "合約完成＋收款確認＋客戶已開通會員中心" });
  }
}

/** 給客戶頁／會員中心：案件主軸＋年期一起拿。 */
export async function caseWithTerms(clientId: string) {
  const bundle = await getCaseByClient(clientId);
  const terms = await listCasesForClient(clientId);
  return { bundle, terms };
}
export { getCase as getMainCase, stagesOf as mainCaseStages };

// ── 發票（公司端）────────────────────────────────────────────────────────────
export type InvoiceQueueRow = {
  caseType: "client_service" | "training";
  caseId: string;
  label: string;          // 客戶名／申請人名
  itemName: string;
  amountDue: number;
  confirmed: number;
  met: boolean;
  coachName: string;
  invoice: Invoice | null;
};

/** 發票待辦：收款達門檻（或已有發票列）的案件，顧問服務＋培訓都列。 */
export async function invoiceQueue(): Promise<InvoiceQueueRow[]> {
  const [cases, invs] = await Promise.all([
    db.select({ c: serviceTerms, clientName: clients.name, coachName: coachDisplayName }).from(serviceTerms).innerJoin(clients, eq(clients.id, serviceTerms.clientId)).leftJoin(coaches, eq(coaches.id, serviceTerms.coachId)).orderBy(desc(serviceTerms.createdAt)),
    db.select().from(invoices).orderBy(desc(invoices.createdAt)),
  ]);
  const invOf = (t: string, id: string) => invs.find((i) => i.caseType === t && i.caseId === id) ?? null;
  const out: InvoiceQueueRow[] = [];
  for (const row of cases) {
    const f = caseFunding(await receiptsForCase("client_service", row.c.id), row.c.amountDue);
    const inv = invOf("client_service", row.c.id);
    if (!f.met && !inv && f.confirmed <= 0) continue;
    out.push({ caseType: "client_service", caseId: row.c.id, label: row.clientName, itemName: row.c.itemName, amountDue: row.c.amountDue, confirmed: f.confirmed, met: f.met, coachName: row.coachName ?? "", invoice: inv });
  }
  // 培訓案件
  const { trainingEnrollments } = await import("@/Shared/db/schema");
  const enrs = await db.select({ e: trainingEnrollments, name: coachDisplayName }).from(trainingEnrollments).leftJoin(coaches, eq(coaches.id, trainingEnrollments.coachId)).orderBy(desc(trainingEnrollments.createdAt));
  for (const row of enrs) {
    if (row.e.reviewStage === "cancelled") continue;
    const f = caseFunding(await receiptsForCase("training", row.e.id), row.e.amountDue);
    const inv = invOf("training", row.e.id);
    if (!f.met && !inv && f.confirmed <= 0) continue;
    out.push({ caseType: "training", caseId: row.e.id, label: row.name ?? "", itemName: row.e.itemName, amountDue: row.e.amountDue, confirmed: f.confirmed, met: f.met, coachName: "", invoice: inv });
  }
  return out;
}

export type InvoiceInput = { buyerKind?: string; title?: string; taxId?: string; email?: string; carrier?: string; invoiceNo?: string; issuedOn?: string | null; amount?: number; status?: string; failReason?: string; note?: string };
const INV_STATUS = new Set(["pending", "issued", "failed", "voided", "allowance"]);

/** 回填發票（一案一列；再存＝更新）。 */
export async function upsertInvoice(caseType: "client_service" | "training", caseId: string, input: InvoiceInput, handlerId: string | null): Promise<Invoice> {
  const clip = (v: unknown, n = 120) => String(v ?? "").trim().slice(0, n);
  const set = {
    buyerKind: input.buyerKind === "company" ? "company" : "person",
    title: clip(input.title), taxId: clip(input.taxId, 20), email: clip(input.email), carrier: clip(input.carrier, 40), invoiceNo: clip(input.invoiceNo, 20),
    issuedOn: isDate(input.issuedOn) ? input.issuedOn : null, amount: Math.max(0, Number(input.amount) || 0),
    status: INV_STATUS.has(String(input.status)) ? String(input.status) : "pending", failReason: clip(input.failReason, 400), note: clip(input.note, 400),
    handlerId, updatedAt: new Date(),
  };
  const [row] = await db
    .insert(invoices)
    .values({ caseType, caseId, ...set })
    .onConflictDoUpdate({ target: [invoices.caseType, invoices.caseId], set })
    .returning();
  return row;
}

export async function invoicesForCases(caseType: string, ids: string[]): Promise<Record<string, Invoice>> {
  if (!ids.length) return {};
  const rows = await db.select().from(invoices).where(and(eq(invoices.caseType, caseType), inArray(invoices.caseId, ids))).orderBy(asc(invoices.createdAt));
  const out: Record<string, Invoice> = {};
  for (const r of rows) out[r.caseId] = r;
  return out;
}
