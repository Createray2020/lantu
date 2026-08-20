import Link from "next/link";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ensureCoach } from "@/lib/coach";
import { getBrand } from "@/lib/brand";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";
import { TABS } from "@/app/admin/system/spec";
import { questionsOf } from "@/lib/comp/survey";
import type { CompSettings } from "@/lib/comp/types";

export const dynamic = "force-dynamic";

// 制度說明書（唯讀）。
// 刻意用後台那份同一個 spec 渲染，而不是另外寫一份文案——
// 兩份文件遲早會不一致，而不一致的制度說明比沒有說明更糟。

function show(v: unknown, type: string): string {
  if (v === undefined || v === null || v === "") return "未設定";
  if (type === "bool") return v ? "是" : "否";
  if (type === "pct") return `${v}%`;
  if (type === "money") return `${Number(v).toLocaleString("zh-TW")} 元`;
  if (Array.isArray(v)) return v.join("、");
  if (typeof v === "number") return v.toLocaleString("zh-TW");
  return String(v);
}

export default async function HandbookPage() {
  const me = await ensureCoach();
  if (!me) redirect("/sign-in");
  if (me.status !== "active") redirect("/dashboard");

  const version = await ensureActiveVersion();
  const params = await loadParams(version.id);
  const s = params.settings as CompSettings;
  const brand = await getBrand();

  const card = "rounded-xl border border-white/10 bg-[#0d2b45] p-5";
  const th = "px-3 py-2 font-semibold text-xs text-[#a9bccf] text-left";
  const td = "px-3 py-2 border-t border-white/8";

  return (
    <main className="flex-1 bg-[#081a2b] text-[#eef2f7] min-h-screen">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#0d2b45]">
        {brand.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt="嵐途" className="h-7 w-auto max-w-[160px] object-contain" />
        )}
        <span className="font-serif text-lg tracking-[0.14em]">嵐途 LAN TU</span>
        <span className="text-[#a9bccf] text-xs">業務制度說明</span>
        <div className="flex-1" />
        <Link href="/admin/system/simulator" className="text-[#a9bccf] text-sm hover:text-white">分潤試算器</Link>
        <Link href="/dashboard/my-business" className="text-[#a9bccf] text-sm hover:text-white">我的業務</Link>
        <UserButton />
      </header>

      <section className="p-6 max-w-4xl space-y-4">
        <div>
          <h1 className="text-xl font-bold">業務制度說明</h1>
          <p className="text-sm text-[#a9bccf] mt-1">
            目前生效版本 <b className="text-[#e0bd8b]">{version.version}</b>
            {version.effectiveFrom && `（{生效日} ${version.effectiveFrom}）`.replace("{生效日}", "生效日")}。
            這一頁直接讀後台的制度設定，永遠與實際計算用的規則一致；
            標示「未設定」的項目代表該規則目前不啟用。
          </p>
        </div>

        {/* 服務模塊 */}
        <div className={card}>
          <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">服務模塊與分潤架構</h2>
          {(params.modules ?? []).length === 0 ? (
            <p className="text-xs text-[#6f869c]">尚未設定服務模塊。</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-[#12334f]">
                  <tr>
                    <th className={th}>服務</th><th className={th}>分潤模式</th>
                    <th className={th}>推廣端</th><th className={th}>執案端</th>
                    <th className={th}>定價</th><th className={th}>計入晉升</th>
                  </tr>
                </thead>
                <tbody>
                  {(params.modules ?? []).filter((m) => m.enabled !== false).map((m) => (
                    <tr key={m.code}>
                      <td className={td}>{m.name}</td>
                      <td className={td}>{m.splitMode === "flat" ? "固定比例" : "差％逐層"}</td>
                      <td className={td}>
                        {m.splitMode === "flat"
                          ? (m.flatPromoPct ?? "—") + "%"
                          : (m.splitPromoPct ?? s.splitPromoPct ?? "—") + "%"}
                      </td>
                      <td className={td}>
                        {m.splitMode === "flat"
                          ? (m.flatExecPct ?? "—") + "%"
                          : (m.splitExecPct ?? s.splitExecPct ?? "—") + "%"}
                      </td>
                      <td className={td}>{m.price == null ? "依實際收入" : m.price.toLocaleString("zh-TW")}</td>
                      <td className={td}>{m.countPromotion === false ? "否" : "是"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-[#6f869c] mt-2">
            公司營運保留 {100 - (s.splitPromoPct ?? 0) - (s.splitExecPct ?? 0)}%
            （營業稅 {s.taxPct ?? "—"}%、行政成本 {s.adminPct ?? "—"}%）。
          </p>
        </div>

        {/* 職級與分潤率 */}
        <div className={card}>
          <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">職級與分潤率</h2>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-[#12334f]">
                <tr>
                  <th className={th}>職級</th><th className={th}>代號</th>
                  <th className={th}>推廣端</th><th className={th}>執案端</th><th className={th}>合計</th>
                </tr>
              </thead>
              <tbody>
                {params.ranks.filter((r) => !(r.moduleCode ?? "")).map((r) => (
                  <tr key={r.code}>
                    <td className={td}>{r.groupName ?? ""}{r.tierLabel && r.tierLabel !== "—" ? r.tierLabel : ""}</td>
                    <td className={`${td} font-mono`}>{r.code}</td>
                    <td className={td}>{r.promoPct ?? "—"}%</td>
                    <td className={td}>{r.execPct ?? "—"}%</td>
                    <td className={td}>{(r.promoPct ?? 0) + (r.execPct ?? 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[#6f869c] mt-2">
            輔導鏈各層取「自身分潤率 − 下一層已計分潤率」的差額；平階時直屬主管自上層差％分得
            {s.peerBonusPct ?? "—"}%。詳細算法可在分潤試算器逐層展開查看。
          </p>
        </div>

        {/* 晉升門檻 */}
        <div className={card}>
          <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">晉升門檻</h2>
          {(["promotion_a", "promotion_b"] as const).map((kind) => {
            const rows = params.thresholds.filter((t) => t.kind === kind && t.enabled !== false);
            if (!rows.length) return null;
            return (
              <div key={kind} className="mb-3">
                <div className="text-xs text-[#a9bccf] mb-1">
                  {kind === "promotion_a" ? "A 軌（個人路徑）" : "B 軌（個人＋團隊路徑）"}
                </div>
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-[#12334f]">
                      <tr>
                        <th className={th}>晉升</th><th className={th}>個案數</th><th className={th}>顧問費</th>
                        {kind === "promotion_b" && <><th className={th}>團隊業績</th><th className={th}>育成</th></>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((t) => (
                        <tr key={t.toCode}>
                          <td className={td}>{t.fromCode} → {t.toCode}</td>
                          <td className={td}>{t.cases ?? "不檢查"}</td>
                          <td className={td}>{t.fees ? t.fees.toLocaleString("zh-TW") : "不檢查"}</td>
                          {kind === "promotion_b" && (
                            <>
                              <td className={td}>{t.teamCases ?? "不檢查"}</td>
                              <td className={td}>
                                {t.mentorCount ? `${t.mentorCount} 位 ${t.mentorRankCode ?? ""} 以上` : "—"}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-[#6f869c]">
            A、B 兩軌擇一達成即可晉升，於次月 {s.promoEffectiveDay ?? "—"} 日生效。
            個案以回饋問卷回收完成結案者始計入。
          </p>
        </div>

        {/* 真除 */}
        {params.thresholds.some((t) => t.kind === "tenure") && (
          <div className={card}>
            <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">同業招募與真除</h2>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-[#12334f]">
                  <tr>
                    <th className={th}>核定職級</th><th className={th}>期間個案數</th>
                    <th className={th}>期間顧問費</th><th className={th}>附加條件</th>
                  </tr>
                </thead>
                <tbody>
                  {params.thresholds.filter((t) => t.kind === "tenure").map((t) => (
                    <tr key={t.toCode}>
                      <td className={td}>{t.toCode}</td>
                      <td className={td}>{t.cases ?? "不檢查"}</td>
                      <td className={td}>{t.fees ? t.fees.toLocaleString("zh-TW") : "不檢查"}</td>
                      <td className={td}>{t.extraNote ?? (t.mentorCount ? `育成 ${t.mentorCount} 位` : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[#6f869c] mt-2">
              真除期間為到職日起 {s.tenureMonths ?? "—"} 個月；期滿未達核定職級門檻者，
              依實際完成度認階轉正{s.tenureFloorRankCode ? `，全未達標時以 ${s.tenureFloorRankCode} 聘任` : ""}。
            </p>
          </div>
        )}

        {/* 其餘條文（從 spec 直接渲染，加條文自動長出） */}
        {TABS.filter((t) => ["maintain", "case", "payout"].includes(t.id)).map((tab) => (
          <div key={tab.id} className={card}>
            <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">
              {tab.label}
              <span className="ml-2 text-xs font-normal text-[#6f869c]">辦法{tab.law}</span>
            </h2>
            {tab.sections.map((sec) => (
              <div key={sec.title} className="mb-3 last:mb-0">
                <div className="text-xs text-[#a9bccf] mb-1">{sec.title}</div>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {sec.fields.map((f) => (
                    <div key={f.key as string} className="flex justify-between gap-3 text-sm border-b border-white/5 py-1">
                      <dt className="text-[#cfdcea]">{f.label}</dt>
                      <dd className={
                        s[f.key] === undefined ? "text-[#6f869c]" : "text-[#e0bd8b] font-semibold"
                      }>
                        {show(s[f.key], f.type)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        ))}

        {/* 問卷 */}
        <div className={card}>
          <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">回饋問卷（結案要件）</h2>
          <ol className="list-decimal list-inside text-sm text-[#cfdcea] space-y-1">
            {questionsOf(s).map((q, i) => <li key={i}>{q}</li>)}
          </ol>
          <p className="text-xs text-[#6f869c] mt-2">
            客戶可於客戶端自行填寫；未回收的案件不計入晉升指標。
          </p>
        </div>

        <p className="text-xs text-[#6f869c]">
          本頁內容由後台制度設定即時產生。制度修訂不溯及已結案件之分潤。
        </p>
      </section>
    </main>
  );
}
