import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] text-[#eef2f7] px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 w-16 h-16 rounded-2xl border border-[#c99a5b] grid place-items-center">
          <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-label="嵐途">
            <path d="M15 12 L15 33 L34 33" stroke="#a9bccf" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13 24 A13 13 0 0 1 36 16" stroke="#c99a5b" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="font-serif text-3xl tracking-[0.14em] mb-2">嵐途 LAN TU</h1>
        <p className="text-[#a9bccf] text-sm tracking-[0.08em] mb-8">
          全方位財務規劃 · 理解自己・做出選擇・走向未來
        </p>
        <Link
          href="/sign-in"
          className="inline-block rounded-lg bg-[#c99a5b] text-[#08202a] font-bold px-8 py-3"
        >
          教練登入
        </Link>
      </div>
    </main>
  );
}
