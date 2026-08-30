import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ensureCoach } from "@/lib/coach";
import { getTemplateForRead } from "@/lib/templates";
import { DEFAULT_UI_SCALE } from "@/lib/uiScale";
import TemplateFrame from "@/components/TemplateFrame";

export const dynamic = "force-dynamic";

const NOTE =
  "示範範本（唯讀）：這不是任何一位真實客戶，全公司教練看到的都是同一份，你的修改不會被儲存。" +
  "想拿它當起點做試算，請回上一頁按「複製一份給自己」。";

/**
 * 教練端開一份共用範本來翻給客戶看。
 *
 * 唯讀是**結構上的**，不是靠介面自律：TemplateFrame 不傳 save，而範本的
 * coach_id 是 null，教練端所有寫入路徑（ownedClient()）本來就打不到它。
 */
export default async function TemplateViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { id } = await params;
  const { plan: wanted } = await searchParams;

  // 分流與其他 /dashboard 頁面一致：非教練／未開通一律丟回 /dashboard，
  // 不要在這裡自己畫一個「你沒有權限」的死路。
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (me.status !== "active") redirect("/dashboard");

  const tpl = await getTemplateForRead(id);
  if (!tpl) notFound();
  if (tpl.plans.length === 0) notFound();

  // getTemplateForRead 已按 year desc 排；預設開最新的那一版。
  const plan = (wanted ? tpl.plans.find((p) => p.id === wanted) : null) ?? tpl.plans[0];

  const subtitle =
    tpl.plans.length > 1 ? (
      <span className="flex items-center gap-1.5">
        {tpl.plans.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/templates/${id}?plan=${p.id}`}
            className={
              "text-[11px] rounded px-1.5 py-0.5 border " +
              (p.id === plan.id
                ? "border-[#c99a5b] text-[#e0bd8b] bg-[#c99a5b]/10 font-bold"
                : "border-white/15 text-[#a9bccf] hover:bg-[#17406a]")
            }
          >
            {p.year}
          </Link>
        ))}
      </span>
    ) : (
      plan.label
    );

  return (
    <TemplateFrame
      title={`${tpl.client.name}${tpl.client.templateLabel ? ` · ${tpl.client.templateLabel}` : ""}`}
      subtitle={subtitle}
      backHref="/dashboard/clients"
      backLabel="返回客戶"
      data={plan.data}
      uiScale={me.uiScale ?? DEFAULT_UI_SCALE}
      note={NOTE}
    />
  );
}
