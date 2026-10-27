// 案件進度的每日提醒與逾期升級（cron）。全部走站內通知（notify），dedupeKey 保證同一件事只發一次。
//   · 即將到期：目前階段到期日（承諾優先）3 天內 → 教練
//   · 逾期：第 1 步 教練＋S3；第 2 步（3 工作日仍無更新）S3 了解原因；第 3 步（再 5 工作日）標「待轉交」→ 客戶關係（沒有就管理員）
//   · 無下一步：進行中、沒等待客戶、目前階段沒承諾日、沒有未完成待辦、沒有未來會談 → 教練（每階段一次）
//   · 等待客戶累計滿 14 天 → 提醒教練確認是否轉暫停；暫停滿 30 天 → 提醒教練確認後續
//   · 逾期標記（flags.overdue）與 escalation 由這裡寫，人不能改
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/Shared/db";
import { actionItems, clients, orgHolidays, reviews } from "@/Shared/db/schema";
import { listAllCases, stagesForCases, lastHumanTouch, markOverdue } from "./caseStore";
import { overdueDays, daysToDue, escalationStep, diffDays, STAGE_LABEL, type Stage } from "./caseEngine";
import { notify, notifyMany } from "./notify";
import { listActiveCoaches } from "./org";
import { s3For, clientRelationsIds } from "./caseScope";
import { todayISO } from "./license";

export type ReminderStats = { cases: number; due: number; overdue: number; escalated: number; noNext: number; waiting: number; paused: number };

