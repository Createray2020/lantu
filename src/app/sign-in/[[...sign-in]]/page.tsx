import { SignIn } from "@clerk/nextjs";

// 教練登入入口。導向明確寫在元件上，不依賴全域 env 預設。
export default function Page() {
  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] px-6 py-12">
      <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/dashboard" />
    </main>
  );
}
