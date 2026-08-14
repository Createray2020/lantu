import { SignIn } from "@clerk/nextjs";

// 客戶端登入（獨立入口）。用元件 props 覆寫導向，登入後進 /portal，
// 不影響顧問流程（顧問走 /sign-in，仍由 env 導向 /dashboard）。
export default function Page() {
  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] px-6 py-12">
      <SignIn
        routing="path"
        path="/client/sign-in"
        signUpUrl="/client/sign-up"
        fallbackRedirectUrl="/portal"
      />
    </main>
  );
}
