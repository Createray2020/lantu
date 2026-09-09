import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { getVisitor, listLoginEvents } from "@/lib/visitors";
import AdminHeader from "../../AdminHeader";
import AdminNav from "../../AdminNav";

export const dynamic = "force-dynamic";

const APPLY_LABEL: Record<string, string> = {
  none: "未申請",
  introducer: "待推薦人確認",
  review: "待後台審核",
  active: "已開通教練",
  suspended: "教練已停權",
};

function fmt(d: Date | null) {
  if (!d) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 單一訪客的完整登入歷史。Ray 2026/09/09：全部保留、不設保存期限（要做訪客分析）。
export default async function VisitorDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await ensureCoach();
  if (!me) redirect("/dashboard");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const visitor = await getVisitor(id);
  if (!visitor) notFound();
  const events = await listLoginEvents(id);

  return (
    <main className="flex-1 bg-canvas text-tx min-h-screen">
      <AdminHeader label="訪客明細" />
      <AdminNav />

      <section className="max-w-3xl mx-auto px-5 py-6">
        <Link href="/admin/visitors" className="text-sm text-tx2 hover:text-tx underline underline-offset-4">
          ← 回訪客記錄
        </Link>

        <h1 className="text-xl font-bold mt-3">{visitor.name || "（未填姓名）"}</h1>
        <div className="text-sm text-tx2">{visitor.email || "—"}</div>

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
          <Cell label="註冊時間" value={fmt(visitor.createdAt)} />
          <Cell label="最後登入" value={visitor.lastLoginAt ? fmt(visitor.lastLoginAt) : "無紀錄"} />
          <Cell label="登入次數" value={visitor.loginCount > 0 ? String(visitor.loginCount) : "—"} />
          <Cell label="客戶編號" value={visitor.clientCode || "—"} />
          <Cell
            label="人生護照"
            value={visitor.passport.saved ? `已存檔（${fmt(visitor.passport.updatedAt)}）` : "未建立"}
          />
          <Cell
            label="指定教練"
            value={
              visitor.coach.state === "linked" ? `已掛上 · ${visitor.coach.name ?? "—"}`
                : visitor.coach.state === "pending" ? `申請中 · ${visitor.coach.name ?? "—"}`
                : "未指定"
            }
          />
          <Cell label="申請成為教練" value={APPLY_LABEL[visitor.apply.state] ?? "—"} />
          <Cell label="帳號狀態" value={visitor.status === "active" ? "正常" : "已停權"} />
        </dl>

        <h2 className="text-base font-bold mt-6 mb-2">
          登入歷史 <span className="text-sm font-normal text-tx2">共 {events.length} 次</span>
        </h2>
        {/* ⚠️ 這裡刻意不做「保留 N 天」：Ray 要完整資料做訪客分析。
            列數多到一頁放不下時再加分頁，不要改成清理。 */}
        {events.length === 0 ? (
          <p className="text-sm text-tx3 border border-line rounded-xl px-4 py-6 text-center">
            還沒有登入紀錄。這個欄位是 2026/09/09 才加的，在那之前的登入沒有留下資料。
          </p>
        ) : (
          <div className="tbl-wrap rounded-xl border border-line">
            <table className="w-full text-sm tbl-sticky">
              <thead>
                <tr className="bg-panel2 text-tx2 text-left text-xs">
                  <th className="px-3 py-2 font-semibold w-12 text-right">#</th>
                  <th className="px-3 py-2 font-semibold">登入時間</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="px-3 py-2 text-right tabular-nums text-tx3">{events.length - i}</td>
                    <td className="px-3 py-2 text-tx2">{fmt(e.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
      <dt className="text-11 text-tx3">{label}</dt>
      <dd className="text-sm font-semibold mt-0.5">{value}</dd>
    </div>
  );
}
