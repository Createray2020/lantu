import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { listAllProfiles } from "@/lib/coachProfile";
import ProfilesBoard, { type Row } from "./ProfilesBoard";
import AdminHeader from "../AdminHeader";
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

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="教練公開檔案" />
      <AdminNav />

      <section className="p-6 max-w-6xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">教練公開檔案</h1>
          <p className="text-sm text-tx2 mt-1">
            檔案由教練自己填寫，存檔即公開。這裡只做檢視與下架——
            內容是教練本人的話，代寫會讓它失去意義；有問題就下架並請本人修改。
          </p>
        </div>
        <ProfilesBoard rows={rows} />
      </section>
    </main>
  );
}
