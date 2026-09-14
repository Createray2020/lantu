// 公司行事曆（2026/09/14 Ray）：教練要知道公司的日期排程，以及活動與會議紀錄。
//
// ⚠️⚠️ 這一層最重要的職務是**可見層級的過濾**，而且過濾一定在 SQL 裡（visibleLevels →
//    inArray）。只在畫面上藏等於沒藏：RSC payload 會把整個陣列序列化進網頁原始碼，
//    「僅核心成員」那幾筆的標題打開檢視原始碼就看得到。任何新增的查法都必須帶這個條件，
//    不要「先撈全部再 filter」。
//
// ⚠️ 教育訓練是**唯讀投影**，不是這張表的資料：來源是 comp_training_sessions
//    （出席＝時數＝維持資格，整條分潤制度綁在上面）。行事曆只負責顯示，
//    readOnly=true 的事件不給編輯、不給刪除、也不會有會議紀錄。
import { and, asc, eq, gte, inArray, lte, desc } from "drizzle-orm";
import { db } from "@/Shared/db";
import { orgEvents, compTrainingSessions, coaches } from "@/Shared/db/schema";
import { todayISO, addDaysISO } from "./license";
import type { OrgRank } from "./org";

export type EventKind = "meeting" | "activity" | "ops" | "training";
export type Visibility = "all" | "manager" | "owner";

export const KIND_LABEL: Record<EventKind, string> = {
  meeting: "會議",
  activity: "活動",
  ops: "公司行程",
  training: "教育訓練",
};
/** 後台能建立的類型。training 不在裡面——它來自 /admin/training。 */
export const EDITABLE_KINDS: EventKind[] = ["meeting", "activity", "ops"];

export const VIS_LABEL: Record<Visibility, string> = {
  all: "全體教練",
  manager: "主管以上",
  owner: "僅核心成員",
};

/**
 * 可見層級是**往上包含**：標 'manager' 的事件，主管與核心成員看得到，教練看不到。
 * 回傳的是「這個職級看得到哪些 visibility 值」，直接餵給 SQL 的 inArray。
 */
export function visibleLevels(rank: OrgRank): Visibility[] {
  if (rank === "owner") return ["all", "manager", "owner"];
  if (rank === "manager") return ["all", "manager"];
  return ["all"];
}

export type CalEvent = {
  id: string;
  date: string;                 // YYYY-MM-DD
  start: string | null;         // 'HH:MM'；null＝全天
  end: string | null;
  kind: EventKind;
  title: string;
  place: string | null;
  visibility: Visibility;
  body: string | null;
  minutes: string | null;
  /** 訓練場次投影＝唯讀，後台不給編輯／刪除。 */
  readOnly: boolean;
  /** 這個事件有沒有「會議紀錄」這個概念（訓練場次沒有）。 */
  canMinute: boolean;
};

// ---------- 日期工具 ----------
export { addDaysISO };
/** 'YYYY-MM' → 該月第一天與最後一天。 */
export function monthRange(ym: string): { from: string; to: string } {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

// ---------- 正規化（寫入前一律過這裡）----------
/** 接受 'HH:MM' 或 'HH:MM:SS'；空字串／垃圾一律變 null（＝全天）。 */
export function normalizeTime(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}
export function normalizeKind(raw: string | null | undefined): Exclude<EventKind, "training"> {
  return raw === "activity" || raw === "ops" ? raw : "meeting";
}
export function normalizeVisibility(raw: string | null | undefined): Visibility {
  return raw === "manager" || raw === "owner" ? raw : "all";
}
function isISODate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
}

// ---------- 讀 ----------
type OrgEventRow = typeof orgEvents.$inferSelect;

function rowToEvent(r: OrgEventRow): CalEvent {
  return {
    id: r.id,
    date: r.eventDate,
    start: r.startTime,
    end: r.endTime,
    kind: normalizeKind(r.kind),
    title: r.title,
    place: r.place,
    visibility: normalizeVisibility(r.visibility),
    body: r.body,
    minutes: r.minutes,
    readOnly: false,
    canMinute: true,
  };
}

const MODE_LABEL: Record<string, string> = { onsite: "實體", online: "線上", hybrid: "實體＋線上" };

/**
 * 訓練場次唯讀投影。一律 visibility='all'（訓練場次本來就是全員的事），
 * 所以任何職級都看得到，不需要再過濾。
 */
async function trainingBetween(from: string, to: string): Promise<CalEvent[]> {
  const rows = await db
    .select({
      id: compTrainingSessions.id,
      heldOn: compTrainingSessions.heldOn,
      topic: compTrainingSessions.topic,
      mode: compTrainingSessions.mode,
      hours: compTrainingSessions.hours,
      note: compTrainingSessions.note,
      speakerName: coaches.name,
      speakerDisplay: coaches.displayName,
    })
    .from(compTrainingSessions)
    .leftJoin(coaches, eq(compTrainingSessions.speakerId, coaches.id))
    .where(and(gte(compTrainingSessions.heldOn, from), lte(compTrainingSessions.heldOn, to)));

  return rows.map((r) => {
    const speaker = (r.speakerDisplay || r.speakerName || "").trim();
    const bits: string[] = [];
    if (speaker) bits.push(`講師：${speaker}`);
    if (r.hours != null) bits.push(`認列 ${r.hours} 小時`);
    if (r.note) bits.push(r.note);
    return {
      id: `training:${r.id}`,
      date: r.heldOn,
      start: null,
      end: null,
      kind: "training" as const,
      title: r.topic,
      place: MODE_LABEL[r.mode] ?? r.mode,
      visibility: "all" as const,
      body: bits.length ? bits.join("　·　") : null,
      minutes: null,
      readOnly: true,
      canMinute: false,
    };
  });
}

