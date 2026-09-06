import { redirect } from "next/navigation";
import DashboardHeader from "../DashboardHeader";
import { headerProps } from "../headerProps";
import Link from "next/link";
import { ensureCoach } from "@/lib/coach";
import { getProfile } from "@/lib/coachProfile";
import { publicRankLabel } from "@/lib/license";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import ProfileEditor, { type ProfileForm } from "./ProfileEditor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (me.status !== "active") redirect("/dashboard");

  const version = await ensureActiveVersion();
  const [params, p] = await Promise.all([loadParams(version.id), getProfile(me.id)]);

  const initial: ProfileForm = {
    headline: p?.headline ?? "",
    bio: p?.bio ?? "",
    specialties: p?.specialties ?? [],
    photoUrl: p?.photoUrl ?? null,
    yearsExp: p?.yearsExp === null || p?.yearsExp === undefined ? "" : String(p.yearsExp),
    prevRole: p?.prevRole ?? "",
    credentials: p?.credentials ?? [],
    serviceModes: p?.serviceModes ?? [],
    areas: p?.areas ?? [],
    selfHidden: p?.selfHidden ?? false,
    displayName: me.displayName ?? "",
  };


  const hp = await headerProps(me);

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <DashboardHeader {...hp} />

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold">我的公開檔案</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            這裡的內容會<b className="text-brand2">公開顯示在官網的教練頁</b>，
            客戶挑選教練時看到的就是這一份。沒有填寫的教練不會出現在公開列表——
            只有姓名的卡片對客戶沒有判斷價值。
          </p>
        </div>

        {/* 教練編號：客戶要「指定你」就是輸入這一組。C 階教練在官網卡片上不給直接點，
            這組號是他們唯一的進場方式，所以放在檔案頁最顯眼的地方讓教練隨手抄得到。 */}
        <div className="mb-5 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3">
          <div className="text-xs text-tx2">我的教練編號</div>
          <div className="font-mono text-2xl tracking-[0.14em] text-brand2 mt-0.5">
            {me.code ?? "—"}
          </div>
          <p className="text-xs text-tx2 mt-1 leading-relaxed">
            把這組編號給客戶，他到{" "}
            <Link href="/coaches" className="underline underline-offset-4 hover:text-tx">官網教練頁</Link>{" "}
            輸入就能直接把連結申請送給你（一樣要你按接受才會掛上）。
          </p>
        </div>

        <ProfileEditor
          initial={initial}
          specialtyOptions={params.settings.specialties ?? []}
          coachName={me.name}
          loginName={me.clerkName ?? me.email ?? ""}
          rankLabel={publicRankLabel(me.rankCode)}
          published={p?.published !== false}
        />
      </section>
    </main>
  );
}
