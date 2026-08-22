import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { listAllProfiles } from "@/lib/coachProfile";
import ProfilesBoard, { type Row } from "./ProfilesBoard";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (!(await isAdmin(me))) redirect("/dashboard");

  const raw = await listAllProfiles();
  const rows: Row[] = raw.map((r) => ({
    id: r.id,
    name: r.name || r.email || r.id,
    email: r.email,
    status: r.status,
    hasProfile: !!r.p,
    published: r.p?.published !== false,
    headline: r.p?.headline ?? null,
    specialties: r.p?.specialties ?? [],
    hasPhoto: !!r.p?.photoUrl,
    updatedAt: r.p?.updatedAt ? r.p.updatedAt.toISOString().slice(0, 10) : null,
  }));

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
        <span className="text-[#a9bccf] text-xs">教練公開檔案</span>
        <div className="flex-1" />
        
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-6xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">教練公開檔案</h1>
          <p className="text-sm text-[#a9bccf] mt-1">
            檔案由教練自己填寫，存檔即公開。這裡只做檢視與下架——
            內容是教練本人的話，代寫會讓它失去意義；有問題就下架並請本人修改。
          </p>
        </div>
        <ProfilesBoard rows={rows} />
      </section>
    </main>
  );
}
