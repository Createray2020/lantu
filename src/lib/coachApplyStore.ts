// 報聘的資料層：申請表的讀寫、推薦人確認、後台設定、核准時一次寫齊。
//
// 純規則（路線、必填、檢核表閘門）住在 `coachApply.ts`，那一支不碰 DB 也給 client component 用；
// 這一支只負責「存在哪、怎麼合併預設值」。
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { coachApplications, coachApplySettings, coaches, coachDisplayName } from "@/Shared/db/schema";
import { normalizeCode } from "./codes";
import { ensureCoachCode } from "./coach";
import { addPeriod, todayISO, INTERN_MONTHS, type LicenseUnit } from "./license";
import {
  APPLY_CONSENTS,
  DEFAULT_APPLY_SETTINGS,
  DEFAULT_CHECKLIST,
  TEXT_FIELD_MAX,
  approvalGate,
  cleanLicenses,
  isApplyRoute,
  routeMeta,
  type ApplyDraft,
  type ApplySettings,
  type ChecklistItem,
  type IntroducerState,
} from "./coachApply";

const SETTINGS_ID = "default";

const clip = (v: string | null | undefined, max = TEXT_FIELD_MAX) => {
  const s = (v ?? "").trim().slice(0, max);
  return s || null;
};

// ── 後台設定 ────────────────────────────────────────────────

/**
 * 全平台報聘設定。沒有那一列（seed 沒跑、剛部署）就整份回程式端預設值 ——
 * 報聘是對外的入口，不能因為後台還沒設定過就停擺。
 *
 * ⚠️ checklist 空陣列視同「沒設定過」→ 回預設檢核表。要真的關掉檢核表，
 *    請把項目的 required 取消，不要靠清空（清空在語意上分不出「刻意不要」與「還沒設」）。
 */
export async function getApplySettings(): Promise<ApplySettings> {
  const rows = await db.select().from(coachApplySettings).where(eq(coachApplySettings.id, SETTINGS_ID)).limit(1);
  const r = rows[0];
  if (!r) return DEFAULT_APPLY_SETTINGS;
  const checklist = (r.checklist ?? []) as ChecklistItem[];
  return {
    defaultRankCode: r.defaultRankCode ?? null,
    bindUplineToIntroducer: r.bindUplineToIntroducer,
    requireIntroducerConfirm: r.requireIntroducerConfirm,
    licenseOn: r.licenseOn,
    licenseUnit: r.licenseUnit === "month" ? "month" : "year",
    licenseQty: Math.max(1, Math.min(120, r.licenseQty || 1)),
    requiredFields: (r.requiredFields ?? []) as string[],
    checklist: checklist.length ? checklist : DEFAULT_CHECKLIST,
  };
}

export async function saveApplySettings(input: ApplySettings): Promise<void> {
  const set = {
    defaultRankCode: input.defaultRankCode || null,
    bindUplineToIntroducer: !!input.bindUplineToIntroducer,
    requireIntroducerConfirm: !!input.requireIntroducerConfirm,
    licenseOn: !!input.licenseOn,
    licenseUnit: input.licenseUnit === "month" ? "month" : "year",
    licenseQty: Math.max(1, Math.min(120, Math.round(input.licenseQty || 1))),
    requiredFields: input.requiredFields ?? [],
    checklist: input.checklist ?? [],
    updatedAt: new Date(),
  };
  // neon-http 沒有交易，設定寫入一律單語句 upsert（見 an_module_defaults 的作法）。
  await db
    .insert(coachApplySettings)
    .values({ id: SETTINGS_ID, ...set })
    .onConflictDoUpdate({ target: coachApplySettings.id, set });
}

// ── 送出申請 ────────────────────────────────────────────────