/** 同一天內：全天事件排最前，其餘依開始時間。'HH:MM' 的字典序就是時間序。 */
function byWhen(a: CalEvent, b: CalEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.start === b.start) return a.title.localeCompare(b.title, "zh-Hant");
  if (!a.start) return -1;
  if (!b.start) return 1;
  return a.start < b.start ? -1 : 1;
}

/** 區間內所有事件（含訓練場次投影），已依時間排序。 */
export async function listEvents(rank: OrgRank, from: string, to: string): Promise<CalEvent[]> {
  const [own, training] = await Promise.all([
    db
      .select()
      .from(orgEvents)
      .where(
        and(
          gte(orgEvents.eventDate, from),
          lte(orgEvents.eventDate, to),
          inArray(orgEvents.visibility, visibleLevels(rank)),
        ),
      )
      .orderBy(asc(orgEvents.eventDate)),
    trainingBetween(from, to),
  ]);
  return [...own.map(rowToEvent), ...training].sort(byWhen);
}

/**
 * 首頁「近期行程」：今天起算 days 天（含今天）。
 * 預設 7 天——`getCoachDashboard()` 的 thisWeek 也是 7 天，兩邊同一個視窗才不會
 * 一塊看得到、另一塊看不到同一場約訪。
 */
export async function upcomingEvents(rank: OrgRank, days = 7): Promise<CalEvent[]> {
  const from = todayISO();
  return listEvents(rank, from, addDaysISO(from, days));
}

export async function listMonth(rank: OrgRank, ym: string): Promise<CalEvent[]> {
  const { from, to } = monthRange(ym);
  return listEvents(rank, from, to);
}

/**
 * 過往紀錄：今天之前，最近的 limit 筆（倒序）。
 * 訓練場次也一併投影進來——教練回查「上個月那場訓練講什麼」跟回查會議是同一件事。
 */
export async function listPastEvents(rank: OrgRank, limit = 40): Promise<CalEvent[]> {
  const today = todayISO();
  const from = addDaysISO(today, -365);
  const to = addDaysISO(today, -1);
  const rows = await listEvents(rank, from, to);
  return rows.reverse().slice(0, limit);
}

/** 單一事件。查不到、或不在可見範圍內，一律回 null（不要區分這兩件事）。 */
export async function getEvent(rank: OrgRank, id: string): Promise<CalEvent | null> {
  if (id.startsWith("training:")) {
    const real = id.slice("training:".length);
    const rows = await db
      .select({ heldOn: compTrainingSessions.heldOn })
      .from(compTrainingSessions)
      .where(eq(compTrainingSessions.id, real))
      .limit(1);
    if (!rows.length) return null;
    const list = await trainingBetween(rows[0].heldOn, rows[0].heldOn);
    return list.find((e) => e.id === id) ?? null;
  }
  const rows = await db
    .select()
    .from(orgEvents)
    .where(and(eq(orgEvents.id, id), inArray(orgEvents.visibility, visibleLevels(rank))))
    .limit(1);
  return rows.length ? rowToEvent(rows[0]) : null;
}

/** 後台列表：不過濾可見層級（後台只有核心成員進得來，他本來就全看得到）。 */
export async function listAllForAdmin(fromISO: string, toISO: string): Promise<CalEvent[]> {
  const rows = await db
    .select()
    .from(orgEvents)
    .where(and(gte(orgEvents.eventDate, fromISO), lte(orgEvents.eventDate, toISO)))
    .orderBy(desc(orgEvents.eventDate));
  return rows.map(rowToEvent).sort((a, b) => -byWhen(a, b));
}

// ---------- 寫（只有後台呼叫，權限閘在 action 層）----------
export type EventInput = {
  date: string;
  start?: string | null;
  end?: string | null;
  kind?: string | null;
  title: string;
  place?: string | null;
  visibility?: string | null;
  body?: string | null;
  minutes?: string | null;
};

function cleanInput(input: EventInput) {
  const date = (input.date ?? "").trim();
  if (!isISODate(date)) throw new Error("bad_date");
  const title = (input.title ?? "").trim();
  if (!title) throw new Error("no_title");
  const start = normalizeTime(input.start);
  let end = normalizeTime(input.end);
  // 全天事件不該有結束時間；結束早於開始就當沒填，不要存一段負的區間。
  if (!start || (end && end < start)) end = null;
  const txt = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    return s ? s : null;
  };
  return {
    eventDate: date,
    startTime: start,
    endTime: end,
    kind: normalizeKind(input.kind),
    title: title.slice(0, 200),
    place: txt(input.place),
    visibility: normalizeVisibility(input.visibility),
    body: txt(input.body),
    minutes: txt(input.minutes),
  };
}

export async function createEvent(input: EventInput, byCoachId: string): Promise<string> {
  const v = cleanInput(input);
  const rows = await db.insert(orgEvents).values({ ...v, createdBy: byCoachId }).returning({ id: orgEvents.id });
  return rows[0].id;
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
  // ⚠️ 訓練場次的 id 帶前綴，永遠不會對上 org_events 的 uuid；擋在這裡讓錯誤講人話，
  //    而不是讓 Postgres 丟一個 invalid uuid。
  if (id.startsWith("training:")) throw new Error("read_only");
  const v = cleanInput(input);
  await db.update(orgEvents).set({ ...v, updatedAt: new Date() }).where(eq(orgEvents.id, id));
}

export async function deleteEvent(id: string): Promise<void> {
  if (id.startsWith("training:")) throw new Error("read_only");
  await db.delete(orgEvents).where(eq(orgEvents.id, id));
}
