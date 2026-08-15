import Link from "next/link";
import { ensureClientUser } from "@/lib/clientUser";
import { redeemInvite } from "@/lib/coachLink";

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
    return (
      <Shell>
        <h1 className="font-serif text-2xl mb-3">教練邀請連結</h1>
        <p className="text-[#a7bacb] mb-6">請先登入你的客戶帳號，再重新開啟這條邀請連結。</p>
        <Link href="/client/sign-in" className="inline-block font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg">前往客戶登入</Link>
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
          <Link href="/portal/plan" className="inline-block font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg">查看我的財務藍圖</Link>
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
