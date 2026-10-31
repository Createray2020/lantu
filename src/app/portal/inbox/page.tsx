import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { listNotifications, unreadCount } from "@/lib/notify";
import { countMyPending } from "@/lib/docsStore";
import NotificationList from "@/components/NotificationList";
import ShellBar from "@/components/shell/ShellBar";
import { DEFAULT_THEME } from "@/lib/theme";
import { DEFAULT_UI_SCALE } from "@/lib/uiScale";

export const dynamic = "force-dynamic";

/**
 * 客戶端收件匣（2026/11/01 介面整理第一波）。
 * 教練傳來要你做的事（待簽合約）和通知集中在這裡；原本的「通知」「文件」頁都還在。
 */
export default async function PortalInbox() {
  const me = await ensureClientUser();
  if (!me) redirect("/client/sign-in");
  const [list, docPending, unread] = await Promise.all([
    listNotifications("client", me.id, 40).catch(() => []),
    countMyPending({ clientUserId: me.id }).catch(() => 0),
    unreadCount("client", me.id).catch(() => 0),
  ]);
  const row = "flex items-center justify-between gap-4 rounded-xl border border-line bg-panel shadow-e1 px-4 py-3";
  return (
    <div className="min-h-screen bg-canvas text-tx flex flex-col">
      <ShellBar kind="client" theme={DEFAULT_THEME} uiScale={DEFAULT_UI_SCALE} persist={false} counts={unread + docPending} />
      <main className="flex-1 px-4 sm:px-6 py-8">
        <section className="max-w-2xl mx-auto flex flex-col gap-7">
          <div>
            <h1 className="font-serif text-2xl font-bold">收件匣</h1>
            <p className="text-sm text-tx2 mt-1">教練傳給你的事和要你做的事都在這裡。</p>
          </div>
          {docPending > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-bold text-tx2">待辦</h2>
              <div className={row}>
                <div><div className="font-bold">輪到你簽的文件 {docPending} 份</div><div className="text-13 text-tx2">在手機上就能觸控簽名</div></div>
                <Link href="/portal/docs" className="shrink-0 rounded-lg bg-brand text-onbrand text-sm font-bold px-3 py-1.5">簽署</Link>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-tx2 flex items-center">通知<Link href="/portal/notifications" className="ml-auto text-xs font-normal text-brand2 hover:underline">全部通知</Link></h2>
            <NotificationList side="client" rows={list.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, read: !!n.readAt, at: n.createdAt.toISOString() }))} />
          </div>
        </section>
      </main>
    </div>
  );
}
