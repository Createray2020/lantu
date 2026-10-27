import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { listNotifications } from "@/lib/notify";
import NotificationList from "@/components/NotificationList";
import BrandMark from "@/components/BrandMark";

export const dynamic = "force-dynamic";

// 客戶端：通知（站內）。
export default async function PortalNotifications() {
  const me = await ensureClientUser();
  if (!me) redirect("/client/sign-in");
  const list = await listNotifications("client", me.id, 80);
  return (
    <div className="min-h-screen bg-canvas text-tx flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-line">
        <Link href="/portal" className="flex items-center gap-3" title="回會員中心"><BrandMark /><span className="font-serif tracking-[0.14em] text-lg">嵐途 LAN TU</span></Link>
        <Link href="/portal" className="text-sm text-tx2 hover:text-tx border border-line2 rounded-lg px-3 py-1.5">回會員中心</Link>
      </header>
      <main className="flex-1 px-6 py-10">
        <section className="max-w-2xl mx-auto space-y-4">
          <h1 className="font-serif text-2xl">通知</h1>
          <NotificationList side="client" rows={list.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, read: !!n.readAt, at: n.createdAt.toISOString() }))} />
        </section>
      </main>
    </div>
  );
}
