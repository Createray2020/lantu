"use client";

import { useRouter } from "next/navigation";
import type { OrgRank } from "@/lib/org";
import { SELECT_SM } from "@/components/ui/Field";

// 首頁視角切換（教練／主管／核心成員）＋ 團隊/成員預覽選擇 ＋ 期間切換（年份 → 月／季／半年／全年 → 哪一段）。
// 用網址查詢參數驅動（?as=&focus=&range=），伺服器端重新彙總對應視角與期間。
// 2026/10/10 Ray：要能選哪一個月、哪一季、哪一年（不只本月／本季）。range 寫法見 homeStats.periodOf。
const LABEL: Record<OrgRank, string> = { member: "教練", manager: "主管", owner: "核心成員" };

type Kind = "month" | "quarter" | "half" | "year";
type RangeOptions = {
  years: number[]; thisYear: number; thisMonth: number; thisQuarter: number; thisHalf: number;
  kinds: { kind: Kind; label: string }[];
  months: { n: number; label: string }[]; quarters: { n: number; label: string }[]; halves: { n: number; label: string }[];
};
const keyOf = (kind: Kind, year: number, n: number) =>
  kind === "month" ? `${year}-${String(n).padStart(2, "0")}` : kind === "quarter" ? `${year}-q${n}` : kind === "half" ? `${year}-h${n}` : `${year}`;

export default function HomeSwitcher({
  rank, views, focusId, teamOptions, memberOptions, period, rangeOptions: ro,
}: {
  rank: OrgRank;
  views: OrgRank[];
  focusId: string;
  teamOptions: { id: string; name: string }[];
  memberOptions: { id: string; name: string }[];
  period: { key: string; kind: Kind; year: number; n: number; current: boolean };
  rangeOptions: RangeOptions;
}) {
  const router = useRouter();
  const go = (as: OrgRank, focus?: string, r: string = period.key) => {
    const q = new URLSearchParams();
    q.set("as", as);
    if (focus) q.set("focus", focus);
    if (r && r !== keyOf("month", ro.thisYear, ro.thisMonth)) q.set("range", r);
    router.push(`/dashboard?${q.toString()}`);
  };
  const multiView = views.length > 1;
  const focus = multiView ? focusId : undefined;
  // 換種類時子選項落在「當期」（今年才有當期；看去年就落在那年的最後一段）
  const defaultN = (kind: Kind, year: number) => {
    if (year !== ro.thisYear) return kind === "month" ? 12 : kind === "quarter" ? 4 : kind === "half" ? 2 : 1;
    return kind === "month" ? ro.thisMonth : kind === "quarter" ? ro.thisQuarter : kind === "half" ? ro.thisHalf : 1;
  };
  const pick = (kind: Kind, year: number, n: number) => go(rank, focus, keyOf(kind, year, n));
  const subs = period.kind === "month" ? ro.months : period.kind === "quarter" ? ro.quarters : period.kind === "half" ? ro.halves : [];
  const curN = defaultN(period.kind, ro.thisYear);
  const SEL = SELECT_SM;

  return (
    <div className="flex items-center gap-3 flex-wrap mb-4">
      {multiView && (
        <div className="inline-flex bg-panel2 border border-line rounded-full p-1 shadow-e1">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => go(v)}
              className={`px-4 py-1.5 rounded-full text-13 font-bold transition ${
                rank === v ? "bg-brand text-onbrand" : "text-tx2 hover:text-tx"
              }`}
            >
              {LABEL[v]}
            </button>
          ))}
        </div>
      )}

      {multiView && rank === "manager" && teamOptions.length > 0 && (
        <select
          value={focusId}
          onChange={(e) => go("manager", e.target.value)}
          className={SEL}
        >
          {teamOptions.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
      )}
      {multiView && rank === "member" && memberOptions.length > 0 && (
        <select
          value={focusId}
          onChange={(e) => go("member", e.target.value)}
          className={SEL}
        >
          {memberOptions.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
        </select>
      )}

      {/* 期間：年份 → 月／季／半年／全年 → 哪一個 */}
      <div className="inline-flex items-center gap-1.5 flex-wrap" role="group" aria-label="期間">
        <select value={period.year} onChange={(e) => { const y = Number(e.target.value); pick(period.kind, y, Math.min(period.n, defaultN(period.kind, y))); }} className={SEL} aria-label="年份">
          {ro.years.map((y) => <option key={y} value={y}>{y} 年</option>)}
        </select>
        <div className="inline-flex bg-panel2 border border-line rounded-full p-1 shadow-e1">
          {ro.kinds.map((k) => (
            <button
              key={k.kind}
              onClick={() => pick(k.kind, period.year, defaultN(k.kind, period.year))}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${period.kind === k.kind ? "bg-brand text-onbrand" : "text-tx2 hover:text-tx"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {subs.length > 0 && (
          <select value={period.n} onChange={(e) => pick(period.kind, period.year, Number(e.target.value))} className={SEL} aria-label="哪一段">
            {subs.map((o) => <option key={o.n} value={o.n}>{o.label}{period.year === ro.thisYear && o.n === curN ? (period.kind === "month" ? "（本月）" : period.kind === "quarter" ? "（本季）" : "（當期）") : ""}</option>)}
          </select>
        )}
        {!period.current && (
          <button onClick={() => pick("month", ro.thisYear, ro.thisMonth)} className="text-xs text-tx2 hover:text-brand2 underline underline-offset-2">回到本月</button>
        )}
      </div>
      {multiView && <span className="text-11 text-tx3">預覽視角 · 數字來自後台帳務、分潤匯款與業務制度</span>}
    </div>
  );
}
