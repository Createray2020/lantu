import Link from "next/link";
import { applySteps, routeMeta } from "@/lib/coachApply";
import ApplyStepList from "@/components/ApplyStepList";
import type { ApplyProgress } from "@/app/dashboard/PendingNotice";

// 客戶端首頁的報聘（教練申請）常駐區塊。
//
// 為什麼要有這一塊：報聘表單 /dashboard/apply 一直都是通的——ensureCoach() 回 null 就直接
// 把申請表畫出來，只有客戶身分的帳號也進得去。壞的是**登入之後沒有任何一條路連得到它**：
// 指向 /apply 的連結全在登入前的官網（LandingView 的「加入我們」、/login 頁腳兩行小字），
// 而 `/` 對已登入的人直接 redirect 到 /portal。於是想報聘的人一註冊就變成客戶，
// 然後在客戶介面裡永遠找不到入口——他看到的現象就是「只能一直被登記為客戶登入」。
//
// ⚠️ 這是常駐入口，不是只在「還沒做人生護照」時才出現：教練↔客戶非互斥（教練也會用客戶介面
//    做自己的規劃），所以任何客戶在任何狀態下都應該看得到這條路。
export default function CoachEntry({
  state,
  progress,
}: {
  state: "none" | "pending" | "suspended";
  progress: ApplyProgress | null;
}) {
  if (state === "suspended") {
    return (
      <section className="max-w-2xl mx-auto mt-12 rounded-xl border border-white/10 bg-[#0a1a2b] px-5 py-5">
        <div className="text-[11px] tracking-[0.25em] text-[#6f869c] mb-2">COACH</div>
        <h2 className="font-serif text-lg mb-1.5">教練帳號已停權</h2>
        <p className="text-[13px] text-[#a7bacb] leading-relaxed">
          你的教練身分目前已停權，客戶端的功能不受影響。若有疑問請與嵐途聯繫。
        </p>
      </section>
    );
  }

  if (state === "pending") {
    return (
      <section className="max-w-2xl mx-auto mt-12 rounded-xl border border-[#c99a5b]/30 bg-[#c99a5b]/5 px-5 py-5">
        <div className="text-[11px] tracking-[0.25em] text-[#c99a5b] mb-2">COACH</div>
        <h2 className="font-serif text-lg mb-1.5">你的報聘申請審核中</h2>
        <p className="text-[13px] text-[#a7bacb] leading-relaxed mb-4">
          開通需經審核（含費用確認）。開通後這裡會變成教練工作台的入口。
        </p>
        {progress && (
          <div className="rounded-lg border border-white/10 bg-[#0a1a2b] p-4">
            <div className="text-[11px] text-[#6f869c] mb-2">報聘路線：{routeMeta(progress.route).label}</div>
            <ApplyStepList steps={applySteps(progress)} />
            {progress.introducerNote && (
              <p className="mt-3 pt-3 border-t border-white/10 text-[11px] text-[#a9bccf] whitespace-pre-wrap">
                介紹人留言：{progress.introducerNote}
              </p>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="max-w-2xl mx-auto mt-12 rounded-xl border border-white/10 bg-[#0a1a2b] px-5 py-5">
      <div className="text-[11px] tracking-[0.25em] text-[#c99a5b] mb-2">COACH</div>
      <h2 className="font-serif text-lg mb-1.5">想成為嵐途財務教練？</h2>
      <p className="text-[13px] text-[#a7bacb] leading-relaxed mb-4">
        你現在的帳號是客戶身分。教練與客戶並不互斥——同一組帳號可以兩邊都用，
        報聘核准後你仍然保有這裡的個人規劃。有介紹人可填教練編號，沒有也能直接申請。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/apply"
          className="font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-5 py-2.5 rounded-lg text-sm"
        >
          申請成為教練
        </Link>
        <Link
          href="/join"
          className="text-[12.5px] text-[#a7bacb] hover:text-white underline underline-offset-4"
        >
          先看看教練在做什麼
        </Link>
      </div>
    </section>
  );
}
