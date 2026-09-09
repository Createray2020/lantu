import Link from "next/link";

// 模組關閉時的建置中頁。
// ⚠️ 刻意不是 404、也不是 redirect：教練直接打網址或用舊書籤進來時，
//    「這個頁面不存在」會被讀成系統壞了，而 redirect 到首頁則是什麼都沒說。
//    講清楚「還沒開放、之後會開」才是實話。
export default function ModuleClosed({ title, notice }: { title: string; notice: string }) {
  return (
    <div className="max-w-xl mx-auto px-6 py-20 text-center">
      <div className="text-5xl mb-4">🚧</div>
      <h1 className="font-serif text-2xl mb-3">{title}</h1>
      <p className="text-tx2 leading-relaxed">{notice}</p>
      <Link
        href="/dashboard"
        className="inline-block mt-6 font-bold text-onbrand bg-brand hover:bg-brand2 px-5 py-2.5 rounded-lg"
      >
        回教練首頁
      </Link>
    </div>
  );
}
