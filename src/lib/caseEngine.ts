// 服務案件（案件進度）的純函式層：階段順序、預設期限、三種日期、逾期與暫停計時、狀態與標記的語彙。
// 不碰 DB。DB 層在 caseStore.ts。對外語彙一律「服務進度」（財務階段「整裝／啟程／前行／遠行」是另一條，不混）。
//
// 提案書 3.1 的預設期限（全部是「預設值」，後台 service_stage_params 可改）：
//   4 正式委託 7 天（起算：客戶同意方案＝建案日）
//   5 深度會談 建檔後 7 天首次會談＋7 天補齊資料 → 合併 14 天（起算：階段 4 實際完成日）
//   6 規劃與準備 14 天（起算：資料齊全確認日＝階段 5 實際完成日）
//   7 報告書會談 初稿後 7 天會談＋會談後 7 天交付 → 14 天（起算：初稿完成日＝階段 6 實際完成日）
//   8 執行追蹤 每季追蹤 1 次 → 90 天（起算：行動計畫確認日＝階段 7 實際完成日；每次追蹤完再往後推 90 天）

export const STAGES = ["commission", "interview", "planning", "report", "tracking"] as const;
export type Stage = (typeof STAGES)[number];

/** 服務流程的階段編號（提案書：系統追蹤第 4–8 階段，1–3 在系統外）——只用在說明文字 */
export const STAGE_NO: Record<Stage, number> = { commission: 4, interview: 5, planning: 6, report: 7, tracking: 8 };
/** 畫面上的序號 1–5：教練端與客戶端一致（客戶端照提案書圖 01–05） */
export const STAGE_SEQ: Record<Stage, number> = { commission: 1, interview: 2, planning: 3, report: 4, tracking: 5 };
export const STAGE_LABEL: Record<Stage, string> = {
  commission: "正式委託",
  interview: "深度會談",
  planning: "規劃與準備",
  report: "報告書會談",
  tracking: "執行追蹤與動態調整",
};
/** 客戶端每階段的一句話（照提案書圖 2–5 的文字） */
export const STAGE_CLIENT_HINT: Record<Stage, string> = {
  commission: "完成付費、合約與正式進案，系統開立你的專屬規劃編號，正式啟動這份規劃。",
  interview: "進行完整需求與現況了解，約 60 分鐘，一次盤點收入、支出、資產、負債與人生目標。",
  planning: "整理資料、進行分析並建立規劃，試算各大目標的缺口與可行方案，編寫你的專屬規劃書。",
  report: "與客戶討論規劃結果，約 60 分鐘，逐頁說明規劃書內容，你可以隨時提問並調整優先順序。",
  tracking: "定期檢視階段性成果與生活變化，依現況動態調整規劃，確保每一步都跟得上你的目標。",
};
/** 客戶端「預計時間」那一列（照圖） */
export const STAGE_TIME_HINT: Record<Stage, string> = {
  commission: "7 天內",
  interview: "7 天",
  planning: "資料齊全後 14 天內完成規劃與報告書初稿",
  report: "初稿完成日起 7 天內完成會談；修改於會談後 7 天內交付",
  tracking: "完成服務節點後 7 天內發送問卷；轉入定期追蹤後至少每季 1 次",
};
export const STAGE_OWNER_HINT: Record<Stage, string> = {
  commission: "財務教練；行政財法協助合約與收付款",
  interview: "財務教練",
  planning: "財務教練；資深教練協助",
  report: "財務教練",
  tracking: "財務教練",
};

