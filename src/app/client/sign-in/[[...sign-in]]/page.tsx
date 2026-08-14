import { SignIn } from "@clerk/nextjs";

// 客戶端登入（獨立入口）。用元件 props 覆寫導向，登入後進 /portal，
// 不影響教練流程（教練走 /sign-in，仍由 env 導向 /dashboard）。
export default function Page() {
  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] px-6 py-12">
      <SignIn
        routing="hash"
        signUpUrl="/client/sign-up"
        fallbackRedirectUrl="/portal"
      />
    </main>
  );
}
