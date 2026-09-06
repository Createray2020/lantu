import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import AuthShell from "@/components/AuthShell";
import { getInviteByCode } from "@/lib/coachLink";

// 客戶端申請帳號（獨立入口）。註冊後進 /portal，於該頁 ensureClientUser 建立客戶帳號。
// redirect_url：見 /client/sign-in 的說明——邀請連結的 code 必須跨過註冊流程活下來。
//
// ⚠️ 外殼不是裝飾：客戶是從「○○ 邀請你一起做財務規劃」那一頁點進來的，
//    如果下一頁只有一張沒有品牌、沒有教練名字的 Clerk 表單，他會不確定自己還在不在
//    同一條路上。所以這裡把 redirect_url 裡的邀請碼撈出來，把教練名字接著講一次。
export default async function Page({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const sp = await searchParams;
  const back = sp.redirect_url && sp.redirect_url.startsWith("/") ? sp.redirect_url : undefined;

  // 只從自家的 redirect_url 取 code，取不到就當作沒有——查不到教練名字不影響註冊。
  const code = back?.startsWith("/portal/join") ? new URLSearchParams(back.split("?")[1] ?? "").get("code") : null;
  const inv = code ? await getInviteByCode(code).catch(() => null) : null;

  const signInHref = back ? `/client/sign-in?redirect_url=${encodeURIComponent(back)}` : "/client/sign-in";

  return (
    <AuthShell
      title={inv?.coachName ? `建立帳號，連結教練 ${inv.coachName}` : "建立你的客戶帳號"}
      subtitle={
        inv?.coachName
          ? <>帳號建好後會自動連上 <b className="text-tx">{inv.coachName}</b>，你們就能一起規劃。</>
          : "帳號免費，建立後可以做自己的財務規劃、也能連結教練。"
      }
      footer={
        <p className="text-sm text-tx2">
          已經有帳號了？{" "}
          <Link href={signInHref} className="text-brand2 hover:text-tx underline underline-offset-4">直接登入</Link>
        </p>
      }
    >
      <SignUp
        routing="hash"
        signInUrl={signInHref}
        forceRedirectUrl={back}
        fallbackRedirectUrl="/portal"
      />
    </AuthShell>
  );
}