export type StageParam = { days: number; checklist: { k: string; label: string }[] };
// 清單文字照提案書圖 2–5；鍵（k）是系統自動勾選的對照：
//   contract 合約完成、paid 收款確認、setup 客戶開通會員中心、goals 諮詢紀錄（初次／深度）、kyc 風險問卷、
//   draft 報告書標初稿、explain 諮詢紀錄（提案／報告書）、decision 客戶決定、review 定期檢視紀錄
export const DEFAULT_STAGE_PARAMS: Record<Stage, StageParam> = {
  commission: { days: 7, checklist: [
    { k: "scope", label: "確認方案範圍與服務期間" },
    { k: "contract", label: "簽署服務合約" },
    { k: "paid", label: "確認付款完成" },
    { k: "setup", label: "於系統建立案件與規劃編號" },
  ] },
  interview: { days: 14, checklist: [
    { k: "goals", label: "深入了解客戶目標、家庭與財務狀況" },
    { k: "kyc", label: "進行 KYC 與資料收集" },
    { k: "docs", label: "列出缺漏資料與補件期限" },
  ] },
  planning: { days: 14, checklist: [
    { k: "analysis", label: "進行財務分析與規劃" },
    { k: "draft", label: "準備報告書與行動方案" },
    { k: "meet", label: "排定報告書會談日期" },
  ] },
  report: { days: 14, checklist: [
    { k: "explain", label: "向客戶說明分析、規劃與行動方案" },
    { k: "qa", label: "回答客戶疑問" },
    { k: "decision", label: "確認客戶接受與需修改的項目" },
  ] },
  tracking: { days: 90, checklist: [
    { k: "review", label: "定期檢視階段性成果與生活變化並調整規劃" },
    { k: "needs", label: "確認後續需求" },
    { k: "referral", label: "詢問轉介紹" },
    { k: "renew", label: "決定續約／再服務" },
  ] },
};

export type CaseStatus = "active" | "paused" | "closed";
export const STATUS_LABEL: Record<CaseStatus, string> = { active: "進行中", paused: "服務暫停", closed: "服務完成" };
export type CaseFlag = "overdue" | "waiting" | "complaint" | "lowscore";
export const FLAG_LABEL: Record<CaseFlag, string> = { overdue: "逾期", waiting: "等待客戶", complaint: "異常客訴", lowscore: "低分回饋" };
export const CLOSE_REASONS: Record<string, string> = {
  done: "服務完成",
  client_stop: "客戶終止",
  no_response: "客戶無回應",
  coach_handover: "教練無法繼續（已交接）",
  not_established: "委託未成立（簽約或付款逾期）",
  other: "其他",
};
export const DECISION_LABEL: Record<string, string> = { accept: "接受", revise: "修改後再提案" };

export function isStage(v: unknown): v is Stage { return typeof v === "string" && (STAGES as readonly string[]).includes(v); }
export function nextStage(s: Stage): Stage | null { const i = STAGES.indexOf(s); return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null; }
export function prevStage(s: Stage): Stage | null { const i = STAGES.indexOf(s); return i > 0 ? STAGES[i - 1] : null; }
export function stageIndex(s: Stage): number { return STAGES.indexOf(s); }

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export function paramsFor(stage: Stage, overrides?: Partial<Record<Stage, Partial<StageParam>>>): StageParam {
  const d = DEFAULT_STAGE_PARAMS[stage];
  const o = overrides?.[stage];
  return { days: o?.days && o.days > 0 ? o.days : d.days, checklist: o?.checklist?.length ? o.checklist : d.checklist };
}

/** 一個階段列（DB 形狀的子集） */
export type StageRow = {
  stage: Stage;
  startedOn: string | null;
  expectedDate: string | null;
  promisedDate: string | null;
  actualDate: string | null;
  checklist: { k: string; label: string; done: boolean; at?: string | null }[];
  note: string;
  decision: string;
};

export type CaseRow = {
  stage: Stage;
  status: CaseStatus;
  flags: string[];
  startedAt: string | null;
  waitingSince: string | null;
  waitingDays: number;
  pausedAt: string | null;
  closedAt: string | null;
};

/** 時間軸上每格的顯示狀態：階段進度（不是案件狀態） */
export type StageProgress = "done" | "active" | "pending";
export function stageProgress(c: Pick<CaseRow, "stage" | "status">, s: Stage): StageProgress {
  const cur = stageIndex(c.stage);
  const i = stageIndex(s);
  if (i < cur) return "done";
  if (i === cur) return c.status === "closed" ? "done" : "active";
  return "pending";
}

/** 客戶端顯示的到期日：承諾優先、沒承諾不顯示預計（預計留教練端）。 */
export function dueForClient(r: Pick<StageRow, "promisedDate" | "actualDate">): { kind: "actual" | "promised" | null; date: string | null } {
  if (r.actualDate) return { kind: "actual", date: r.actualDate };
  if (r.promisedDate) return { kind: "promised", date: r.promisedDate };
  return { kind: null, date: null };
}
/** 教練端的到期日：承諾優先，否則預計。 */
export function dueForCoach(r: Pick<StageRow, "promisedDate" | "expectedDate" | "actualDate">): string | null {
  return r.actualDate ?? r.promisedDate ?? r.expectedDate ?? null;
}

