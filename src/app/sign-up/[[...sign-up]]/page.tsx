import { SignUp } from "@clerk/nextjs";

// 教練註冊入口。註冊後導到 /dashboard/apply（明確送出教練申請），不是直接 /dashboard——
// 全域 env 的 fallbackRedirectUrl 是 /dashboard，任何沒覆寫的流程都會把人丟進教練端。
export default function Page() {
  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] px-6 py-12">
      <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/dashboard/apply" />
    </main>
  );
}