export async function runCaseReminders(today = todayISO()): Promise<ReminderStats> {
  const stats: ReminderStats = { cases: 0, due: 0, overdue: 0, escalated: 0, noNext: 0, waiting: 0, paused: 0 };
  const cases = await listAllCases();
  if (!cases.length) return stats;
  const [stages, all, hol] = await Promise.all([stagesForCases(cases.map((c) => c.id)), listActiveCoaches(), db.select({ d: orgHolidays.day }).from(orgHolidays)]);
  const holidays = new Set(hol.map((h) => h.d));
  const clientIds = cases.map((c) => c.clientId);
  const [names, openTodos, nextMeets] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, clientIds)),
    db.select({ clientId: actionItems.clientId, n: sql<number>`count(*)::int` }).from(actionItems).where(and(inArray(actionItems.clientId, clientIds), eq(actionItems.done, false))).groupBy(actionItems.clientId),
    db.select({ clientId: reviews.clientId, n: sql<number>`count(*)::int` }).from(reviews).where(and(inArray(reviews.clientId, clientIds), isNotNull(reviews.nextAppt), gte(reviews.nextAppt, today))).groupBy(reviews.clientId),
  ]);
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const todoOf = new Map(openTodos.map((t) => [t.clientId, t.n]));
  const meetOf = new Map(nextMeets.map((t) => [t.clientId, t.n]));
  const admins = all.filter((x) => x.role === "admin" || x.orgRank === "owner").map((x) => x.id);
  const relations = clientRelationsIds(all);

  for (const c of cases) {
    stats.cases++;
    const name = nameOf.get(c.clientId) ?? "客戶";
    const href = `/dashboard/clients/${c.clientId}`;
    const stage = c.stage as Stage;
    const cur = (stages[c.id] ?? []).find((s) => s.stage === stage) ?? null;
    const row = { stage, status: c.status as "active" | "paused" | "closed", flags: c.flags, startedAt: c.startedAt, waitingSince: c.waitingSince, waitingDays: c.waitingDays, pausedAt: c.pausedAt, closedAt: c.closedAt };
    const curDates = { promisedDate: cur?.promisedDate ?? null, expectedDate: cur?.expectedDate ?? null, actualDate: cur?.actualDate ?? null };
    const s3 = s3For(c, all);

    if (c.status === "paused") {
      if (c.pausedAt && diffDays(c.pausedAt, today) >= 30) {
        if (await notify({ to: "coach", id: c.coachId, kind: "case_flag", title: `${name} 的服務已暫停 30 天`, body: "請確認後續：重新啟動、或結案（客戶終止／無回應）。", href, caseId: c.id, dedupeKey: `case:${c.id}:paused30:${c.pausedAt}` })) stats.paused++;
      }
      continue;
    }
    if (c.status !== "active") continue;

    // 等待客戶滿 14 天
    if (c.flags.includes("waiting") && c.waitingSince && diffDays(c.waitingSince, today) >= 14) {
      if (await notify({ to: "coach", id: c.coachId, kind: "case_flag", title: `${name} 已等待客戶 14 天`, body: `等待中：${c.waitingNote || "—"}。請確認是否轉「暫停（待重新啟動）」。`, href, caseId: c.id, dedupeKey: `case:${c.id}:waiting14:${c.waitingSince}` })) stats.waiting++;
    }

    // 即將到期
    const dtd = daysToDue(row, curDates, today);
    if (dtd !== null && dtd >= 0 && dtd <= 3 && !c.flags.includes("waiting")) {
      const due = curDates.promisedDate ?? curDates.expectedDate ?? "";
      if (await notify({ to: "coach", id: c.coachId, kind: "case_due", title: `${name}「${STAGE_LABEL[stage]}」${dtd === 0 ? "今天到期" : `${dtd} 天後到期`}`, body: `${curDates.promisedDate ? "承諾" : "預計"}完成日 ${due}。`, href, caseId: c.id, dedupeKey: `case:${c.id}:due:${stage}:${due}` })) stats.due++;
    }

    // 逾期與升級
    const od = overdueDays(row, curDates, today);
    const last = od > 0 ? await lastHumanTouch(c.id) : null;
    const step = escalationStep({ overdue: od, escalation: c.escalation, escalatedAt: c.escalatedAt, lastUpdate: last, today, holidays });
    if (step !== c.escalation || (od > 0) !== c.flags.includes("overdue")) await markOverdue(c.id, step, c.flags);
    if (od > 0) {
      stats.overdue++;
      const key = `case:${c.id}:esc:${stage}:${cur?.startedOn ?? ""}:${step}`;
      const due = curDates.promisedDate ?? curDates.expectedDate ?? "";
      if (step === 1) {
        await notify({ to: "coach", id: c.coachId, kind: "case_overdue", title: `${name}「${STAGE_LABEL[stage]}」已逾期 ${od} 天`, body: `到期日 ${due}。請更新進度或設定新的承諾日（記錄原因並告知客戶的不列逾期）。`, href, caseId: c.id, dedupeKey: key });
        if (s3 && s3.id !== c.coachId) await notify({ to: "coach", id: s3.id, kind: "case_overdue", title: `所屬案件逾期：${name}「${STAGE_LABEL[stage]}」`, body: `主責教練尚未更新，逾期 ${od} 天。`, href, caseId: c.id, dedupeKey: `${key}:s3` });
      } else if (step === 2 && step !== c.escalation) {
        stats.escalated++;
        if (s3) await notify({ to: "coach", id: s3.id, kind: "case_escalation", title: `請了解原因：${name}「${STAGE_LABEL[stage]}」逾期 3 個工作日仍無更新`, body: "逾期升級第 2 步：請與主責教練確認卡在哪裡。", href, caseId: c.id, dedupeKey: key });
        await notify({ to: "coach", id: c.coachId, kind: "case_escalation", title: `${name} 的案件已升級給 S3`, body: "3 個工作日未更新，S3 會來了解原因。", href, caseId: c.id, dedupeKey: `${key}:coach` });
      } else if (step === 3 && step !== c.escalation) {
        stats.escalated++;
        const targets = relations.length ? relations : admins;
        await notifyMany(targets, { to: "coach", kind: "case_escalation", title: `待轉交：${name}「${STAGE_LABEL[stage]}」再 5 個工作日仍無處理`, body: "逾期升級第 3 步：請依異常分流機制轉交相關角色（第一版手動接）。", href, caseId: c.id, dedupeKey: key });
        if (s3) await notify({ to: "coach", id: s3.id, kind: "case_escalation", title: `${name} 的案件已標待轉交`, body: "", href, caseId: c.id, dedupeKey: `${key}:s3` });
      }
    }

    // 無下一步
    const noNext = !c.flags.includes("waiting") && !curDates.promisedDate && !(todoOf.get(c.clientId) ?? 0) && !(meetOf.get(c.clientId) ?? 0) && cur?.startedOn && diffDays(cur.startedOn, today) >= 3;
    if (noNext) {
      if (await notify({ to: "coach", id: c.coachId, kind: "case_due", title: `${name} 目前沒有下一步`, body: `「${STAGE_LABEL[stage]}」還沒有承諾日、待辦或下次會談。請排一個下一步，客戶才知道接下來會發生什麼。`, href, caseId: c.id, dedupeKey: `case:${c.id}:nonext:${stage}:${cur?.startedOn ?? ""}` })) stats.noNext++;
    }
  }
  return stats;
}