/**
 * 逾期判定：進行中、目前階段的到期日（承諾優先）已過、且沒有「等待客戶」標記。
 * 等待客戶暫停計時＝到期日往後推「累計等待天數＋目前這一段等待」。
 */
export function overdueDays(c: CaseRow, cur: Pick<StageRow, "promisedDate" | "expectedDate" | "actualDate">, today: string): number {
  if (c.status !== "active") return 0;
  if (c.flags.includes("waiting")) return 0;
  const due = dueForCoach(cur);
  if (!due || cur.actualDate) return 0;
  const shifted = addDays(due, Math.max(0, c.waitingDays || 0));
  return Math.max(0, diffDays(shifted, today));
}
/** 離到期還有幾天（負數＝已過）；給「即將到期」提醒用。 */
export function daysToDue(c: CaseRow, cur: Pick<StageRow, "promisedDate" | "expectedDate" | "actualDate">, today: string): number | null {
  const due = dueForCoach(cur);
  if (!due || cur.actualDate) return null;
  const shifted = addDays(due, Math.max(0, c.waitingDays || 0) + (c.flags.includes("waiting") && c.waitingSince ? Math.max(0, diffDays(c.waitingSince, today)) : 0));
  return diffDays(today, shifted);
}

/** 建一個新階段列：起算日＝上一階段實際完成日（或建案日），預計日＝起算＋預設天數。 */
export function newStageRow(stage: Stage, startedOn: string, params: StageParam): StageRow {
  return {
    stage,
    startedOn,
    expectedDate: addDays(startedOn, params.days),
    promisedDate: null,
    actualDate: null,
    checklist: params.checklist.map((c) => ({ k: c.k, label: c.label, done: false, at: null })),
    note: "",
    decision: "",
  };
}

/** 完成進度：已完成階段數／5（進行中那階不算完成） */
export function completion(c: Pick<CaseRow, "stage" | "status">): { done: number; total: number } {
  const cur = stageIndex(c.stage);
  return { done: c.status === "closed" ? STAGES.length : cur, total: STAGES.length };
}

/** 工作日：跳過週六日與假日表 */
export function addWorkdays(iso: string, n: number, holidays: Set<string> = new Set()): string {
  let d = iso; let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    const w = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (w === 0 || w === 6 || holidays.has(d)) continue;
    left--;
  }
  return d;
}
export function workdaysBetween(from: string, to: string, holidays: Set<string> = new Set()): number {
  if (diffDays(from, to) <= 0) return 0;
  let n = 0; let d = from;
  while (diffDays(d, to) > 0) {
    d = addDays(d, 1);
    const w = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (w === 0 || w === 6 || holidays.has(d)) continue;
    n++;
  }
  return n;
}

/**
 * 逾期升級（提案書 4.3，預設值）：
 *   第 1 步：超過期限 → 提醒教練與 S3
 *   第 2 步：提醒後 3 個工作日仍無更新 → 通知 S3 了解原因
 *   第 3 步：再 5 個工作日仍無處理 → 標「待轉交」通知客戶關係（第一版手動接）
 * 回傳「今天應該在第幾步」。lastUpdate＝案件最近一次有人動（stage/promised/checklist/note）。
 */
export function escalationStep(args: { overdue: number; escalation: number; escalatedAt: string | null; lastUpdate: string | null; today: string; holidays?: Set<string> }): number {
  const { overdue, escalation, escalatedAt, lastUpdate, today, holidays } = args;
  if (overdue <= 0) return 0;
  if (escalation === 0) return 1;
  const since = escalatedAt ?? today;
  const touchedAfter = lastUpdate && diffDays(since, lastUpdate) > 0;
  if (touchedAfter) return escalation; // 有更新就停在目前這一步
  const wd = workdaysBetween(since, today, holidays);
  if (escalation === 1 && wd >= 3) return 2;
  if (escalation === 2 && wd >= 5) return 3;
  return escalation;
}

export function normalizeFlags(v: unknown): CaseFlag[] {
  const all: CaseFlag[] = ["overdue", "waiting", "complaint", "lowscore"];
  return Array.isArray(v) ? all.filter((f) => v.includes(f)) : [];
}
