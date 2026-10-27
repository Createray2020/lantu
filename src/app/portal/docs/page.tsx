import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureClientUser } from "@/lib/clientUser";
import { listMyInstances, getSignature, sweepExpired } from "@/lib/docsStore";
import DocList from "@/components/DocList";
import MySignature from "@/components/MySignature";
import BrandMark from "@/components/BrandMark";

export const dynamic = "force-dynamic";

// 客戶端：我的合約（我是簽約人的文件）＋我的簽名檔。
export default async function PortalDocsPage() {
  const client = await ensureClientUser();
  if (!client) redirect("/client/sign-in");
  await sweepExpired();
  const [list, saved] = await Promise.all([listMyInstances({ clientUserId: client.id }), getSignature({ kind: "client_user", id: client.id })]);
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <header className="border-b border-line bg-panel">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/portal" aria-label="回我的規劃"><BrandMark size={32} /></Link>
          <h1 className="font-bold">我的合約</h1>
          <Link href="/portal" className="ml-auto text-xs rounded-md border border-line2 px-2.5 py-1.5 text-tx2 hover:text-tx">回我的規劃</Link>
        </div>
      </header>
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <DocList list={list} me={{ clientUserId: client.id }} empty="目前沒有合約。教練發起簽約後會出現在這裡。" />
        <MySignature saved={saved} />
      </section>
    </main>
  );
}
