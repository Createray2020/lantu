import { redirect } from "next/navigation";
import { ensureCoach, isAdmin, listCoaches } from "@/lib/coach";
import { getApplySettings, listApplications } from "@/lib/coachApplyStore";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";
import InboxBoard, { type InboxItem } from "./InboxBoard";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  if (!d) return null;
  const x = new Date(d);
  return `${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}`;
}

/**
 * 待我處理：一次一件、判斷型的後台工作。
 *
 * 這一頁存在的理由寫在 InboxBoard 的檔頭——簡單說，「核准這一位」與「設定這一位」
 * 是兩種任務，前者在手機上做得完而且常常有人在等，後者不是。
 * 教練名冊那一頁（/admin）維持原樣，是設定用的完整工作台。
 */
export default async function InboxPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [coaches, applications, settings] = await Promise.all([
    listCoaches(),
    listApplications(),
    getApplySettings(),
  ]);

  const unitLabel = settings.licenseUnit === "year" ? "年" : "個月";

  const items: InboxItem[] = coaches
    .filter((c) => c.status === "pending")
    .map((c) => {
      const app = applications[c.id];
      // 「會寫入什麼」照 approveApplication 的同一條規則算：三項都是**原本空的才寫**，
      // 已經手動設過的人不會被核准動作蓋掉——所以這裡要照實說「維持現有」。
      const rank = c.rankCode
        ? `維持現有（${c.rankCode}）`
        : settings.defaultRankCode
          ? settings.defaultRankCode
          : "不帶（維持未定級）";
      const upline = c.uplineId
        ? "維持現有位置"
        : settings.bindUplineToIntroducer && app?.introducerName
          ? `掛在 ${app.introducerName} 之下`
          : "不綁定";
      const license = c.licenseUntil
        ? "維持現有期限"
        : settings.licenseOn
          ? `${settings.licenseQty} ${unitLabel}${rank === "INTERN" ? "（實習教練固定半年）" : ""}`
          : "不開通期限";

      return {
        id: c.id,
        name: c.name || "",
        email: c.email ?? null,
        clerkName: c.clerkName ?? null,
        createdAt: fmtDate(c.createdAt),
        note: c.note ?? null,
        hasApplication: !!app,
        route: app?.route ?? null,
        introducerName: app?.introducerName ?? null,
        introducerCode: app?.introducerCode ?? null,
        introducerState: app?.introducerState ?? "skipped",
        introducerNote: app?.introducerNote ?? null,
        phone: app?.phone ?? null,
        currentJob: app?.currentJob ?? null,
        motive: app?.motive ?? null,
        experience: app?.experience ?? null,
        licenses: app?.licenses ?? [],
        consents: app?.consents ?? {},
        reviewChecks: app?.reviewChecks ?? {},
        willWrite: { rank, upline, license },
      };
    });

  return (
    <main className="flex-1 bg-canvas text-tx min-h-dvh">
      <AdminHeader label="待我處理" />
      <AdminNav />

      <section className="p-4 sm:p-6 max-w-2xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">待我處理</h1>
          <p className="mt-1 text-sm leading-relaxed text-tx2">
            需要你判斷、而且有人在等的事。點一張卡片會開出完整內容與核准鈕——
            這一頁在手機上做得完，設定類的工作請用電腦開「教練帳號」。
          </p>
        </div>
        <InboxBoard items={items} settings={settings} />
      </section>
    </main>
  );
}
