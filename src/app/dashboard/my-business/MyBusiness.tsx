"use client";

// 顧問自己看的那一面。制度要有效，關鍵是每位顧問隨時知道：
// 我在哪、還差多少、這個月領多少、資格有沒有問題。
// 把制度翻成行動語言（「團隊再完成 14 案即可晉升」）比列一堆數字有用。

import { Fragment, useState } from "react";

export type GapView = { label: string; need: number; have: number; met: boolean };
export type TrackView = { toCode: string; gaps: GapView[]; met: boolean } | null;

export type MyView = {
  name: string;
  rankCode: string | null;
  rankLabel: string;
  promoPct: number | null;
  execPct: number | null;
  tenureRankCode: string | null;
  tenureUntil: string | null;
  tenureSettledCode: string | null;
  tenureNote: string | null;
  pendingAmount: number;
  payoutDay: number | null;
  stats: { personalCases: number; personalFees: number; teamCases: number };
  trackA: TrackView;
  trackB: TrackView;
  blocked?: string;
  maintenance: {
    execCases: number; execPass: boolean; trainHours: number; trainPass: boolean;
    pass: boolean; exempt: boolean; exemptReason: string | null;
    needCases: number | null; needHours: number | null;
  };
  canRecruit: boolean;
  canReceiveLeads: boolean;
  /** 距離年度結束剩幾天（用來決定提醒的語氣強度） */
  daysLeftInYear: number;
  payouts: { id: string; period: string; clientName: string; role: string; totalPct: number; amount: number; status: string; trace: string[] }[];
  team: { id: string; name: string; rankCode: string | null; yearCases: number }[];
  events: { id: string; fromCode: string | null; toCode: string | null; reason: string; effectiveAt: string | null; note: string | null }[];
  versionLabel: string;
};

const REASON: Record<string, string> = {
  auto_a: "A 軌自動晉升", auto_b: "B 軌自動晉升", tenure: "真除轉正",
  manual: "人工調整", refund: "退費扣回",
};

/** 把兩軌進度翻成一句話：哪一軌比較近、還差什麼。 */
function advice(v: MyView): string | null {
  const tracks = [
    { name: "A 軌", t: v.trackA },
    { name: "B 軌", t: v.trackB },
  ].filter((x) => x.t && x.t.gaps.length) as { name: string; t: NonNullable<TrackView> }[];
  if (!tracks.length) return null;
  if (tracks.some((x) => x.t.met)) {
    const w = tracks.find((x) => x.t.met)!;
    return `${w.name}已達標，將於下一個生效日晉升 ${w.t.toCode}。`;
  }
  // 「比較近」＝所有未達項目中最大缺口佔比最小的那一軌。
  const score = (t: NonNullable<TrackView>) =>
    Math.max(...t.gaps.map((g) => (g.need > 0 ? Math.min(1, g.have / g.need) : 1)).map((r) => 1 - r));
  const best = tracks.reduce((a, b) => (score(a.t) <= score(b.t) ? a : b));
  const worst = best.t.gaps.filter((g) => !g.met).sort((x, y) => (y.need - y.have) - (x.need - x.have))[0];
  if (!worst) return null;
  const left = worst.need - worst.have;
  return `你目前 ${best.name} 較接近，${worst.label}再 ${left.toLocaleString()} 即可晉升 ${best.t.toCode}。`;
}

