import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
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
        <span className="text-[#a9bccf] text-xs">我的公開檔案</span>
        <div className="flex-1" />
        <Link href="/dashboard" className="text-[#a9bccf] text-sm hover:text-white">← 回系統</Link>
        <UserButton />
      </header>

      <section className="p-6 max-w-5xl">
        <div className="mb-5">
          <h1 className="text-xl font-bold">我的公開檔案</h1>
          <p className="text-sm text-[#a9bccf] mt-1 leading-relaxed">
            這裡的內容會<b className="text-[#e0bd8b]">公開顯示在官網的教練頁</b>，
            客戶挑選教練時看到的就是這一份。沒有填寫的教練不會出現在公開列表——
            只有姓名的卡片對客戶沒有判斷價值。
          </p>
        </div>

        {/* 教練編號：客戶要「指定你」就是輸入這一組。C 階教練在官網卡片上不給直接點，
            這組號是他們唯一的進場方式，所以放在檔案頁最顯眼的地方讓教練隨手抄得到。 */}
        <div className="mb-5 rounded-xl border border-[#c99a5b]/30 bg-[#c99a5b]/10 px-4 py-3">
          <div className="text-xs text-[#a9bccf]">我的教練編號</div>
          <div className="font-mono text-2xl tracking-[0.14em] text-[#e0bd8b] mt-0.5">
            {me.code ?? "—"}
          </div>
          <p className="text-[12px] text-[#a9bccf] mt-1 leading-relaxed">
            把這組編號給客戶，他到{" "}
            <Link href="/coaches" className="underline underline-offset-4 hover:text-white">官網教練頁</Link>{" "}
            輸入就能直接把連結申請送給你（一樣要你按接受才會掛上）。
          </p>
        </div>

        <ProfileEditor
          initial={initial}
          specialtyOptions={params.settings.specialties ?? []}
          coachName={me.name || me.email || "教練"}
          rankLabel={publicRankLabel(me.rankCode)}
          published={p?.published !== false}
        />
      </section>
    </main>
  );
}
