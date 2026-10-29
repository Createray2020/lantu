import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { claimPath } from "@/lib/joinFlow";
import { getInviteByCode } from "@/lib/coachLink";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-tx grid place-items-center px-6">
      <div className="max-w-md text-center">{children}</div>
    </div>
  );
}

// 客戶開啟教練的邀請連結 → 直接掛到該教練。
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string; done?: string }> }) {
  const sp = await searchParams;
  const code = sp.code || "";
  const user = await ensureClientUser();

  if (!user) {
    // 未登入：把整條邀請連結（含 code）當 redirect_url 帶進客戶端註冊/登入，
    // 回來時才綁得到教練。舊版只給一顆「前往客戶登入」，沒有註冊入口、也沒帶 code——
    // 新客戶無路可走，最後從官網點到教練入口，就變成「教練申請」待審核。
    // 註冊／登入頁會把它換成 /portal/redeem（lib/joinFlow.afterAuthPath）；碼另外也已由 proxy 記進 cookie。
    const back = encodeURIComponent(`/portal/join?code=${code}`);
    const inv = code ? await getInviteByCode(code) : null;
    return (
      <Shell>
        <div className="text-5xl mb-3">🤝</div>
        <h1 className="font-serif text-2xl mb-3">
          {inv?.clientId
            ? `${inv.coachName ?? "教練"} 已為你準備好財務規劃`
            : inv?.coachName ? `${inv.coachName} 邀請你一起做財務規劃` : "教練邀請連結"}
        </h1>
        <p className="text-tx2 mb-6">
          {inv?.clientId
            ? <>建立或登入你的<strong className="text-tx">客戶</strong>帳號後，就會接上教練{inv.coachName ? ` ${inv.coachName}` : ""}為你做的規劃，隨時可以回來看。</>
            : <>建立你的<strong className="text-tx">客戶</strong>帳號後就會自動連結{inv?.coachName ? `教練 ${inv.coachName}` : "這位教練"}，可以一起規劃。</>}
        </p>
        <Link
          href={`/client/sign-up?redirect_url=${back}`}
          className="inline-block font-bold text-onbrand bg-brand hover:bg-brand2 px-6 py-2.5 rounded-lg"
        >
          免費建立客戶帳號
        </Link>
        <div className="mt-4">
          <Link href={`/client/sign-in?redirect_url=${back}`} className="text-sm text-tx2 hover:text-tx underline underline-offset-4">
            已有客戶帳號，直接登入
          </Link>
        </div>
      </Shell>
    );
  }
  if (!code) {
    return <Shell><p className="text-tx2">邀請連結不完整。</p><div className="mt-4"><Link href="/portal" className="underline underline-offset-4">回我的首頁</Link></div></Shell>;
  }
  // 已登入：一律交給認領頁（非公開路由，先確認是誰的規劃、按確認才綁）。
  // done=1 是上一版兌換完導回來的結果頁網址——還留在誰的瀏覽器紀錄裡就送回首頁。
  if (sp.done === "1") redirect("/portal");
  redirect(claimPath(code));
}
