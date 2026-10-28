import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getAcctState } from "@/lib/acctStore";
import { getDocSeal, listSets, listTemplates, latestByKey, getDocSettings } from "@/lib/docsStore";
import AdminHeader from "../AdminHeader";
import AdminNav from "../AdminNav";
import DocsAdminBoard, { type TemplateLite, type ItemLite } from "./DocsAdminBoard";

export const dynamic = "force-dynamic";

// 電子簽署後台：公司印鑑、文件範本（版本化）、範本組合（哪個方案要簽哪幾份）。
// 2026/10/28 Ray 定案：自建內部點點簽；範本更新＝新版本，已發出的文件不動。
export default async function DocsAdminPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const [all, sets, seal, acct, settings] = await Promise.all([listTemplates(), listSets(), getDocSeal(), getAcctState(), getDocSettings()]);
  const latest = latestByKey(all);
  const versions: Record<string, number> = {};
  for (const t of all) versions[t.key] = Math.max(versions[t.key] ?? 0, t.version);

  const templates: TemplateLite[] = latest.map((t) => ({
    id: t.id,
    key: t.key,
    version: t.version,
    versions: versions[t.key] ?? t.version,
    category: t.category as TemplateLite["category"],
    name: t.name,
    html: t.html,
    useSeal: t.useSeal,
    required: t.required,
    signDays: t.signDays,
    signers: t.signers,
    asks: t.asks ?? [],
    itemIds: t.itemIds ?? [],
    enabled: t.enabled,
    note: t.note,
    createdAt: t.createdAt.toISOString(),
  }));
  const items: ItemLite[] = acct.items.map((i) => ({ id: i.id, name: i.name, price: i.price, cat: i.cat ?? "" }));
  const setMap: Record<string, string[]> = {};
  for (const s of sets) setMap[`${s.kind}:${s.ref}`] = s.templateKeys;

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="電子簽署" />
      <AdminNav />
      <section className="max-w-5xl mx-auto px-5 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold">電子簽署 · 印鑑、文件範本與組合</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            範本改了內容會存成<b className="text-brand2">新版本</b>，已經發出去的文件不會跟著變；
            「組合」決定某個方案啟動簽署時要產哪幾份。簽署人分類（公司／成員／客戶／教練）與順序在每份範本裡設。
          </p>
        </div>
        <DocsAdminBoard templates={templates} items={items} sets={setMap} seal={seal.img} nudgeDays={settings.nudgeDays} />
      </section>
    </main>
  );
}
