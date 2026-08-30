import { notFound, redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getTemplateForRead } from "@/lib/templates";
import { DEFAULT_UI_SCALE } from "@/lib/uiScale";
import TemplateFrame from "@/components/TemplateFrame";
import { saveTemplatePlanAction } from "../../../actions";

export const dynamic = "force-dynamic";

// 後台填範本內容：全螢幕載入 v12 App（embed 模式），寫回走 updateTemplatePlan()。
//
// ⚠️ planId 必須是「這一份範本底下的」才給編。少了下面那道 find()，
//    /admin/templates/<甲範本>/plans/<乙範本的 planId> 會編到別份範本，
//    而網址列上寫的是甲——編完存好，然後怎麼找都找不到自己剛剛改的東西。
//    （真正的安全底線在 updateTemplatePlan() 的 WHERE is_template，這裡防的是「編錯份」。）
export default async function TemplatePlanEditPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id, planId } = await params;
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const tpl = await getTemplateForRead(id);
  if (!tpl) notFound();
  const plan = tpl.plans.find((p) => p.id === planId);
  if (!plan) notFound();

  return (
    <TemplateFrame
      title={`${tpl.client.name} · ${plan.year} 年度版本`}
      subtitle={plan.label}
      backHref={`/admin/templates/${id}`}
      backLabel="返回範本"
      data={plan.data}
      uiScale={me.uiScale ?? DEFAULT_UI_SCALE}
      note="你正在編輯全公司教練共用的示範範本。存檔後，所有教練下次打開看到的就是這一份。"
      save={saveTemplatePlanAction.bind(null, planId)}
    />
  );
}
