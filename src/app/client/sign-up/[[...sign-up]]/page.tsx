import { SignUp } from "@clerk/nextjs";

// 客戶端申請帳號（獨立入口）。註冊後進 /portal，於該頁 ensureClientUser 建立客戶帳號。
// redirect_url：見 /client/sign-in 的說明——邀請連結的 code 必須跨過註冊流程活下來。
export default async function Page({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const sp = await searchParams;
  const back = sp.redirect_url && sp.redirect_url.startsWith("/") ? sp.redirect_url : undefined;
  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] px-6 py-12">
      <SignUp
        routing="hash"
        signInUrl={back ? `/client/sign-in?redirect_url=${encodeURIComponent(back)}` : "/client/sign-in"}
        forceRedirectUrl={back}
        fallbackRedirectUrl="/portal"
      />
    </main>
  );
}
