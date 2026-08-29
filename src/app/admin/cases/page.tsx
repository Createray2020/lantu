import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { listBatches, listCases, listAdvisors, listPayouts } from "@/lib/comp/caseRepo";
import { isReversalKey } from "@/lib/comp/reversal";
import { ensureActiveVersion, listVersions, loadParams } from "@/lib/comp/repo";
import { listSurveys, questionsOf } from "@/lib/comp/survey";
import CasesBoard, { type CaseView, type ModuleOption, type PayoutView } from "./CasesBoard";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

function nextMonthPayout(settingsDay: number | undefined) {
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, settingsDay ?? 5));
  return { period, payoutDate: d.toISOString().slice(0, 10) };
}

export default async function CasesPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (!(await isAdmin(me))) redirect("/dashboard");

  const version = await ensureActiveVersion();
  const [cases, advisors, batches, versions, params] = await Promise.all([
    listCases(), listAdvisors(), listBatches(), listVersions(), loadParams(version.id),
  ]);
  const payoutsByCase = await Promise.all(cases.map((c) => listPayouts(c.id)));
  const surveys = await listSurveys(cases.map((c) => c.id));
  const surveyByCase = new Map(surveys.map((s) => [s.caseId, s]));
  const versionLabel = new Map(versions.map((v) => [v.id, v.version]));

  const views: CaseView[] = cases.map((c, i) => {
    const payouts: PayoutView[] = payoutsByCase[i].map((p) => ({
      id: p.id, payeeId: p.payeeId, payeeKey: p.payeeKey, payeeName: p.payeeName,
      kind: p.kind, role: p.role,
      rankCode: p.rankCode, promoPct: p.promoPct, execPct: p.execPct, bonusPct: p.bonusPct,
      totalPct: p.totalPct, amount: p.amount, status: p.status,
      reversal: isReversalKey(p.payeeKey),
      trace: Array.isArray(p.trace) ? (p.trace as string[]) : [],
    }));
    // 沖回列不參與「全鏈合計 100%」的驗算——它是退費的軌跡，不是分潤的一部分。
    const sum = payouts.filter((p) => !p.reversal).reduce((a, p) => a + p.totalPct, 0);
    return {
      id: c.id, clientName: c.clientName, serviceType: c.serviceType, fee: c.fee,
      moduleCode: c.moduleCode,
      moduleName: (params.modules ?? []).find((m) => m.code === c.moduleCode)?.name ?? "",
      refundAmount: c.refundAmount, isCompanyLead: c.isCompanyLead,
      promoterId: c.promoterId, executorId: c.executorId,
      signedAt: c.signedAt, paidAt: c.paidAt, surveyAt: c.surveyAt,
      caseYear: c.caseYear, status: c.status, note: c.note,
      versionLabel: versionLabel.get(c.versionId) ?? "—",
      surveyAnswers: Array.isArray(surveyByCase.get(c.id)?.answers)
        ? (surveyByCase.get(c.id)!.answers as string[])
        : null,
      surveyBy: surveyByCase.get(c.id)?.submittedBy ?? null,
      payouts,
      // 沒有分潤列時不判定為「未達 100%」——那是還沒算，不是算錯。
      balanced: payouts.every((p) => p.reversal) || Math.abs(sum - 100) < 1e-4,
    };
  });

  const peers = advisors
    .filter((a) => a.status === "active")
    .map((a) => ({ id: a.id, label: a.name || a.email || a.id, rankCode: a.rankCode }));

  const moduleOptions: ModuleOption[] = (params.modules ?? [])
    .filter((m) => m.enabled !== false)
    .map((m) => ({
      code: m.code, name: m.name, price: m.price ?? null,
      splitMode: m.splitMode ?? "chain",
      countPromotion: m.countPromotion !== false,
      countMaintenance: m.countMaintenance !== false,
    }));

  const brand = await getBrand();
  const { period, payoutDate } = nextMonthPayout(params.settings.payoutDay);

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
        <span className="text-[#a9bccf] text-xs">案件與分潤</span>
        <div className="flex-1" />
        
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-6xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">案件與分潤</h1>
          <p className="text-sm text-[#a9bccf] mt-1">
            登錄案件後系統立刻依「簽約當下的制度版本」算出逐層分潤；問卷回收才算結案並計入晉升指標，
            實際收訖才會進發放批次。
          </p>
        </div>
        {peers.length === 0 ? (
          <div className="rounded-lg border border-[#e0bd8b]/40 bg-[#e0bd8b]/10 px-4 py-3 text-sm text-[#e0bd8b]">
            還沒有已開通的教練，無法登錄案件。
          </div>
        ) : moduleOptions.length === 0 ? (
          <div className="rounded-lg border border-[#e0bd8b]/40 bg-[#e0bd8b]/10 px-4 py-3 text-sm text-[#e0bd8b]">
            還沒有服務模塊。請先到「業務制度 › 服務模塊與分潤架構」新增，或按「載入 V4 辦法數值」。
          </div>
        ) : (
          <CasesBoard cases={views} peers={peers} modules={moduleOptions} batches={batches}
            questions={questionsOf(params.settings)}
            marketingEnabled={params.settings.surveyMarketingOptIn !== false}
            defaultPeriod={period} defaultPayoutDate={payoutDate} />
        )}
      </section>
    </main>
  );
}
