import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { getInviteByCode } from "@/lib/coachLink";
import { isJoinCode, maskName } from "@/lib/joinFlow";
import ClaimConfirm from "./ClaimConfirm";
import ClaimForm from "./ClaimForm";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-tx grid place-items-center px-6 py-10">
      <div className="w-full max-w-md text-center">{children}</div>
    </div>
  );
}

// 客戶登入的認領頁（2026/10/29）。連結、cookie 補兌換、手動輸入開通碼，三條路都匯到這裡：
// 先讓客戶看清楚「哪位教練、為誰準備的」，按「確認接上」才綁。
// ⚠️ 非公開路由：proxy 先 auth.protect（完成 Clerk handshake）才進得來，所以這裡拿到的使用者一定是真的登入者。
export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const user = await ensureClientUser();
  if (!user) redirect("/client/sign-in?redirect_url=%2Fportal%2Fclaim");
  const sp = await searchParams;
  const code = isJoinCode(sp.code) ? sp.code : null;

  if (!code) {
    return (
      <Shell>
        <div className="text-5xl mb-3">🔑</div>
        <h1 className="font-serif text-2xl mb-2">輸入開通碼</h1>
        <p className="text-tx2 text-sm mb-6">教練替你準備好規劃時，會給你一組「客戶編號-開通碼」，例如 <span className="font-mono text-tx">2610008-483921</span>。</p>
        <ClaimForm />
        <div className="mt-6"><Link href="/portal" className="text-sm text-tx2 underline underline-offset-4">回我的首頁</Link></div>
      </Shell>
    );
  }

  const inv = await getInviteByCode(code);
  const mine = !!inv && inv.used && inv.usedByClientUserId === user.id;
  if (mine) redirect("/portal"); // 已經接上了（重開舊連結）
  if (!inv || (inv.used && inv.clientId)) {
    return (
      <Shell>
        <h1 className="font-serif text-2xl mb-2">這個連結已經無法使用</h1>
        <p className="text-tx2 text-sm mb-6">{inv ? "這條客戶登入連結已經被使用過。" : "找不到這個連結。"}請向教練重新索取，或改用開通碼。</p>
        <ClaimConfirm code={code} disabled />
      </Shell>
    );
  }

  const coach = inv.coachName ?? "你的教練";
  return (
    <Shell>
      <div className="text-5xl mb-3">🤝</div>
      {inv.clientId ? (
        <>
          <h1 className="font-serif text-2xl mb-2">{coach} 已為你準備好財務規劃</h1>
          <p className="text-tx2 text-sm mb-1">規劃對象：<b className="text-tx">{maskName(inv.clientName)}</b></p>
          <p className="text-tx3 text-xs mb-6">確認是你本人後，這份規劃會接到你目前登入的帳號（{user.email ?? "此帳號"}），之後登入就能隨時查看。</p>
        </>
      ) : (
        <>
          <h1 className="font-serif text-2xl mb-2">{coach} 邀請你一起做財務規劃</h1>
          <p className="text-tx3 text-xs mb-6">確認後，你的帳號（{user.email ?? "此帳號"}）會連結到這位教練。</p>
        </>
      )}
      <ClaimConfirm code={code} />
    </Shell>
  );
}
