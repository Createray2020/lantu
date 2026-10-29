import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { currentSignIdentity } from "@/lib/docsIdentity";
import { getInstance, getSignature, getTemplate, getSignerProfile, profileMissing, usesPersonVars } from "@/lib/docsStore";
import { profileDraftOf } from "@/lib/signerProfileDraft";
import { canSignNow, isSigner, asksForRole, DOC_CSS, type DocAsk } from "@/lib/docs";
import { todayISO } from "@/lib/license";
import SignView, { type SignerLite } from "./SignView";
import BackLink from "@/components/BackLink";

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

  // 預存簽名檔跟著「這一列簽署人是哪種身分」走（同一個人可能既是教練列又是客戶列）
  const owner = mine?.coachId ? { kind: "coach" as const, id: mine.coachId } : mine?.clientUserId ? { kind: "client_user" as const, id: mine.clientUserId } : null;
  const saved = owner ? await getSignature(owner) : null;
  // 還沒被 sweepExpired 掃到的過期文件也不能簽（送出端 consentAndSign 會再擋一次）
  const expired = !!inst.expiresAt && inst.expiresAt < todayISO() && inst.status === "pending";
  const myTurn = !!mine && inst.status === "pending" && !expired && canSignNow(mine, inst.signers);
  // 本人確認項：依我這一列的 role 從範本取；簽名前逐項作答（server 端 consentAndSign 再驗一次）
  const tpl = mine && myTurn ? await getTemplate(inst.templateId) : null;
  const asks = mine && tpl ? asksForRole((tpl.asks as DocAsk[]) ?? [], mine.role) : [];
  // LT12：補簽文件用到本人簽約資料、而他還沒填齊 → 簽之前先補（還沒有人簽過才重產得了內容）
  const noneSigned = inst.signers.every((s) => s.status === "pending");
  const profileNeed = !!(mine && myTurn && tpl && mine.coachId && mine.role === "member" && inst.caseType === "coach_doc" && noneSigned && usesPersonVars(tpl.html));
  const myProf = profileNeed ? await getSignerProfile({ kind: "coach", id: mine!.coachId! }) : null;
  const profileGap = profileNeed ? profileMissing(myProf) : [];

  const signers: SignerLite[] = inst.signers.map((s) => ({
    id: s.id,
    role: s.role,
    seq: s.seq,
    label: s.label,
    displayName: s.displayName,
    status: s.status,
    signedAt: s.signedAt?.toISOString() ?? null,
    isMe: !!mine && s.id === mine.id,
    // LT03：拒簽原因存在 doc_signers.decline_reason，這一頁看得到的人（簽署人本人、同份文件其他簽署人、後台）都看得到
    declineReason: s.status === "declined" ? s.declineReason ?? null : null,
  }));
  // LT05：沒有站內上一頁時回哪一張清單——客戶回會員中心的文件、開通的教練回我的文件、申請人回首頁、後台唯讀回簽署總覽
  const backTo = mine?.clientUserId ? "/portal/docs" : mine?.coachId ? (me.coachStatus === "active" ? "/dashboard/docs" : "/dashboard") : me.admin ? "/admin/docs/instances" : "/";

  return (
    <main className="min-h-screen bg-canvas text-tx">
      <header className="sticky top-0 z-10 bg-panel/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <BackLink fallback={backTo} />
          <Link href="/" aria-label="回首頁" className="hidden sm:block"><BrandMark size={32} /></Link>
          <div className="min-w-0">
            <h1 className="font-bold truncate">{inst.title}</h1>
            <p className="text-11 text-tx3">版本 v{inst.version}・{inst.docNo ? `合約編號 ${inst.docNo}` : `文件編號 ${inst.id.slice(0, 8)}`}</p>
          </div>
          <Link href={`/sign/${inst.id}/print`} className="ml-auto text-sm rounded-md border border-line px-3 py-1.5 hover:bg-panel2">列印／PDF</Link>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-5 grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        <article className="rounded-lg border border-line bg-white text-black overflow-hidden">
          <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
          <div className="doc-body" dangerouslySetInnerHTML={{ __html: inst.signedHtml ?? inst.htmlSnapshot }} />
        </article>
        <SignView
          instanceId={inst.id}
          status={expired ? "expired" : inst.status}
          hash={inst.hash}
          expiresAt={inst.expiresAt}
          signers={signers}
          myTurn={myTurn}
          asks={asks}
          isMine={!!mine}
          saved={saved}
          admin={me.admin}
          profileGap={profileGap}
          profileDraft={profileGap.length ? profileDraftOf(myProf) : null}
        />
      </div>
    </main>
  );
}