export default function MyBusiness({ v }: { v: MyView }) {
  const [open, setOpen] = useState<string | null>(null);
  const tip = advice(v);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-bold">我的業務</h1>
        <span className="text-xs text-[#6f869c]">制度版本 {v.versionLabel}</span>
      </div>

      <MaintenanceNotice v={v} />

      {/* 頂部三塊 */}
      <div className="grid gap-3 md:grid-cols-3">
        <Tile title="我的職級">
          <div className="text-2xl font-bold text-[#e0bd8b]">{v.rankCode ?? "未設定"}</div>
          <div className="text-xs text-[#a9bccf] mt-0.5">
            {v.rankLabel}
            {v.promoPct !== null && v.execPct !== null && (
              <> · 推廣端 {v.promoPct}%／執案端 {v.execPct}%</>
            )}
          </div>
          {v.tenureRankCode && (
            <div className="text-xs text-[#c99a5b] mt-1">
              真除中（核定 {v.tenureRankCode}，至 {v.tenureUntil ?? "—"}）
            </div>
          )}
        </Tile>
        <Tile title="待發放分潤">
          <div className="text-2xl font-bold tabular-nums">{v.pendingAmount.toLocaleString()}</div>
          <div className="text-xs text-[#a9bccf] mt-0.5">
            {v.payoutDay ? `每月 ${v.payoutDay} 日發放` : "發放日未設定"} · 共 {v.payouts.filter((p) => p.status !== "paid").length} 筆
          </div>
        </Tile>
        <Tile title="維持資格">
          {v.maintenance.exempt ? (
            <>
              <div className="text-2xl font-bold text-[#7fb894]">豁免</div>
              <div className="text-xs text-[#a9bccf] mt-0.5">{v.maintenance.exemptReason}</div>
            </>
          ) : (
            <>
              <div className={`text-2xl font-bold ${v.maintenance.pass ? "text-[#7fb894]" : "text-[#c99a5b]"}`}>
                {v.maintenance.pass ? "已達成" : "尚未達成"}
              </div>
              <div className="text-xs text-[#a9bccf] mt-0.5">
                執案 {v.maintenance.execCases}
                {v.maintenance.needCases !== null && `/${v.maintenance.needCases}`} 案
                {v.maintenance.execPass && " ✓"}
                {" · 訓練 "}
                {v.maintenance.trainHours}
                {v.maintenance.needHours !== null && `/${v.maintenance.needHours}`}h
                {v.maintenance.trainPass && " ✓"}
              </div>
            </>
          )}
          {(!v.canRecruit || !v.canReceiveLeads) && (
            <div className="text-xs text-[#e08b7a] mt-1">
              目前{!v.canRecruit && "暫停招募"}{!v.canRecruit && !v.canReceiveLeads && "、"}
              {!v.canReceiveLeads && "暫停受派"}（職級不受影響，既有團隊分潤照領）
            </div>
          )}
        </Tile>
      </div>

      {/* 晉升進度 */}
      <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
        <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-1">晉升進度</h2>
        {v.blocked ? (
          <p className="text-xs text-[#a9bccf] mt-2">{v.blocked}</p>
        ) : (
          <>
            <p className="text-xs text-[#7f9ab2] mb-3">A、B 兩軌擇一達成即可晉升，取先達標者。</p>
            <div className="grid gap-3 md:grid-cols-2">
              {([["A 軌（個人）", v.trackA], ["B 軌（個人＋團隊）", v.trackB]] as const).map(([title, t]) => (
                <div key={title} className="rounded-lg border border-white/10 bg-[#0a2138] p-3">
                  <div className="text-sm font-bold mb-2">{title}</div>
                  {!t ? (
                    <p className="text-xs text-[#6f869c]">此職級未開放這一軌。</p>
                  ) : t.gaps.length === 0 ? (
                    <p className="text-xs text-[#6f869c]">門檻未設定 —— 這一軌目前不啟用。</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-[#a9bccf]">目標 {t.toCode}</div>
                      {t.gaps.map((g) => {
                        const pct = g.need > 0 ? Math.min(100, Math.round((g.have / g.need) * 100)) : 100;
                        return (
                          <div key={g.label}>
                            <div className="flex justify-between text-xs">
                              <span className="text-[#cfdcea]">{g.label}</span>
                              <span className={g.met ? "text-[#7fb894]" : "text-[#a9bccf]"}>
                                {g.have.toLocaleString()} / {g.need.toLocaleString()}
                              </span>
                            </div>
                            <div className="h-1.5 rounded bg-[#081a2b] overflow-hidden mt-0.5">
                              <div className="h-full" style={{ width: `${pct}%`, background: g.met ? "#6f8f74" : "#2b7cb5" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {tip && <p className="mt-3 text-sm text-[#e0bd8b]">{tip}</p>}
          </>
        )}
        {v.tenureRankCode && v.tenureSettledCode && (
          <p className="mt-3 text-xs text-[#c99a5b]">
            真除進度：以目前完成度，期滿將轉正為 <b>{v.tenureSettledCode}</b>。{v.tenureNote}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#a9bccf]">
          <span>終身累計 <b className="text-[#cfdcea]">{v.stats.personalCases}</b> 案</span>
          <span>累計顧問費 <b className="text-[#cfdcea]">{v.stats.personalFees.toLocaleString()}</b> 元</span>
          <span>團隊輔導業績 <b className="text-[#cfdcea]">{v.stats.teamCases}</b> 案</span>
        </div>
      </div>

      {/* 我的分潤明細 */}
      <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
        <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">我的分潤明細</h2>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#12334f] text-[#a9bccf] text-left text-xs">
                <th className="px-3 py-2">月份</th><th className="px-3 py-2">客戶</th>
                <th className="px-3 py-2">我的身分</th><th className="px-3 py-2 text-right">%</th>
                <th className="px-3 py-2 text-right">金額</th><th className="px-3 py-2">狀態</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {v.payouts.map((p) => (
                <Fragment key={p.id}>
                  <tr className="border-t border-white/8">
                    <td className="px-3 py-2 text-[#a9bccf]">{p.period}</td>
                    <td className="px-3 py-2">{p.clientName}</td>
                    <td className="px-3 py-2 text-[#a9bccf] text-xs">{p.role}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.totalPct}%</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{p.amount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={p.status === "paid" ? "text-[#7fb894]" : "text-[#e0bd8b]"}>
                        {p.status === "paid" ? "已發放" : p.status === "batched" ? "已入批" : "待入批"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-xs text-[#a9bccf] underline"
                        onClick={() => setOpen(open === p.id ? null : p.id)}>
                        {open === p.id ? "收合" : "怎麼算的"}
                      </button>
                    </td>
                  </tr>
                  {open === p.id && (
                    <tr className="bg-[#0a2138]">
                      <td colSpan={7} className="px-4 py-2 text-xs text-[#8fa6ba] leading-relaxed">
                        {p.trace.map((t, k) => <div key={k}>· {t}</div>)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {v.payouts.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-[#6f869c]">尚無分潤紀錄。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 直轄團隊 */}
      {v.team.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
          <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">我的直轄團隊</h2>
          <div className="flex flex-wrap gap-2">
            {v.team.map((t) => (
              <div key={t.id} className="rounded-lg border border-white/10 bg-[#0a2138] px-3 py-2 text-sm">
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-[#a9bccf]">
                  {t.rankCode ?? "未設職級"} · 本年 {t.yearCases} 案
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 我的異動 */}
      {v.events.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
          <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2 mb-2">我的職級異動</h2>
          <ul className="space-y-1 text-xs text-[#a9bccf]">
            {v.events.map((e) => (
              <li key={e.id}>
                <span className="text-[#6f869c] mr-2">{e.effectiveAt ?? "—"}</span>
                {e.fromCode ?? "—"} → <b className="text-[#e0bd8b]">{e.toCode ?? "—"}</b>
                <span className="ml-2">（{REASON[e.reason] ?? e.reason}）</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 維持資格提醒。年底前兩個月才轉為醒目樣式——
 * 一整年都在喊「未達標」會被當成背景噪音，等到 1/1 被停資格才吵就太晚了。
 */
function MaintenanceNotice({ v }: { v: MyView }) {
  const m = v.maintenance;
  if (m.exempt || m.pass) return null;

  const urgent = v.daysLeftInYear <= 62;
  const gaps: string[] = [];
  if (!m.execPass && m.needCases !== null) {
    gaps.push(`還需完成 ${Math.max(0, m.needCases - m.execCases)} 個收費個案`);
  }
  if (!m.trainPass && m.needHours !== null) {
    gaps.push(`還需補 ${Math.max(0, m.needHours - m.trainHours)} 小時訓練`);
  }
  if (!gaps.length) return null;

  return (
    <div className={`rounded-xl px-4 py-3 border ${
      urgent
        ? "border-[#e08b7a]/50 bg-[#e08b7a]/10"
        : "border-[#c99a5b]/40 bg-[#c99a5b]/10"
    }`}>
      <div className={`text-sm font-bold ${urgent ? "text-[#e08b7a]" : "text-[#e0bd8b]"}`}>
        {urgent ? `年度剩 ${v.daysLeftInYear} 天，維持資格尚未達成` : "本年度維持資格尚未達成"}
      </div>
      <div className="text-xs text-[#a9bccf] mt-1">
        {gaps.join("、")}。
        未達成者自次年度起暫停招募與受派資格；<b>職級不會降級，既有團隊分潤照領</b>。
      </div>
    </div>
  );
}

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-4">
      <div className="text-xs text-[#a9bccf]">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
