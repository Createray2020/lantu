import { SignIn } from "@clerk/nextjs";

// 客戶端登入（獨立入口）。用元件 props 覆寫導向，登入後進 /portal，
// 不影響教練流程（教練走 /sign-in，導向 /dashboard）。
// redirect_url：教練邀請連結會帶著它進來（?redirect_url=/portal/join?code=…），
// 登入後必須回到原本那條邀請連結，否則 code 掉了就永遠綁不到教練。
export default async function Page({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const sp = await searchParams;
  const back = sp.redirect_url && sp.redirect_url.startsWith("/") ? sp.redirect_url : undefined;
  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] px-6 py-12">
      <SignIn
        routing="hash"
        signUpUrl={back ? `/client/sign-up?redirect_url=${encodeURIComponent(back)}` : "/client/sign-up"}
        forceRedirectUrl={back}
        fallbackRedirectUrl="/portal"
      />
    </main>
  );
}
