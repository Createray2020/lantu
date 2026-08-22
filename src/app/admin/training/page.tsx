import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { listAdvisors, listTrainingRecords, listTrainingSessions } from "@/lib/comp/caseRepo";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { trainingHours } from "@/lib/comp/stats";
import TrainingBoard, { type ExternalView, type HoursRow, type SessionView } from "./TrainingBoard";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (!(await isAdmin(me))) redirect("/dashboard");

  const year = new Date().getUTCFullYear();
  const version = await ensureActiveVersion();
  const [params, coachRows, sessions, records] = await Promise.all([
    loadParams(version.id), listAdvisors(), listTrainingSessions(), listTrainingRecords(year),
  ]);

  const active = coachRows.filter((c) => c.status === "active");
  const nameById = new Map(coachRows.map((c) => [c.id, c.name || c.email || c.id]));

  const sessionViews: SessionView[] = sessions.map((s) => ({
    id: s.id, heldOn: s.heldOn, topic: s.topic, mode: s.mode, hours: s.hours,
    speakerId: s.speakerId, speakerName: s.speakerId ? (nameById.get(s.speakerId) ?? "—") : "—",
    attendees: records.filter((r) => r.sessionId === s.id).map((r) => ({
      id: r.coachId, name: nameById.get(r.coachId) ?? r.coachId, kind: r.kind, hours: r.hours,
    })),
  }));

  const externals: ExternalView[] = records
    .filter((r) => r.kind === "external")
    .map((r) => ({
      id: r.id, coachName: nameById.get(r.coachId) ?? r.coachId,
      title: r.title, hours: r.hours, status: r.status, year: r.year,
    }));

  const need = params.settings.trainHours ?? null;
  const hours: HoursRow[] = active.map((c) => {
    const h = trainingHours(records.filter((r) => r.coachId === c.id), params, year);
    return {
      id: c.id, name: c.name || c.email || c.id,
      internal: h.internal, speaker: h.speaker, external: h.external,
      externalRaw: h.externalRaw, total: h.total,
      need, pass: need === null ? true : h.total >= need,
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
        <span className="text-[#a9bccf] text-xs">訓練時數</span>
        <div className="flex-1" />
        
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-6xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">訓練時數與研討會</h1>
          <p className="text-sm text-[#a9bccf] mt-1">
            維持資格的訓練門檻（辦法第十六條第二項）就靠這一頁的資料。
          </p>
        </div>
        <TrainingBoard
          sessions={sessionViews}
          externals={externals}
          hours={hours}
          peers={active.map((c) => ({ id: c.id, name: c.name || c.email || c.id }))}
          year={year}
          perSession={params.settings.trainPerSession ?? null}
          speakerMult={params.settings.trainSpeakerMultiplier ?? null}
          cap={params.settings.trainExternalCap ?? null}
        />
      </section>
    </main>
  );
}