/** 用教練編號找人。查無回 null —— 打錯編號不擋送出，字串會原樣留給後台判斷。 */
export async function lookupCoachByCode(raw: string | null | undefined) {
  const code = normalizeCode((raw ?? "").trim().slice(0, 20));
  if (!code) return null;
  const rows = await db
    .select({ id: coaches.id, name: coachDisplayName, status: coaches.status })
    .from(coaches)
    .where(eq(coaches.code, code))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 寫入／覆寫這位申請人的報聘表。
 *
 * ⚠️ 一位教練一列（PK 就是 coachId）：重送申請是覆寫，不是開新的一件 ——
 *    否則後台會看到同一個人的三張表，而且分不出哪張才是他現在講的話。
 * ⚠️ direct 路線的 introducerState 一律 skipped，不是 pending：
 *    pending 會讓這件申請永遠卡在「等待推薦人」而沒有任何人能確認它。
 */
export async function submitApplication(
  coachId: string,
  draft: ApplyDraft,
  introducerId: string | null,
): Promise<void> {
  const route = isApplyRoute(draft.route) ? draft.route : "referral";
  const needsIntro = routeMeta(route).needsIntroducer;
  const now = new Date();
  const stamp = now.toISOString();
  const consents: Record<string, string> = {};
  for (const c of APPLY_CONSENTS) if (draft.consents.includes(c.key)) consents[c.key] = stamp;

  const set = {
    route,
    introducerId: needsIntro ? introducerId : null,
    introducerCode: needsIntro ? clip(draft.introducerCode, 20) : null,
    phone: clip(draft.phone, 40),
    currentJob: clip(draft.currentJob),
    motive: clip(draft.motive),
    experience: clip(draft.experience),
    licenses: cleanLicenses(draft.licenses),
    consents,
    // 推薦人查無編號時仍是 pending：那是後台要處理的線索，不是自動放行的理由。
    introducerState: (needsIntro ? "pending" : "skipped") as IntroducerState,
    introducerNote: null,
    introducerActedAt: null,
    submittedAt: now,
    updatedAt: now,
  };

  await db
    .insert(coachApplications)
    .values({ coachId, ...set })
    .onConflictDoUpdate({ target: coachApplications.coachId, set });
}

// ── 讀取 ────────────────────────────────────────────────────

export type ApplicationRow = typeof coachApplications.$inferSelect;

export type ApplicationView = ApplicationRow & { introducerName: string | null };

export async function getApplication(coachId: string): Promise<ApplicationView | null> {
  const rows = await db
    .select()
    .from(coachApplications)
    .where(eq(coachApplications.coachId, coachId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { ...r, introducerName: await introducerNameOf(r.introducerId) };
}

async function introducerNameOf(id: string | null): Promise<string | null> {
  if (!id) return null;
  const rows = await db.select({ name: coachDisplayName }).from(coaches).where(eq(coaches.id, id)).limit(1);
  return rows[0]?.name ?? null;
}

/** 後台名冊用：一次撈全部申請表（教練數會長，不逐列查）。 */
export async function listApplications(): Promise<Record<string, ApplicationView>> {
  const rows = await db.select().from(coachApplications);
  const ids = [...new Set(rows.map((r) => r.introducerId).filter(Boolean))] as string[];
  const names = new Map<string, string | null>();
  if (ids.length) {
    const list = await db.select({ id: coaches.id, name: coachDisplayName }).from(coaches);
    for (const c of list) names.set(c.id, c.name);
  }
  const out: Record<string, ApplicationView> = {};
  for (const r of rows) out[r.coachId] = { ...r, introducerName: r.introducerId ? names.get(r.introducerId) ?? null : null };
  return out;
}

export type IntroductionRequest = {
  coachId: string;
  applicantName: string | null;
  applicantEmail: string | null;
  phone: string | null;
  currentJob: string | null;
  motive: string | null;
  submittedAt: Date;
};

/** 推薦人端的待確認清單。只列還在 pending 的（確認過或婉拒過都不再出現）。 */
export async function listPendingIntroductions(introducerId: string): Promise<IntroductionRequest[]> {
  const rows = await db
    .select({
      coachId: coachApplications.coachId,
      applicantName: coachDisplayName,
      applicantEmail: coaches.email,
      phone: coachApplications.phone,
      currentJob: coachApplications.currentJob,
      motive: coachApplications.motive,
      submittedAt: coachApplications.submittedAt,
    })
    .from(coachApplications)
    .innerJoin(coaches, eq(coaches.id, coachApplications.coachId))
    .where(and(eq(coachApplications.introducerId, introducerId), eq(coachApplications.introducerState, "pending")))
    .orderBy(desc(coachApplications.submittedAt));
  return rows;
}

/** 頁首徽章用：這位教練還有幾件報聘等他確認。 */
export async function countPendingIntroductions(introducerId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(coachApplications)
    .where(and(eq(coachApplications.introducerId, introducerId), eq(coachApplications.introducerState, "pending")));
  return Number(rows[0]?.n ?? 0);
}

// ── 推薦人確認 ──────────────────────────────────────────────

/**
 * 推薦人按下「確認推薦」／「婉拒」。
 *
 * ⚠️ where 一定要同時帶 introducerId：少了它，任何教練都能替別人的申請案按確認。
 *    這是這條動線唯一的租戶條件。
 */
export async function actOnIntroduction(
  introducerId: string,
  applicantId: string,
  action: "confirm" | "decline",
  note: string,
): Promise<{ ok: boolean }> {
  const r = await db
    .update(coachApplications)
    .set({
      introducerState: action === "confirm" ? "confirmed" : "declined",
      introducerNote: clip(note, 300),
      introducerActedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(coachApplications.coachId, applicantId),
        eq(coachApplications.introducerId, introducerId),
        eq(coachApplications.introducerState, "pending"),
      ),
    )
    .returning({ id: coachApplications.coachId });
  return { ok: !!r[0] };
}

// ── 審核 ────────────────────────────────────────────────────

/** 審核者打勾／取消打勾一項。存的是時間戳（誰在什麼時候確認過這一項）。 */
export async function saveReviewChecks(
  coachId: string,
  checked: string[],
  reviewerId: string,
  note: string | null,
): Promise<void> {
  const rows = await db
    .select({ checks: coachApplications.reviewChecks })
    .from(coachApplications)
    .where(eq(coachApplications.coachId, coachId))
    .limit(1);
  if (!rows[0]) return;
  const prev = (rows[0].checks ?? {}) as Record<string, string>;
  const stamp = new Date().toISOString();
  const next: Record<string, string> = {};
  for (const k of checked) next[k] = prev[k] ?? stamp; // 已經勾過的保留原時間，不因為再存一次而變新
  await db
    .update(coachApplications)
    .set({ reviewChecks: next, reviewerId, reviewNote: clip(note, 300), updatedAt: new Date() })
    .where(eq(coachApplications.coachId, coachId));
}

export type ApproveResult =
  | { ok: true; applied: { rankCode: string | null; uplineId: string | null; licenseUntil: string | null } }
  | { ok: false; error: string };

/**
 * 核准報聘：閘門 → 一次寫齊。
 *
 * 2026/08/31 之前這裡只有 `status='active'` 一件事，職級／推薦人／期限全靠人事後補，
 * 補漏的代價是「開通了卻不能被客戶指定、也沒有期限」的帳號默默累積。現在核准當下就帶：
 *   · 職級 ← 後台預設（C1）
 *   · 推薦人（組織位置） ← 申請時填的推薦人
 *   · 期限 ← 後台預設（一年）
 *
 * ⚠️ 三項一律「原本是空的才寫」：後台已經手動設過的人不會被這裡蓋掉，
 *    停權後再核准也不會把他的職級降回 C1。
 * ⚠️ 實習教練（INTERN）的期限固定半年，與 licenseActions 同一條規則，這裡再夾一次。
 */
export async function approveApplication(coachId: string, reviewerId: string): Promise<ApproveResult> {
  const rows = await db.select().from(coaches).where(eq(coaches.id, coachId)).limit(1);
  const coach = rows[0];
  if (!coach) return { ok: false, error: "找不到這位教練" };

  const [settings, appRows] = await Promise.all([
    getApplySettings(),
    db.select().from(coachApplications).where(eq(coachApplications.coachId, coachId)).limit(1),
  ]);
  const app = appRows[0] ?? null;

  const gate = approvalGate(
    {
      route: app?.route,
      introducerState: app?.introducerState,
      checked: Object.keys((app?.reviewChecks ?? {}) as Record<string, string>),
      hasApplication: !!app,
    },
    settings,
  );
  if (!gate.ok) return { ok: false, error: gate.reasons.join("、") };

  // 三項都只在「原本是空的」時才寫進 set，不是寫回同一個值 ——
  // 寫回去看起來無害，但那是一次真的 UPDATE，會蓋掉別人在這幾秒內剛改好的值。
  const newRank = coach.rankCode ? null : settings.defaultRankCode || null;
  // 綁定推薦人；推薦人不能是自己（自我推薦會做出一個指向自己的環）。
  const introducer = app?.introducerId && app.introducerId !== coachId ? app.introducerId : null;
  const newUpline = coach.uplineId || !settings.bindUplineToIntroducer ? null : introducer;
  const rankCode = coach.rankCode ?? newRank;

  let license: { licenseFrom: string; licenseUntil: string; licenseUnit: LicenseUnit; licenseQty: number } | null = null;
  if (settings.licenseOn && !coach.licenseUntil) {
    const from = todayISO();
    const intern = rankCode === "INTERN";
    const unit: LicenseUnit = intern ? "month" : settings.licenseUnit;
    const qty = intern ? INTERN_MONTHS : settings.licenseQty;
    license = { licenseFrom: from, licenseUntil: addPeriod(from, unit, qty), licenseUnit: unit, licenseQty: qty };
  }

  await db
    .update(coaches)
    .set({
      status: "active",
      approvedAt: new Date(),
      ...(newRank ? { rankCode: newRank } : {}),
      ...(newUpline ? { uplineId: newUpline } : {}),
      ...(license ?? {}),
    })
    .where(eq(coaches.id, coachId));

  if (app) {
    await db
      .update(coachApplications)
      .set({ reviewerId, updatedAt: new Date() })
      .where(eq(coachApplications.coachId, coachId));
  }

  // 編號在「核准報聘」那一刻發，且只發一次（停權後再核准拿回同一個號）。
  await ensureCoachCode(coachId);

  return {
    ok: true,
    applied: {
      rankCode,
      uplineId: coach.uplineId ?? newUpline,
      licenseUntil: license?.licenseUntil ?? coach.licenseUntil ?? null,
    },
  };
}
