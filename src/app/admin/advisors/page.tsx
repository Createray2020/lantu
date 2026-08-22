import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import {
  listAdvisors, listCases, listRankEvents, listTrainingRecords, toAdvisorRows, toCaseRows,
} from "@/lib/comp/caseRepo";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { buildOverview } from "@/lib/comp/view";
import AdvisorsBoard, { type AdvisorView, type TrackView } from "./AdvisorsBoard";
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
          id: c.id, name: c.name, rankCode: c.rankCode, uplineId: c.uplineId, sponsorId: c.sponsorId,
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
        sponsorId: c.sponsorId,
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

  const brand = await getBrand();

  return (
    <main className="flex-1 bg-[#081a2b] text-[#eef2f7] min-h-screen">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#0d2b45]">
        <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="嵐途" className="h-7 w-auto max-w-[160px] object-contain" />
          )}
          <span className="font-serif text-lg tracking-[0.14em]">嵐途 LAN TU</span>
        </Link>
        <span className="text-[#a9bccf] text-xs">顧問職級與晉升</span>
        <div className="flex-1" />
        
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-7xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">顧問職級與晉升追蹤</h1>
          <p className="text-sm text-[#a9bccf] mt-1">
            累計指標由案件即時推導（唯讀），職級異動一律留紀錄。制度版本：
            <b className="text-[#e0bd8b] ml-1">{version.version}</b>
            {params.ranks.length === 0 && (
              <span className="text-[#e08b7a] ml-2">職級表尚未設定，晉升判定不會啟動</span>
            )}
          </p>
        </div>
        <AdvisorsBoard advisors={views} rankCodes={params.ranks.map((r) => r.code)} year={year} />
      </section>
    </main>
  );
}
