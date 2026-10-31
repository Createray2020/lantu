import Link from "next/link";
import { redirect } from "next/navigation";
import DashboardHeader from "../DashboardHeader";
import { headerProps } from "../headerProps";
import { ensureCoach } from "@/lib/coach";
import { listNotifications } from "@/lib/notify";
import { countPendingForCoach } from "@/lib/coachLink";
import { countPendingInvitesForCoach } from "@/lib/clientCollab";
import { countPendingIntroductions } from "@/lib/coachApplyStore";
import { listDocTodos } from "@/lib/docsStore";
import { toTodoRows } from "@/lib/docTodoRows";
import { countPendingApplications } from "@/lib/inbox";
import NotificationList from "@/components/NotificationList";
import DocTodoList from "@/components/DocTodoList";

export const dynamic = "force-dynamic";

/**
 * 收件匣（2026/11/01 介面整理第一波）。
 *
 * 改版前「有人在等我」散在四個地方：頂欄的待確認、通知、我的文件（待簽），管理者還有後台的待我處理。
 * 這一頁把它們集中顯示，每一組都直接連到原本處理的地方——原本的四個頁面全部保留，這裡不開新表、
 * 不複製任何處理邏輯（核准、簽署、接受連結都還在原頁做）。
 */
export default async function InboxPage() {
  const me = await ensureCoach();
  if (!me || me.status !== "active") redirect("/dashboard");
  const hp = await headerProps(me);
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);
  const [links, collab, intros, notes, myTodos, applications, orgTodos] = await Promise.all([
    safe(countPendingForCoach(me.id), 0),
    safe(countPendingInvitesForCoach(me.id), 0),
    safe(countPendingIntroductions(me.id), 0),
    safe(listNotifications("coach", me.id, 40), []),
    safe(listDocTodos({ coachId: me.id }), []),
    hp.isAdmin ? safe(countPendingApplications(), 0) : Promise.resolve(0),
    hp.isAdmin ? safe(listDocTodos(), []) : Promise.resolve([]),
  ]);

  const requests = [
    { n: links, label: "客戶想綁定你為教練" },
    { n: collab, label: "共同執案邀請待回覆" },
    { n: intros, label: "報聘申請等你這位推薦人確認" },
  ].filter((r) => r.n > 0);
  const unreadNotes = notes.filter((n) => !n.readAt).length;
  const nothing = requests.length === 0 && hp.docsPending === 0 && myTodos.length === 0 && unreadNotes === 0 && applications === 0 && orgTodos.length === 0;

  const group = "flex flex-col gap-2";
  const gh = "flex items-center gap-2 text-sm font-bold text-tx2";
  const pill = "text-11 font-bold px-2 py-px rounded-full bg-panel2 text-tx2";
  const row = "flex items-center justify-between gap-4 rounded-xl border border-line bg-panel shadow-e1 px-4 py-3";
  const go = "shrink-0 rounded-lg bg-brand text-onbrand text-sm font-bold px-3 py-1.5 hover:opacity-90";

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <DashboardHeader {...hp} />
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-7">
        <div>
          <h1 className="font-serif text-2xl font-bold">收件匣</h1>
          <p className="text-sm text-tx2 mt-1">所有在等你處理的事都在這裡：待確認、待簽文件、通知{hp.isAdmin ? "、後台的待我處理" : ""}。每一項都直接連到原本處理的地方。</p>
        </div>

        {nothing && <div className="rounded-xl bg-panel border border-line px-5 py-10 text-center text-tx2">目前沒有在等你處理的事。</div>}

        {hp.isAdmin && (applications > 0 || orgTodos.length > 0) && (
          <div className={group}>
            <h2 className={gh}>待我處理<span className={pill}>{applications + orgTodos.length}</span></h2>
            {applications > 0 && (
              <div className={row}>
                <div><div className="font-bold">報聘審核 {applications} 位</div><div className="text-13 text-tx2">申請人在等開通</div></div>
                <Link href="/admin/inbox" className={go}>審核</Link>
              </div>
            )}
            {orgTodos.length > 0 && (
              <div className={row}>
                <div><div className="font-bold">需要處理的文件 {orgTodos.length} 份</div><div className="text-13 text-tx2">拒簽、逾期或卡太久沒人簽</div></div>
                <Link href="/admin/inbox" className={go}>前往處理</Link>
              </div>
            )}
          </div>
        )}

        {requests.length > 0 && (
          <div className={group}>
            <h2 className={gh}>待確認<span className={pill}>{requests.reduce((a, r) => a + r.n, 0)}</span></h2>
            {requests.map((r) => (
              <div key={r.label} className={row}>
                <div className="font-bold">{r.label}<span className="ml-2 text-brand2">{r.n}</span></div>
                <Link href="/dashboard/requests" className={go}>確認</Link>
              </div>
            ))}
          </div>
        )}

        {(hp.docsPending > 0 || myTodos.length > 0) && (
          <div className={group}>
            <h2 className={gh}>待簽文件<span className={pill}>{hp.docsPending + myTodos.length}</span></h2>
            {hp.docsPending > 0 && (
              <div className={row}>
                <div><div className="font-bold">輪到你簽的文件 {hp.docsPending} 份</div><div className="text-13 text-tx2">合約與培訓文件</div></div>
                <Link href="/dashboard/docs" className={go}>簽署</Link>
              </div>
            )}
            <DocTodoList rows={toTodoRows(myTodos, { coachId: me.id })} />
          </div>
        )}

        <div className={group}>
          <h2 className={gh}>通知{unreadNotes > 0 && <span className={pill}>{unreadNotes} 未讀</span>}<Link href="/dashboard/notifications" className="ml-auto text-xs font-normal text-brand2 hover:underline">全部通知</Link></h2>
          <NotificationList side="coach" rows={notes.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, read: !!n.readAt, at: n.createdAt.toISOString() }))} />
        </div>
      </section>
    </main>
  );
}
