import { notFound, redirect } from "next/navigation";
import { currentSignIdentity } from "@/lib/docsIdentity";
import { getInstance } from "@/lib/docsStore";
import { DOC_CSS, isSigner } from "@/lib/docs";
import PrintButton from "./PrintButton";
import BackLink from "@/components/BackLink";

export const dynamic = "force-dynamic";

// 分頁標題＝文件名（列印／存 PDF 的預設檔名就是它）；root layout 的 <title> 由 metadata 覆寫，不能在 body 再放一個。
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inst = await getInstance(id);
  return { title: inst ? `${inst.docNo ? `${inst.docNo}_` : ""}${inst.title}` : "文件" };
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
  // LT11（2026/10/29 Ray）：列印頁是要往外傳的，底部「文件識別碼＋SHA-256」不再印；識別碼與雜湊只留在系統內部做追溯。
  const css = DOC_CSS + "\n.pw{min-height:100vh;background:#eee;color:#111}.bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:8px 16px;display:flex;gap:12px;align-items:center;font:13px system-ui;color:#111}.sheet{background:#fff;margin:16px auto;max-width:800px;box-shadow:0 1px 6px rgba(0,0,0,.12)}.pbk{font:13px system-ui;color:#111;text-decoration:none;border:1px solid #999;border-radius:6px;padding:5px 10px;background:#fff}@media print{.bar{display:none}.sheet{margin:0;box-shadow:none;max-width:none}.pw{background:#fff}}"
    // LT06（2026/10/29）：上下那排日期／檔名／網址是瀏覽器自己印在頁緣的「頁首及頁尾」。頁緣歸零它就沒地方印；
    // 邊距改由文件本體出，box-decoration-break:clone 讓每一頁都補上下邊距（不只第一頁的頭、最後一頁的尾）。
    + "\n@page{size:A4;margin:0}@media print{.doc-body{padding:16mm 18mm !important;-webkit-box-decoration-break:clone;box-decoration-break:clone}}";
  return (
    <div className="pw">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="bar">
        {/* LT05 補充（2026/10/29）：列印頁回到同一份文件；這一列 @media print 時隱藏，不會印出來 */}
        <BackLink fallback={`/sign/${inst.id}`} className="pbk" />
        <strong>{inst.title}</strong>
        <span style={{ color: "#777" }}>v{inst.version}・{inst.status === "completed" ? "已完成簽署" : "尚未完成簽署"}</span>
        <span style={{ color: "#777", fontSize: 12 }}>若印出來上下還有日期或網址：列印視窗「更多設定」取消勾選「頁首及頁尾」</span>
        <PrintButton />
      </div>
      <div className="sheet">
        <div className="doc-body" dangerouslySetInnerHTML={{ __html: inst.signedHtml ?? inst.htmlSnapshot }} />
      </div>
    </div>
  );
}
