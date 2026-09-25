import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { ensureClientUser } from "@/lib/clientUser";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { listClientCases, listSurveys, questionsOf } from "@/lib/comp/survey";
import SurveyForm, { type SurveyCase } from "./SurveyForm";
import BrandMark from "@/components/BrandMark";

export const dynamic = "force-dynamic";

export default async function SurveyPage() {
  const client = await ensureClientUser();
  if (!client) redirect("/client/sign-in");

  const version = await ensureActiveVersion();
  const [params, cases] = await Promise.all([
    loadParams(version.id),
    listClientCases(client.id),
  ]);
  const surveys = await listSurveys(cases.map((c) => c.id));
  const byCase = new Map(surveys.map((s) => [s.caseId, s]));
  const moduleName = (code: string) =>
    (params.modules ?? []).find((m) => m.code === code)?.name ?? "";

  const views: SurveyCase[] = cases.map((c) => {
    const s = byCase.get(c.id);
    return {
      id: c.id,
      clientName: c.clientName,
      moduleName: moduleName(c.moduleCode),
      signedAt: c.signedAt,
      surveyAt: c.surveyAt,
      answers: Array.isArray(s?.answers) ? (s!.answers as string[]) : null,
      marketingOptIn: !!s?.marketingOptIn,
    };
  });

  return (
    <div className="min-h-screen bg-canvas text-tx flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-line">
        <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
          <BrandMark />
          <span className="font-serif tracking-[0.14em] text-lg">嵐途 LAN TU</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/portal" className="text-sm text-tx2 hover:text-tx">← 回首頁</Link>
          <SignOutButton redirectUrl="/">
            <button className="text-sm text-tx2 hover:text-tx border border-line2 rounded-lg px-3 py-1.5">登出</button>
          </SignOutButton>
        </div>
      </header>

      <main className="flex-1 px-5 sm:px-8 py-6 max-w-2xl w-full mx-auto">
        <h1 className="text-xl font-bold mb-1">服務回饋</h1>
        <p className="text-sm text-tx2 mb-6">
          你的回饋是教練改進服務的依據，也是這份服務正式結案的一步。
        </p>
        <SurveyForm
          cases={views}
          questions={questionsOf(params.settings)}
          marketingEnabled={params.settings.surveyMarketingOptIn !== false}
        />
      </main>
    </div>
  );
}
