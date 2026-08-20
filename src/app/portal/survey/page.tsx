import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { ensureClientUser } from "@/lib/clientUser";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { listClientCases, listSurveys, questionsOf } from "@/lib/comp/survey";
import SurveyForm, { type SurveyCase } from "./SurveyForm";

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
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7] flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-white/10">
        <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
          <span className="grid place-items-center w-9 h-9 rounded-xl border border-[#c99a5b]">
            <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
              <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </span>
          <span className="font-serif tracking-[0.14em] text-lg">嵐途 LAN TU</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/portal" className="text-sm text-[#a7bacb] hover:text-white">← 回首頁</Link>
          <SignOutButton redirectUrl="/">
            <button className="text-sm text-[#a7bacb] hover:text-white border border-white/15 rounded-lg px-3 py-1.5">登出</button>
          </SignOutButton>
        </div>
      </header>

      <main className="flex-1 px-5 sm:px-8 py-6 max-w-2xl w-full mx-auto">
        <h1 className="text-xl font-bold mb-1">服務回饋</h1>
        <p className="text-sm text-[#a7bacb] mb-6">
          你的回饋是顧問改進服務的依據，也是這份服務正式結案的一步。
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
