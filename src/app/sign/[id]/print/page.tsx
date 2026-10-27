import { notFound, redirect } from "next/navigation";
import { currentSignIdentity } from "@/lib/docsIdentity";
import { getInstance } from "@/lib/docsStore";
import { DOC_CSS, isSigner } from "@/lib/docs";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

// 分頁標題＝文件名（列印／存 PDF 的預設檔名就是它）；root layout 的 <title> 由 metadata 覆寫，不能在 body 再放一個。
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inst = await getInstance(id);
  return { title: inst ? inst.title : "文件" };
}

// 列印版：只有文件本體＋列印鈕。瀏覽器「列印 → 儲存為 PDF」就是正式 PDF；
// 雙方印出來的是同一份快照（同一個 hash），系統不另存一份 PDF 檔。
export default async function SignPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await currentSignIdentity();
  if (!me) redirect(`/login?redirect_url=/sign/${id}/print`);
  const inst = await getInstance(id);
  if (!inst) notFound();
  const allowed = me.admin || inst.signers.some((s) => isSigner(s, me));
  if (!allowed) notFound();
  const fp = inst.finalHash ?? inst.hash;
  const css = DOC_CSS + "\n.pw{min-height:100vh;background:#eee;color:#111}.bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:8px 16px;display:flex;gap:12px;align-items:center;font:13px system-ui;color:#111}.sheet{background:#fff;margin:16px auto;max-width:800px;box-shadow:0 1px 6px rgba(0,0,0,.12)}.fp{font:11px ui-monospace,monospace;color:#777;padding:10px 36px 18px;word-break:break-all}@media print{.bar{display:none}.sheet{margin:0;box-shadow:none;max-width:none}.pw{background:#fff}}";
  return (
    <div className="pw">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="bar">
        <strong>{inst.title}</strong>
        <span style={{ color: "#777" }}>v{inst.version}・{inst.status === "completed" ? "已完成簽署" : "尚未完成簽署"}</span>
        <PrintButton />
      </div>
      <div className="sheet">
        <div className="doc-body" dangerouslySetInnerHTML={{ __html: inst.signedHtml ?? inst.htmlSnapshot }} />
        <div className="fp">文件識別碼 {inst.id}・SHA-256 {fp}</div>
      </div>
    </div>
  );
}
