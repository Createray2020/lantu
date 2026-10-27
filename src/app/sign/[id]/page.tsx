import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { currentSignIdentity } from "@/lib/docsIdentity";
import { getInstance, getSignature } from "@/lib/docsStore";
import { canSignNow, isSigner, DOC_CSS } from "@/lib/docs";
import SignView, { type SignerLite } from "./SignView";

export const dynamic = "force-dynamic";

// 簽署頁（2026/10/28 電子簽署）。教練端、客戶 portal、申請人三邊共用這一頁，入口各自放。
// 看得到：這份文件的簽署人、後台管理員（唯讀）。簽得了：輪到的那一位本人。
export default async function SignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentSignIdentity();
  if (!me) redirect(`/login?redirect_url=/sign/${id}`);
  const inst = await getInstance(id);
  if (!inst) notFound();

  const mine = inst.signers.find((s) => isSigner(s, me)) ?? null;
  if (!mine && !me.admin) {
    return (
      <main className="flex-1 grid place-items-center bg-canvas text-tx px-6 py-12">
        <div className="max-w-md text-center">
          <BrandMark size={48} className="mx-auto mb-4" />
          <h1 className="text-lg font-bold mb-2">這份文件不是給你簽的</h1>
          <p className="text-sm text-tx2">如果你應該是簽署人，請用當初收到連結的那個帳號登入。</p>
        </div>
      </main>
    );
  }

  const owner = me.coachId ? { kind: "coach" as const, id: me.coachId } : me.clientUserId ? { kind: "client_user" as const, id: me.clientUserId } : null;
  const saved = owner ? await getSignature(owner) : null;
  const myTurn = !!mine && inst.status === "pending" && canSignNow(mine, inst.signers);

  const signers: SignerLite[] = inst.signers.map((s) => ({
    id: s.id,
    role: s.role,
    seq: s.seq,
    label: s.label,
    displayName: s.displayName,
    status: s.status,
    signedAt: s.signedAt?.toISOString() ?? null,
    isMe: !!mine && s.id === mine.id,
  }));

  return (
    <main className="min-h-screen bg-canvas text-tx">
      <header className="sticky top-0 z-10 bg-panel/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" aria-label="回首頁"><BrandMark size={32} /></Link>
          <div className="min-w-0">
            <h1 className="font-bold truncate">{inst.title}</h1>
            <p className="text-11 text-tx3">版本 v{inst.version}・文件編號 {inst.id.slice(0, 8)}</p>
          </div>
          <Link href={`/sign/${inst.id}/print`} className="ml-auto text-sm rounded-md border border-line px-3 py-1.5 hover:bg-panel2">列印／PDF</Link>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-5 grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        <article className="rounded-lg border border-line bg-white text-black overflow-hidden">
          <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
          <div className="doc-body" dangerouslySetInnerHTML={{ __html: inst.htmlSnapshot }} />
        </article>
        <SignView
          instanceId={inst.id}
          status={inst.status}
          hash={inst.hash}
          expiresAt={inst.expiresAt}
          signers={signers}
          myTurn={myTurn}
          isMine={!!mine}
          saved={saved}
          admin={me.admin}
        />
      </div>
    </main>
  );
}
