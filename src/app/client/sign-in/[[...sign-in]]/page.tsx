import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import AuthShell from "@/components/AuthShell";
import { getInviteByCode } from "@/lib/coachLink";

// 客戶端登入（獨立入口）。用元件 props 覆寫導向，登入後進 /portal，
// 不影響教練流程（教練走 /sign-in，導向 /dashboard）。
// redirect_url：教練邀請連結會帶著它進來（?redirect_url=/portal/join?code=…），
// 登入後必須回到原本那條邀請連結，否則 code 掉了就永遠綁不到教練。
export default async function Page({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const sp = await searchParams;
  const back = sp.redirect_url && sp.redirect_url.startsWith("/") ? sp.redirect_url : undefined;

  const code = back?.startsWith("/portal/join") ? new URLSearchParams(back.split("?")[1] ?? "").get("code") : null;
  const inv = code ? await getInviteByCode(code).catch(() => null) : null;

  const signUpHref = back ? `/client/sign-up?redirect_url=${encodeURIComponent(back)}` : "/client/sign-up";

  return (
    <AuthShell
      title="登入你的客戶帳號"
      subtitle={
        inv?.coachName
          ? <>登入後就會連上 <b className="text-tx">{inv.coachName}</b>。</>
          : "登入後可以看自己的財務規劃與報告書。"
      }
      footer={
        <p className="text-sm text-tx2">
          還沒有帳號？{" "}
          <Link href={signUpHref} className="text-brand2 hover:text-tx underline underline-offset-4">免費建立</Link>
        </p>
      }
    >
      <SignIn
        routing="hash"
        signUpUrl={signUpHref}
        forceRedirectUrl={back}
        fallbackRedirectUrl="/portal"
      />
    </AuthShell>
  );
}
