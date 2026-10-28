import { redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import AdminHeader from "../../AdminHeader";
import AdminNav from "../../AdminNav";
import { getCasePerms } from "@/lib/casePerms";
import { permissionMatrix } from "@/lib/caseScope";
import PermSwitches from "./PermSwitches";

export const dynamic = "force-dynamic";

// 後台「客戶服務 › 權限」：上半是權限矩陣（照現況程式與開關產生，不是另外手寫一份），下半是五個開關。
// 整張矩陣不開放逐格編——改錯一格就是客戶財務資料外洩，那不該是後台點兩下的事。
export default async function CasePermissionsPage() {
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");
  const perms = await getCasePerms();
  const rows = permissionMatrix(perms);
  const COLS: { k: keyof (typeof rows)[number]["cells"]; label: string }[] = [
    { k: "client", label: "客戶" }, { k: "coach", label: "財務教練" }, { k: "s3", label: "S3" }, { k: "relations", label: "客戶關係" }, { k: "finance", label: "行政財法" }, { k: "admin", label: "系統管理" },
  ];
  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="客戶服務 · 權限" />
      <AdminNav />
      <section className="max-w-5xl mx-auto px-5 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold">案件進度 · 誰能看、誰能改</h1>
          <p className="text-sm text-tx2 mt-1 leading-relaxed">
            原則「最小必要」：每個角色只看得到完成工作所需的資料，變更一律留下紀錄。<b className="text-brand2">系統管理（核心成員／管理員）永遠看得到全部。</b>
            下表依目前的開關即時產生；角色誰擔任，到「教練帳號」名冊勾「客戶關係／行政財法」，S3 看組織樹的推薦人子樹。
          </p>
        </div>
        <div className="rounded-xl border border-line bg-panel overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="text-11 uppercase tracking-wider text-tx3">
              <tr className="text-left"><th className="px-3 py-2 font-normal">資料</th>{COLS.map((c) => <th key={c.k} className="px-3 py-2 font-normal">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row} className="border-t border-line">
                  <td className="px-3 py-2 font-bold whitespace-nowrap">{r.row}</td>
                  {COLS.map((c) => { const v = String(r.cells[c.k]); return <td key={c.k} className={`px-3 py-2 ${v === "—" ? "text-tx3" : v.startsWith("改") ? "text-brand2" : "text-tx2"}`}>{v}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-10 text-tx3 border-t border-line">改＝可看可修改；看＝僅可查看；—＝不可見。「自己」指自己的案件，「所屬」指 S3 帶的教練的案件。</p>
        </div>
        <PermSwitches perms={perms} />
      </section>
    </main>
  );
}
