import { redirect } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach, isAdmin, listCoaches, coachWorkloads } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import OrgCell from "./OrgCell";
import StatusActions from "./StatusActions";
import RemoveCoach from "./RemoveCoach";
import AdminNav from "./AdminNav";
import LicenseCell from "./LicenseCell";
import CoachRoster, { type RosterRow } from "./CoachRoster";
import ReviewPanel from "./ReviewPanel";
import { getApplySettings, listApplications } from "@/lib/coachApplyStore";
import { rankCaps } from "@/lib/quota";
import { clientCapOf, licenseState, RANK_ORDER } from "@/lib/license";

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
  if (!me) redirect("/dashboard"); // 非教練/未登入 → 由 /dashboard 統一分流
  if (!(await isAdmin(me))) redirect("/dashboard");

  const coaches = await listCoaches();
  const pending = coaches.filter((c) => c.status === "pending").length;
  const brand = await getBrand();
  const peers = coaches.map((c) => ({ id: c.id, label: c.name || c.email || c.id }));
  // 名下客戶／分潤案件數：一次撈完（逐列查就是 N+1）。移除帳號的兩道門檻都看它。
  const workloads = await coachWorkloads();
  // 使用期限那一格要的兩樣：各級別的客戶上限（生效版本的職級表），以及可選的級別清單。
  const caps = await rankCaps();
  // 報聘申請表與全平台設定：檢核表要用，逐列查就是 N+1。
  const [applications, applySettings] = await Promise.all([listApplications(), getApplySettings()]);
  // 四個級別一律選得到：生效中的制度版本是加入「實習教練」之前建的，職級表裡沒有那一列，
  // 而「載入 V4 辦法數值」只在職級表完全空白時才帶入 —— 只讀 DB 的話實習教練永遠選不到。
  const rankCodes = [...RANK_ORDER, ...Object.keys(caps).filter((c) => !RANK_ORDER.includes(c as never))];
  // 接手候選人只列已開通的教練，且不能是自己。
  // 申請表單填的推薦人存的是 id，名冊要印得出名字。listCoaches() 本來就 select *，不必多查一次。
  const nameById = new Map(coaches.map((c) => [c.id, c.name || c.email || c.id]));
  const activePeers = coaches
    .filter((c) => c.status === "active")
    .map((c) => ({ id: c.id, label: c.name || c.email || c.id }));

  return (
    <main className="flex-1 bg-[#081a2b] text-[#eef2f7] min-h-screen">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#0d2b45]">
        <Link href="/home" className="flex items-center gap-3" title="回官網首頁">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="嵐途" className="h-7 w-auto max-w-[160px] object-contain" />
          )}
          <span className="font-serif text-lg tracking-[0.14em]">嵐途 LAN TU</span>
        </Link>
        <span className="text-[#a9bccf] text-xs">教練管理後台</span>
        <div className="flex-1" />
        <Link href="/dashboard" className="text-[#a9bccf] text-sm hover:text-white">
          ← 回系統
        </Link>
        <UserButton />
      </header>
      <AdminNav />

      <section className="p-6 max-w-4xl">

        <div className="flex items-center gap-4 mb-3">
          <h1 className="text-xl font-bold">教練帳號</h1>
        </div>

        {/* 半成品帳號（開通了卻沒定級／沒設期限）與快到期的，一律先彙總在頂端 ——
            這三件事只印在每一列的角落時，二十列以後就沒有人看得出來還剩幾個沒處理。 */}
        <CoachRoster
          total={coaches.length}
          pending={pending}
          colSpan={8}
          head={
            <thead>
              <tr className="bg-[#12334f] text-[#a9bccf] text-left">
                <th className="px-3 py-2 font-semibold">姓名 / Email</th>
                <th className="px-3 py-2 font-semibold">角色</th>
                <th className="px-3 py-2 font-semibold">狀態</th>
                <th className="px-3 py-2 font-semibold">組織（職級 / 上線）</th>
                <th className="px-3 py-2 font-semibold">級別 · 使用期限</th>
                <th className="px-3 py-2 font-semibold">申請日</th>
                <th className="px-3 py-2 font-semibold">開通日</th>
                <th className="px-3 py-2 font-semibold text-right">動作</th>
              </tr>
            </thead>
          }
          rows={coaches.map((c): RosterRow => {
                const s = STATUS[c.status] ?? { label: c.status, color: "#a9bccf" };
                const admin = c.role === "admin";
                const lic = licenseState({ licenseUntil: c.licenseUntil, status: c.status });
                const app = applications[c.id];
                return {
                  key: c.id,
                  unranked: !c.rankCode,
                  noLicense: !lic.managed,
                  expiring: lic.managed && !lic.expired && (lic.daysLeft ?? 999) <= 30,
                  node: (
                  <tr key={c.id} className="border-t border-white/8">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{c.name || "（未命名）"}</div>
                      {/* 教練可以自己改顯示名稱，所以名冊要同時秀出登入帳號的真名，
                          否則對帳號時分不出「雷立揚」是哪一位。相同就不重複印。 */}
                      {c.clerkName && c.clerkName !== c.name && (
                        <div className="text-[#6f869c] text-[11px]">登入姓名：{c.clerkName}</div>
                      )}
                      <div className="text-[#6f869c] text-xs">{c.email}</div>
                      {/* 教練編號：核准報聘時發，之後不變。待審帳號還沒有號。 */}
                      <div className="text-[11px] font-mono tracking-wider text-[#c99a5b]">
                        {c.code ?? "—"}
                      </div>
                      {/* 申請表單填的手機／現職（存在 note）與推薦人。核准前就是靠這幾行判斷，
                          印在這裡才不用為了看一行字點進別的頁。 */}
                      {c.note && <div className="text-[#8fa8bd] text-[11px] mt-1 whitespace-pre-wrap">{c.note}</div>}
                      {c.sponsorId && (
                        <div className="text-[#6f869c] text-[11px]">介紹人：{nameById.get(c.sponsorId) ?? c.sponsorId}</div>
                      )}
                      {/* 2026/08/31 起申請自述住 coach_applications；舊帳號沒有這一列，只印上面那行 note。 */}
                      {app && (
                        <ReviewPanel
                          id={c.id}
                          status={c.status}
                          settings={applySettings}
                          app={{
                            route: app.route,
                            introducerName: app.introducerName,
                            introducerCode: app.introducerCode,
                            introducerState: app.introducerState,
                            introducerNote: app.introducerNote,
                            phone: app.phone,
                            currentJob: app.currentJob,
                            motive: app.motive,
                            experience: app.experience,
                            licenses: app.licenses ?? [],
                            consents: app.consents ?? {},
                            reviewChecks: app.reviewChecks ?? {},
                            reviewNote: app.reviewNote,
                          }}
                        />
                      )}
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
                    <td className="px-3 py-2">
                      <OrgCell
                        id={c.id}
                        orgRank={c.orgRank}
                        uplineId={c.uplineId}
                        peers={peers}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <LicenseCell
                        id={c.id}
                        rankCode={c.rankCode}
                        licenseFrom={c.licenseFrom}
                        licenseUntil={c.licenseUntil}
                        licenseUnit={c.licenseUnit}
                        licenseQty={c.licenseQty}
                        clientCapOverride={c.clientCapOverride}
                        status={c.status}
                        rankCodes={rankCodes}
                        capFromRank={clientCapOf({ rankCode: c.rankCode }, caps)}
                        usedClients={workloads[c.id]?.clients ?? 0}
                      />
                    </td>
                    <td className="px-3 py-2 text-[#a9bccf]">{fmtDate(c.createdAt)}</td>
                    <td className="px-3 py-2 text-[#a9bccf]">{fmtDate(c.approvedAt)}</td>
                    <td className="px-3 py-2">
                      {c.id === me.id ? (
                        // 只擋「對自己動手」，避免把自己鎖在門外。
                        // 舊版是所有 admin 都不給操作 → 一旦某人成為 admin 就再也停不了權。
                        <span className="text-[#6f869c] text-xs block text-right">本人</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <StatusActions id={c.id} status={c.status} />
                          <RemoveCoach
                            id={c.id}
                            name={c.name || c.email || c.id}
                            clientCount={workloads[c.id]?.clients ?? 0}
                            caseCount={workloads[c.id]?.cases ?? 0}
                            candidates={activePeers.filter((p) => p.id !== c.id)}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                  ),
                };
              })}
        />

        <p className="mt-4 text-xs text-[#6f869c]">
          運作方式：教練用 Google／Email 註冊後為「待審核」，無法進入系統；你在此按「核准開通」（確認收款後）即可啟用。停權可隨時收回存取，且不動任何資料 —— 離職請用停權。
          「移除帳號」只給誤建的空帳號用：名下還有客戶要先轉移給接手教練，有過分潤案件的一律不可移除。
          <br />
          使用期限：實習教練固定半年，其餘級別可按月或年開通。到期未延長會變成<b className="text-[#e0bd8b]">唯讀</b>——
          仍可登入檢視所有客戶與規劃，但不能新增或修改，延長後立即恢復。沒有設定期限的帳號不受限制。
          客戶數上限依級別（實習與 C1–C3 為 20 位、S1–S2 為 50 位、S3 與首席為 100 位），封存的客戶不計入。
        </p>
      </section>
    </main>
  );
}
