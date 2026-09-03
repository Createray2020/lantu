import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import {
  listAdvisors, listCases, listPayoutsFor, listRankEvents, listTrainingRecords,
  toAdvisorRows, toCaseRows,
} from "@/lib/comp/caseRepo";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { buildOverview } from "@/lib/comp/view";
import { personalStats } from "@/lib/comp/stats";
import MyBusiness, { type MyView } from "./MyBusiness";

export const dynamic = "force-dynamic";

export default async function MyBusinessPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (me.status !== "active") redirect("/dashboard");

  const year = new Date().getUTCFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const version = await ensureActiveVersion();
  const [params, coachRows, caseRows, trainRows, payouts, events] = await Promise.all([
    loadParams(version.id), listAdvisors(), listCases(), listTrainingRecords(year),
    listPayoutsFor(me.id), listRankEvents(me.id),
  ]);

  const advisors = toAdvisorRows(coachRows);
  const cases = toCaseRows(caseRows);
  const nameById = new Map(coachRows.map((c) => [c.id, c.name || c.email || c.id]));
  const caseById = new Map(caseRows.map((c) => [c.id, c]));

  const ov = buildOverview(
    {
      id: me.id, name: me.name, rankCode: me.rankCode, uplineId: me.uplineId,
      hireDate: me.hireDate, entryType: me.entryType,
      tenureRankCode: me.tenureRankCode, tenureUntil: me.tenureUntil,
      initialCases: me.initialCases, initialFees: me.initialFees,
      recruitAllowed: me.recruitAllowed, leadAllowed: me.leadAllowed,
    },
    { cases, advisors, params, year, today, training: trainRows.filter((t) => t.coachId === me.id) },
  );

  const rank = params.ranks.find((r) => r.code === me.rankCode);
  const track = (t: typeof ov.promotion.trackA) =>
    t ? { toCode: t.threshold.toCode, gaps: t.gaps, met: t.met } : null;

  // 待發放＝尚未標記 paid 的分潤。
  const pendingAmount = payouts
    .filter((p) => p.status !== "paid")
    .reduce((a, p) => a + p.amount, 0);

  const view: MyView = {
    name: me.name || me.email || "我",
    rankCode: me.rankCode,
    rankLabel: rank ? `${rank.groupName ?? ""}${rank.tierLabel && rank.tierLabel !== "—" ? rank.tierLabel : ""}` : "",
    promoPct: rank?.promoPct ?? null,
    execPct: rank?.execPct ?? null,
    tenureRankCode: me.tenureRankCode,
    tenureUntil: me.tenureUntil,
    tenureSettledCode: ov.tenure.settledCode,
    tenureNote: ov.tenure.note ?? null,
    pendingAmount,
    payoutDay: params.settings.payoutDay ?? null,
    stats: ov.stats,
    trackA: track(ov.promotion.trackA),
    trackB: track(ov.promotion.trackB),
    blocked: ov.promotion.blocked,
    maintenance: {
      execCases: ov.maintenance.execCases,
      execPass: ov.maintenance.execPass,
      trainHours: ov.maintenance.trainHours,
      trainPass: ov.maintenance.trainPass,
      pass: ov.maintenance.pass,
      exempt: ov.maintenance.exempt,
      exemptReason: ov.maintenance.exemptReason ?? null,
      needCases: params.settings.maintainCases ?? null,
      needHours: params.settings.trainHours ?? null,
    },
    canRecruit: ov.canRecruit,
    canReceiveLeads: ov.canReceiveLeads,
    daysLeftInYear: Math.max(0, Math.ceil(
      (Date.UTC(year, 11, 31) - Date.parse(today)) / 86_400_000,
    )),
    payouts: payouts.slice(0, 50).map((p) => {
      const c = caseById.get(p.caseId);
      return {
        id: p.id,
        period: (c?.paidAt ?? c?.signedAt ?? "").slice(0, 7) || "—",
        clientName: c?.clientName ?? "—",
        role: p.role ?? "",
        totalPct: p.totalPct,
        amount: p.amount,
        status: p.status,
        trace: Array.isArray(p.trace) ? (p.trace as string[]) : [],
      };
    }),
    team: ov.directs.map((d) => {
      const s = personalStats(cases, d.id, params, { year });
      return {
        id: d.id,
        name: nameById.get(d.id) ?? d.id,
        rankCode: d.rankCode ?? null,
        yearCases: s.cases,
      };
    }),
    events: events.map((e) => ({
      id: e.id, fromCode: e.fromCode, toCode: e.toCode, reason: e.reason,
      effectiveAt: e.effectiveAt, note: e.note,
    })),
    versionLabel: version.version,
  };

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
        <span className="text-[#a9bccf] text-xs">我的業務</span>
        <div className="flex-1" />
        <Link href="/dashboard/handbook" className="text-[#a9bccf] text-sm hover:text-white">制度說明</Link>
        <Link href="/admin/system/simulator" className="text-[#a9bccf] text-sm hover:text-white">分潤試算器</Link>
        <Link href="/dashboard" className="text-[#a9bccf] text-sm hover:text-white">← 回系統</Link>
        <UserButton />
      </header>

      <section className="p-6 max-w-5xl">
        <MyBusiness v={view} />
      </section>
    </main>
  );
}
