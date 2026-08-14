import { SignUp } from "@clerk/nextjs";

// 客戶端申請帳號（獨立入口）。註冊後進 /portal，於該頁 ensureClientUser 建立客戶帳號。
export default function Page() {
  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] px-6 py-12">
      <SignUp
        routing="path"
        path="/client/sign-up"
        signInUrl="/client/sign-in"
        fallbackRedirectUrl="/portal"
      />
    </main>
  );
}
