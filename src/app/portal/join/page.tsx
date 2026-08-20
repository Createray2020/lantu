import Link from "next/link";
import { ensureClientUser } from "@/lib/clientUser";
import { redeemInvite, getInviteByCode } from "@/lib/coachLink";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#081a2b] text-[#eef2f7] grid place-items-center px-6">
      <div className="max-w-md text-center">{children}</div>
    </div>
  );
}

// 客戶開啟教練的邀請連結 → 直接掛到該教練。
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const sp = await searchParams;
  const code = sp.code || "";
  const user = await ensureClientUser();

  if (!user) {
    // 未登入：把整條邀請連結（含 code）當 redirect_url 帶進客戶端註冊/登入，
    // 回來時才綁得到教練。舊版只給一顆「前往客戶登入」，沒有註冊入口、也沒帶 code——
    // 新客戶無路可走，最後從官網點到教練入口，就變成「教練申請」待審核。
    const back = encodeURIComponent(`/portal/join?code=${code}`);
    const inv = code ? await getInviteByCode(code) : null;
    return (
      <Shell>
        <div className="text-5xl mb-3">🤝</div>
        <h1 className="font-serif text-2xl mb-3">
          {inv?.coachName ? `${inv.coachName} 邀請你一起做財務規劃` : "教練邀請連結"}
        </h1>
        <p className="text-[#a7bacb] mb-6">
          建立你的<strong className="text-[#eef2f7]">客戶</strong>帳號後就會自動連結
          {inv?.coachName ? `教練 ${inv.coachName}` : "這位教練"}，可以一起規劃。
        </p>
        <Link
          href={`/client/sign-up?redirect_url=${back}`}
          className="inline-block font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg"
        >
          免費建立客戶帳號
        </Link>
        <div className="mt-4">
          <Link href={`/client/sign-in?redirect_url=${back}`} className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">
            已有客戶帳號，直接登入
          </Link>
        </div>
      </Shell>
    );
  }
  if (!code) {
    return <Shell><p className="text-[#a7bacb]">邀請連結不完整。</p><div className="mt-4"><Link href="/portal" className="underline underline-offset-4">回我的首頁</Link></div></Shell>;
  }

  const r = await redeemInvite(code, user);
  return (
    <Shell>
      {r.ok ? (
        <>
          <div className="text-5xl mb-3">🤝</div>
          <h1 className="font-serif text-2xl mb-2">連結成功</h1>
          <p className="text-[#a7bacb] mb-6">你已連結教練{r.coachName ? `：${r.coachName}` : ""}，可以一起規劃了。</p>
          <Link href="/portal/passport" className="inline-block font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg">開始填人生護照</Link>
          <div className="mt-4">
            <Link href="/portal" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">先回我的首頁</Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="font-serif text-2xl mb-2">無法連結</h1>
          <p className="text-[#ff9b9b] mb-6">⚠ {r.error}</p>
          <Link href="/portal" className="underline underline-offset-4">回我的首頁</Link>
        </>
      )}
    </Shell>
  );
}
