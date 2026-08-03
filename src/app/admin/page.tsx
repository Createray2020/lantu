import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin, listCoaches } from "@/lib/coach";
import { approveCoach, suspendCoach, resetCoach } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "待審核", color: "#c99a5b" },
  active: { label: "已開通", color: "#6f8f74" },
  suspended: { label: "已停權", color: "#b05a4a" },
};

function fmtDate(d: Date | null) {
  if (!d) return "—";
  const x = new Date(d);
  return `${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}`;
}

export default async function Admin() {
  const me = await ensureCoach();
  if (!me) redirect("/sign-in");
  if (!(await isAdmin(me))) redirect("/dashboard");

  const coaches = await listCoaches();
  const pending = coaches.filter((c) => c.status === "pending").length;

  return (
    <main className="flex-1 bg-[#081a2b] text-[#eef2f7] min-h-screen">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#0d2b45]">
        <span className="font-serif text-lg tracking-[0.14em]">嵐途 LAN TU</span>
        <span className="text-[#a9bccf] text-xs">教練管理後台</span>
        <div className="flex-1" />
        <Link href="/dashboard" className="text-[#a9bccf] text-sm hover:text-white">
          ← 回系統
        </Link>
        <UserButton />
      </header>

      <section className="p-6 max-w-4xl">
        <div className="flex items-center gap-4 mb-5">
          <h1 className="text-xl font-bold">教練帳號</h1>
          <span className="text-sm text-[#a9bccf]">
            共 {coaches.length} 位 · 待審核 <b className="text-[#e0bd8b]">{pending}</b> 位
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#12334f] text-[#a9bccf] text-left">
                <th className="px-3 py-2 font-semibold">姓名 / Email</th>
                <th className="px-3 py-2 font-semibold">角色</th>
                <th className="px-3 py-2 font-semibold">狀態</th>
                <th className="px-3 py-2 font-semibold">申請日</th>
                <th className="px-3 py-2 font-semibold">開通日</th>
                <th className="px-3 py-2 font-semibold text-right">動作</th>
              </tr>
            </thead>
            <tbody>
              {coaches.map((c) => {
                const s = STATUS[c.status] ?? { label: c.status, color: "#a9bccf" };
                const admin = c.role === "admin";
                return (
                  <tr key={c.id} className="border-t border-white/8">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{c.name || "（未命名）"}</div>
                      <div className="text-[#6f869c] text-xs">{c.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={admin ? "text-[#e0bd8b] font-bold" : "text-[#a9bccf]"}>
                        {admin ? "管理員" : "教練"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded-md text-xs font-bold"
                        style={{ background: s.color + "22", color: s.color }}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#a9bccf]">{fmtDate(c.createdAt)}</td>
                    <td className="px-3 py-2 text-[#a9bccf]">{fmtDate(c.approvedAt)}</td>
                    <td className="px-3 py-2">
                      {admin ? (
                        <span className="text-[#6f869c] text-xs block text-right">—</span>
                      ) : (
                        <div className="flex gap-2 justify-end">
                          {c.status !== "active" && (
                            <form action={approveCoach.bind(null, c.id)}>
                              <button className="rounded-md bg-[#6f8f74] text-[#08202a] font-bold px-3 py-1.5 text-xs">
                                核准開通
                              </button>
                            </form>
                          )}
                          {c.status === "active" && (
                            <form action={suspendCoach.bind(null, c.id)}>
                              <button className="rounded-md bg-[#b05a4a] text-white font-bold px-3 py-1.5 text-xs">
                                停權
                              </button>
                            </form>
                          )}
                          {c.status === "suspended" && (
                            <form action={resetCoach.bind(null, c.id)}>
                              <button className="rounded-md border border-white/20 text-[#a9bccf] px-3 py-1.5 text-xs">
                                重設待審
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {coaches.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[#6f869c]">
                    尚無教練註冊。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-[#6f869c]">
          運作方式：教練用 Google／Email 註冊後為「待審核」，無法進入系統；你在此按「核准開通」（確認收款後）即可啟用。停權可隨時收回存取。
        </p>
      </section>
    </main>
  );
}
