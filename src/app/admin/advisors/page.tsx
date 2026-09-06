import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import {
  listAdvisors, listCases, listRankEvents, listTrainingRecords, toAdvisorRows, toCaseRows,
} from "@/lib/comp/caseRepo";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { buildOverview } from "@/lib/comp/view";
import AdvisorsBoard, { type AdvisorView, type TrackView } from "./AdvisorsBoard";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function AdvisorsPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (!(await isAdmin(me))) redirect("/dashboard");

  const year = new Date().getUTCFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const version = await ensureActiveVersion();
  const [params, coachRows, caseRows, trainRows, events] = await Promise.all([
    loadParams(version.id), listAdvisors(), listCases(), listTrainingRecords(year), listRankEvents(),
  ]);

  const advisors = toAdvisorRows(coachRows);
  const cases = toCaseRows(caseRows);
  const nameById = new Map(coachRows.map((c) => [c.id, c.name || c.email || c.id]));

  const views: AdvisorView[] = coachRows
    .filter((c) => c.status !== "pending")
    .map((c) => {
      const ov = buildOverview(
        {
          id: c.id, name: c.name, rankCode: c.rankCode, uplineId: c.uplineId,
          hireDate: c.hireDate, entryType: c.entryType,
          tenureRankCode: c.tenureRankCode, tenureUntil: c.tenureUntil,
          initialCases: c.initialCases, initialFees: c.initialFees,
          recruitAllowed: c.recruitAllowed, leadAllowed: c.leadAllowed,
        },
        { cases, advisors, params, year, today, training: trainRows.filter((t) => t.coachId === c.id) },
      );
      const track = (t: typeof ov.promotion.trackA): TrackView =>
        t ? { toCode: t.threshold.toCode, gaps: t.gaps, met: t.met } : null;

      return {
        id: c.id,
        name: c.name || c.email || c.id,
        status: c.status,
        rankCode: c.rankCode,
        uplineName: c.uplineId ? (nameById.get(c.uplineId) ?? "—") : "—",
        entryType: c.entryType,
        hireDate: c.hireDate,
        tenureRankCode: c.tenureRankCode,
        tenureUntil: c.tenureUntil,
        tenureSettledCode: ov.tenure.settledCode,
        tenureNote: ov.tenure.note ?? null,
        tenureExpired: ov.tenure.expired,
        initialCases: c.initialCases,
        initialFees: c.initialFees,
        recruitAllowed: c.recruitAllowed,
        leadAllowed: c.leadAllowed,
        personalCases: ov.stats.personalCases,
        personalFees: ov.stats.personalFees,
        teamCases: ov.stats.teamCases,
        trackA: track(ov.promotion.trackA),
        trackB: track(ov.promotion.trackB),
        canPromote: ov.promotion.canPromote,
        promoteTrack: ov.promotion.track,
        blocked: ov.promotion.blocked,
        maintExec: ov.maintenance.execCases,
        maintExecPass: ov.maintenance.execPass,
        maintHours: ov.maintenance.trainHours,
        maintTrainPass: ov.maintenance.trainPass,
        maintPass: ov.maintenance.pass,
        maintExempt: ov.maintenance.exempt,
        maintExemptReason: ov.maintenance.exemptReason,
        canRecruit: ov.canRecruit,
        canReceiveLeads: ov.canReceiveLeads,
        events: events.filter((e) => e.coachId === c.id).map((e) => ({
          id: e.id, fromCode: e.fromCode, toCode: e.toCode, reason: e.reason,
          effectiveAt: e.effectiveAt, note: e.note,
        })),
      };
    });

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="教練職級與晉升" />
      <AdminNav />

      <section className="w-full px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">教練職級與晉升追蹤</h1>
          <p className="text-sm text-tx2 mt-1">
            累計指標由案件即時推導（唯讀），職級異動一律留紀錄。制度版本：
            <b className="text-brand2 ml-1">{version.version}</b>
            {params.ranks.length === 0 && (
              <span className="text-danger ml-2">職級表尚未設定，晉升判定不會啟動</span>
            )}
          </p>
        </div>
        <AdvisorsBoard advisors={views} rankCodes={params.ranks.map((r) => r.code)} year={year} />
      </section>
    </main>
  );
}
