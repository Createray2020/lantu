import { redirect } from "next/navigation";
import Link from "next/link";
import { ensureCoach } from "@/lib/coach";
import { listCoursesFor } from "@/lib/learn";
import { isModuleOn, moduleNotice } from "@/lib/platformModules";
import DashboardHeader from "../DashboardHeader";
import { headerProps } from "../headerProps";
import ReadOnlyBanner from "../ReadOnlyBanner";
import ModuleClosed from "./ModuleClosed";

export const dynamic = "force-dynamic";

// 教練學習區：課程列表 ＋ 完成進度。
// 「看完沒」是教練自己標的，不做播放進度追蹤 —— 影片放在 YouTube／雲端硬碟，
// 我們拿不到播放事件，硬做只會做出一個不準的數字。
export default async function LearnPage() {
  const coach = await ensureCoach();
  if (!coach) redirect("/dashboard");
  if (coach.status !== "active") redirect("/dashboard");

  const hp = await headerProps(coach);
  // 模組閘：頂欄入口已經藏起來了，但直接打網址的人也得看到同一件事。
  // 藏入口是「不引導」，這裡才是「擋住」。
  if (!(await isModuleOn("learn"))) {
    return (
      <div className="min-h-screen bg-canvas text-tx">
        <DashboardHeader {...hp} />
        <ModuleClosed title="學習區建置中" notice={await moduleNotice("learn")} />
      </div>
    );
  }

  const courses = await listCoursesFor(coach);

  const groups = new Map<string, typeof courses>();
  for (const c of courses) {
    const k = c.category || "一般課程";
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }

  const doneAll = courses.filter((c) => c.completed).length;

  return (
    <div className="min-h-screen bg-canvas text-tx">
      <DashboardHeader {...hp} />
      <ReadOnlyBanner license={hp.license} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-baseline gap-3 mb-1">
          <h1 className="font-serif text-2xl">學習區</h1>
          <span className="text-sm text-tx2">
            共 {courses.length} 門課 · 已完成 <b className="text-brand2">{doneAll}</b> 門
          </span>
        </div>
        <p className="text-xs text-tx3 mb-6">
          看完一個單元後按「標記完成」，進度會留在你的帳號裡。有設定認列時數的課程，全部單元完成後會自動寫入訓練時數。
        </p>

        {courses.length === 0 && (
          <div className="rounded-xl border border-line bg-panel px-5 py-10 text-center text-tx3 shadow-e1">
            目前還沒有開放給你的課程。
          </div>
        )}

        {[...groups.entries()].map(([cat, list]) => (
          <section key={cat} className="mb-7">
            <h2 className="text-11 tracking-[0.22em] text-tx3 mb-2.5">{cat}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((c) => {
                const pct = c.lessonCount ? Math.round((c.doneCount / c.lessonCount) * 100) : 0;
                return (
                  <Link
                    key={c.id}
                    href={`/dashboard/learn/${c.id}`}
                    className="block rounded-xl border border-line bg-panel hover:border-brand/50 transition overflow-hidden shadow-e1"
                  >
                    {c.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.coverUrl} alt="" className="w-full h-28 object-cover" />
                    )}
                    <div className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <h3 className="font-bold flex-1">{c.title}</h3>
                        {c.completed && (
                          <span className="text-10 font-bold px-1.5 py-0.5 rounded bg-ok-solid/20 text-ok border border-ok-solid/50 whitespace-nowrap">
                            已完成
                          </span>
                        )}
                      </div>
                      {c.summary && <p className="text-xs text-tx2 mt-1 line-clamp-2">{c.summary}</p>}
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-tx/10 overflow-hidden">
                          <div
                            className="h-full bg-brand"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-11 text-tx3 whitespace-nowrap">
                          {c.doneCount}/{c.lessonCount} 單元
                        </span>
                      </div>
                      {c.trainingHours != null && (
                        <div className="text-11 text-tx3 mt-1.5">
                          完課認列 {c.trainingHours} 小時訓練時數
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
