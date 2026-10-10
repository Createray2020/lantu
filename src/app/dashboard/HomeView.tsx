// 首頁三角色版面（伺服器元件，純呈現）。設計對齊嵐途 v12 深藍＋琥珀金色票。
import Link from "next/link";
import type { AgendaItem, HomeView, MemberHome, ManagerHome, OwnerHome } from "@/lib/home";
import { fmtNTD } from "@/lib/money";
import { todayISO } from "@/lib/license";
import { TAX_MODE_LABEL } from "@/lib/acctEngine";
import { WaterfallChart, MonthBars, TwoLines } from "@/components/acctCharts";

const nt = fmtNTD;

const TAG: Record<string, string> = {
  blue: "bg-info/15 text-info",
  amber: "bg-brand/18 text-brand2",
  green: "bg-ok/16 text-ok",
  warn: "bg-danger/16 text-danger",
  mut: "bg-panel2 text-tx2 border border-line",
};

// ⚠️ `more` 一直只是**一段文字**，不是連結——「公告中心 →」「全部待辦 →」點了都沒反應。
//    有 moreHref 才真的連出去；沒有的就維持原本那段灰字（那些頁面還不存在，
//    給一個點了 404 的連結比給一段灰字更糟）。
function Section({ title, more, moreHref, children }: { title: string; more?: string; moreHref?: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-line rounded-xl px-4 py-4 mb-4 shadow-e1">
      <h4 className="text-sm font-bold text-brand2 flex items-center gap-2 mb-3">
        {title}
        {more && (moreHref
          ? <Link href={moreHref} className="ml-auto text-tx2 hover:text-brand2 text-xs font-bold transition">{more} →</Link>
          : <span className="ml-auto text-tx2 text-xs font-bold">{more} →</span>)}
      </h4>
      {children}
    </div>
  );
}

/**
 * ⚠️ `pending`＝這個數字的來源（member_metrics）本期還沒有任何一列。
 *    這種時候一定要顯示「—／尚未填寫」而不是 0：一個大大的「0」看起來是結論
 *    （這個月真的沒業績），實際上只是沒人填。這兩件事在畫面上必須分得開。
 *    2026/08/30 之前這裡是另一種說法——標「示範資料」，而資料庫裡真的躺著種子列。
 */
function Kpi({ icon, label, value, sm, note, up, dn, top = "var(--tx2)", pending = false }: {
  icon?: string; label: string; value: string; sm?: string; note?: string; up?: string; dn?: string; top?: string; pending?: boolean;
}) {
  if (pending) { value = "—"; sm = undefined; note = "尚未填寫"; up = undefined; dn = undefined; }
  return (
    <div className="bg-panel2 border border-line rounded-xl px-4 py-3 shadow-e1" style={{ borderTop: `3px solid ${top}` }}>
      <div className="text-tx2 text-xs flex items-center gap-1.5">{icon && <span>{icon}</span>}{label}</div>
      <div className={"text-[23px] font-extrabold mt-1 leading-tight" + (pending ? " text-tx3" : "")}>{value}{sm && <span className="text-xs text-tx3 font-semibold"> {sm}</span>}</div>
      {(note || up || dn) && (
        <div className="text-11 mt-0.5 text-tx3">
          {up && <span className="text-ok font-bold">▲ {up}</span>}
          {dn && <span className="text-danger font-bold">▼ {dn}</span>} {note}
        </div>
      )}
    </div>
  );
}

function Bar({ pct, kind = "amber" }: { pct: number; kind?: string }) {
  const bg = kind === "teal" ? "linear-gradient(90deg,var(--tx3),var(--tx2))"
    : kind === "green" ? "linear-gradient(90deg,var(--ok-solid),var(--ok))"
    : "linear-gradient(90deg,var(--brand),var(--brand2))";
  return (
    <div className="h-[9px] bg-field rounded-md overflow-hidden">
      <div className="h-full rounded-md" style={{ width: `${Math.min(100, pct)}%`, background: bg }} />
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="flex flex-col gap-2 pr-14">
      {steps.map((s, i) => {
        const w = Math.max(26, Math.round((s.value / max) * 100));
        const conv = i > 0 && steps[i - 1].value ? Math.round((s.value / steps[i - 1].value) * 100) : null;
        return (
          <div key={i} className="relative h-[38px] rounded-lg flex items-center justify-between px-3.5 text-onbrand font-bold"
            style={{ width: `${w}%`, background: "linear-gradient(90deg,rgba(201,154,91,.9),rgba(201,154,91,.55))" }}>
            <span className="text-13">{s.label}</span>
            <span className="text-sm tabular-nums">{s.value.toLocaleString("en-US")}</span>
            {conv != null && <span className="absolute -right-14 top-1/2 -translate-y-1/2 text-tx2 text-11 font-semibold whitespace-nowrap">轉化 {conv}%</span>}
          </div>
        );
      })}
    </div>
  );
}

function Gauge({ score }: { score: number }) {
  const a = Math.PI * (1 - score / 100);
  const x = (90 + 80 * Math.cos(a)).toFixed(1);
  const y = (90 - 80 * Math.sin(a)).toFixed(1);
  const col = score >= 80 ? "var(--ok)" : score >= 60 ? "var(--brand)" : "var(--danger)";
  return (
    <svg width="184" height="104" viewBox="0 0 184 104">
      <path d="M10 90 A80 80 0 0 1 170 90" fill="none" className="stroke-field" strokeWidth="13" strokeLinecap="round" />
      <path d={`M10 90 A80 80 0 0 1 ${x} ${y}`} fill="none" stroke={col} strokeWidth="13" strokeLinecap="round" />
      <text x="92" y="82" textAnchor="middle" fontSize="34" fontWeight="800" fill={col}>{score}</text>
      <text x="92" y="99" textAnchor="middle" fontSize="12" className="fill-tx2">組織健康度 / 100</text>
    </svg>
  );
}

// 折線圖原本完全沒有數值標籤——看得到形狀、讀不出數字。
// preserveAspectRatio="none" 會把 SVG 內的文字一起拉扁，所以刻度用 HTML 疊在上下兩側。
function Hero({ k, h1, sub, right }: { k: string; h1: string; sub: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line px-6 py-5 mb-4 flex items-center gap-4 flex-wrap" style={{ background: "linear-gradient(120deg,var(--panel),var(--panel2))" }}>
      <div>
        <div className="text-brand tracking-[0.16em] text-11 font-bold">{k}</div>
        <h1 className="text-[22px] font-extrabold my-1">{h1}</h1>
        <div className="text-tx2 text-13">{sub}</div>
      </div>
      {right && <div className="ml-auto flex gap-2.5 flex-wrap">{right}</div>}
    </div>
  );
}

const NoMoney = ({ children }: { children: React.ReactNode }) => (
  <div className="text-tx3 text-xs py-6 text-center">{children}</div>
);
const Chip = ({ children, warn = false }: { children: React.ReactNode; warn?: boolean }) => (
  <div className={`inline-flex items-center gap-1.5 bg-panel2 border rounded-lg px-3 py-2 text-xs shadow-e1 ${warn ? "border-danger text-danger" : "border-line text-tx2"}`}>{children}</div>
);
const PAY_STATUS: Record<string, [string, string]> = { none: ["沒有分潤", "mut"], pending: ["未匯", "amber"], partial: ["部分已匯", "amber"], paid: ["已匯", "green"] };

// ══════════ 教練 ══════════
function MemberView({ d, today, pl, multi }: { d: MemberHome; today: string; pl: string; multi: boolean }) {
  const k = d.kpis, m = d.money, p = d.promo, t = d.term;
  const [ps, pk] = m.status === "none" ? [`${pl}沒有分潤`, "mut"] : PAY_STATUS[m.status];
  const promoLine = p.kind === "apply" ? `報聘門檻：${p.cases}／${p.needCases} 件・${nt(p.fees)}／${nt(p.needFees ?? 0)}`
    : p.kind === "promote" ? `${p.rankCode} → ${p.nextCode}：${p.cases}／${p.needCases ?? "—"} 件・${nt(p.fees)}／${p.needFees != null ? nt(p.needFees) : "—"}`
    : p.kind === "top" ? "已是最高職級" : "尚未核定職級";
  return (
    <>
      <Hero k={`早安，${d.coach.name}`}
        h1={d.hasMoney || m.net > 0 ? `${pl}實匯 ${nt(m.net)}` : `今天有 ${k.todayAppts} 場約訪、${k.openItems} 件待辦`}
        sub={<>{today} · {p.rankLabel} · {promoLine}{p.met && p.kind !== "top" ? <b className="text-ok ml-1">已達門檻</b> : null}</>}
        right={<div className="min-w-[170px]"><div className="text-11 text-tx2">{p.kind === "apply" ? "離報聘" : p.nextCode ? `離 ${p.nextCode}` : "晉升"}</div><div className="text-15 font-extrabold text-brand2">{p.pct}%</div><div className="mt-1.5"><Bar pct={p.pct} /></div></div>} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3 mb-4">
        <Kpi icon="💵" label={`${pl}實匯`} value={nt(m.net)} note={m.withhold ? `應付 ${nt(m.due)}・扣繳 ${nt(m.withhold)}` : m.srcN ? `${m.srcN} 筆分潤` : `${pl}還沒有分潤`} top="var(--brand)" />
        <Kpi icon="🏦" label="匯款狀態" value={ps} note={multi ? `${m.months[0]?.ym}～${m.ym} 入帳・最後一月 ${m.payDate} 發放` : `${m.ym} 入帳・${m.payDate} 發放`} top={pk === "green" ? "var(--ok)" : "var(--tx2)"} />
        <Kpi icon="📄" label="累計正式案件" value={String(p.cases)} sm="案" note={`顧問費 ${nt(p.fees)}`} top="var(--c5)" />
        <Kpi icon="✅" label="待辦事項" value={String(k.openItems)} sm="項" top="var(--danger)" />
        <Kpi icon="📅" label="今日約訪" value={String(k.todayAppts)} sm="場" />
        <Kpi icon="🧭" label={`${pl}回訪到位`} value={`${d.checkins.done}/${d.checkins.total}`} sm="場" note={d.checkins.total ? `部分 ${d.checkins.partial}・沒動 ${d.checkins.none}` : `${pl}還沒有回訪對帳`} top="var(--brand)" />
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 items-start">
        <div>
          <Section title={multi ? `💵 我的實匯（${pl}逐月）` : "💵 我的實匯（近 6 個月）"} more="我的分潤" moreHref="/dashboard/payouts">
            {m.months.some((x) => x.net > 0) ? <MonthBars rows={m.months.map((x) => ({ ym: x.ym, v: x.net }))} current={multi ? "" : m.ym} /> : <NoMoney>{multi ? `${pl}還沒有分潤。` : "近六個月還沒有分潤。"}有分潤的月份會在這裡長出來；每月 5 日結算前一個月。</NoMoney>}
            {m.unverified.n > 0 && <div className="text-xs text-tx2 mt-2">另有 <b className="text-brand2">{m.unverified.n} 筆</b> 顧問費（{nt(m.unverified.amount)}）等公司查帳確認，確認後才算分潤與實績。</div>}
          </Section>
          <Section title="📅 近期行程" more="全部行程" moreHref="/dashboard/calendar">
            <Agenda items={d.agenda} today={todayISO()} />
          </Section>
          <Section title="✅ 待辦動作" more="全部待辦">
            {d.todos.length === 0 ? <Empty>沒有待辦動作</Empty> : d.todos.map((x, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
                <span className="text-brand2 font-extrabold text-13 w-11 tabular-nums">{x.time}</span>
                <div className="w-[18px] h-[18px] rounded border-2 border-tx3 shrink-0" />
                <div className="flex-1 min-w-0"><div className="font-bold text-13">{x.title}</div><div className="text-tx2 text-xs">{x.sub}</div></div>
                <span className={`text-11 font-bold px-2 py-0.5 rounded ${TAG[x.tagKind]}`}>{x.tag}</span>
              </div>
            ))}
          </Section>
        </div>
        <div>
          <Section title="🎯 晉升進度" more="我的業務" moreHref="/dashboard/my-business">
            {p.kind === "unranked" ? <NoMoney>職級還沒核定，核定後這裡會顯示離下一階還差多少。</NoMoney> : (
              <>
                <div className="text-13 mb-2">{promoLine}</div>
                <Bar pct={p.pct} kind={p.met ? "green" : "amber"} />
                <div className="text-11 text-tx3 mt-2">件數＝同一客戶同年度合計一案；顧問費＝公司已確認入帳的實收。只勾了「付費顧問案」的才算。</div>
              </>
            )}
          </Section>
          <Section title="🛡️ 合作與收款設定">
            <div className="flex gap-2.5 flex-wrap">
              <Chip warn={t.warn}>{t.kind === "intern" ? "🎓" : "📇"} {t.label}</Chip>
              {m.payeeReady
                ? <Chip>🏦 收款設定已填・{TAX_MODE_LABEL[m.taxMode as keyof typeof TAX_MODE_LABEL] ?? m.taxMode}</Chip>
                : <Link href="/dashboard/profile" className="no-underline"><Chip warn>🏦 收款帳號還沒填 → 去我的檔案</Chip></Link>}
              <Chip>🛡️ 適合度問卷待補 <b className="text-tx">{d.compliance.kycPending} 位</b></Chip>
            </div>
          </Section>
          <Section title="👥 待關注客戶" more="我的客戶" moreHref="/dashboard/clients">
            {d.watch.length === 0 ? <Empty>目前沒有待關注客戶</Empty> : d.watch.map((w, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: w.dot === "warn" ? "var(--danger)" : w.dot === "ok" ? "var(--ok)" : "var(--tx2)" }} />
                <div className="flex-1 min-w-0"><div className="font-bold text-13">{w.name}</div><div className="text-tx2 text-xs">{w.note}</div></div>
                <span className={`text-11 font-bold px-2 py-0.5 rounded ${TAG[w.tagKind]}`}>{w.tag}</span>
              </div>
            ))}
          </Section>
          {d.announcements.length > 0 && (
            <Section title="📢 最新公告">
              {d.announcements.map((a) => (
                <div key={a.id} className="py-2.5 border-b border-line last:border-0">
                  <div className="font-bold text-13 flex gap-2 items-center">
                    <span className={`text-11 font-bold px-2 py-0.5 rounded ${a.category === "important" ? TAG.warn : a.category === "activity" ? TAG.amber : TAG.mut}`}>{a.category === "important" ? "重要" : a.category === "activity" ? "活動" : "一般"}</span>
                    {a.title}
                  </div>
                  <div className="text-tx3 text-11 mt-1">{a.author}</div>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

// ══════════ 主管 ══════════
function ManagerView({ d, pl, multi }: { d: ManagerHome; pl: string; multi: boolean }) {
  const tm = d.team;
  const max = Math.max(1, ...tm.rows.map((r) => r.net));
  return (
    <>
      <Hero k={`團隊概況 · ${d.teamName}`}
        h1={d.hasMoney ? `團隊${pl}實匯 ${nt(tm.total)}` : `${d.teamName}`}
        sub={<>{d.memberCount} 位教練 · <b className="text-brand2">{d.pendingCount} 位</b> 報聘中{tm.nearPromo ? <> · <b className="text-ok">{tm.nearPromo} 位</b> 接近晉升門檻</> : null}{d.hasMoney ? null : <> · {pl}還沒有收款</>}</>}
        right={<div className="text-xs text-tx2">{multi ? "最後一月結算" : "結算"} {d.payDate} 發放</div>} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3 mb-4">
        <Kpi icon="💰" label={`團隊實匯（${pl}）`} value={nt(tm.total)} top="var(--brand)" note={tm.unverified.n ? `另 ${tm.unverified.n} 筆顧問費待查帳` : undefined} />
        <Kpi icon="🎯" label="接近晉升" value={String(tm.nearPromo)} sm="位" note="門檻達成 70% 以上" top="var(--ok)" />
        <Kpi icon="🧲" label="報聘中" value={String(d.pendingCount)} sm="位" top="var(--c5)" />
        <Kpi icon="🤝" label="我推薦的申請" value={String(d.funnel.referredByMe)} sm="位" />
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 items-start">
        <div>
          <Section title={`🏆 團隊${pl}實匯與晉升進度`} more="職級與晉升" moreHref="/dashboard/my-business">
            {tm.rows.length === 0 ? <Empty>團隊還沒有成員</Empty> : tm.rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-center py-2 border-b border-line last:border-0">
                <div className="font-bold text-13">{r.name} <span className="text-11 text-tx3 font-normal">{r.rankCode ?? "未定級"}{r.nextCode ? ` → ${r.nextCode} ${r.pct}%` : ""}</span></div>
                <div className="text-right font-extrabold tabular-nums">{nt(r.net)}</div>
                <div className="col-span-2 h-2 bg-field rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${(r.net / max) * 100}%`, background: "linear-gradient(90deg,var(--brand),var(--brand2))" }} /></div>
              </div>
            ))}
          </Section>
          <Section title="📅 近期行程" more="全部行程" moreHref="/dashboard/calendar">
            <Agenda items={d.agenda} today={todayISO()} />
          </Section>
        </div>
        <div>
          <Section title="🧲 報聘漏斗" more="待我處理" moreHref="/admin/inbox"><Funnel steps={d.funnel.steps} /></Section>
          <Section title="✅ 報聘審核">
            {d.funnel.pending.length === 0 ? <Empty>沒有待審核的申請</Empty> : d.funnel.pending.map((x, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
                <div className="w-[18px] h-[18px] rounded border-2 border-tx3 shrink-0" />
                <div className="flex-1 min-w-0"><div className="font-bold text-13">{x.name}</div><div className="text-tx2 text-xs">{x.sub}</div></div>
                <span className={`text-11 font-bold px-2 py-0.5 rounded ${TAG[x.tagKind]}`}>{x.tag}</span>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </>
  );
}

// ══════════ 核心成員 ══════════
function OwnerView({ d, pl, multi }: { d: OwnerHome; pl: string; multi: boolean }) {
  const c = d.company, r = c.r, po = c.payouts;
  const cmax = Math.max(1, ...c.chains.map((x) => x.net));
  return (
    <>
      <Hero k={multi ? `公司 ${pl}` : "公司這個月"}
        h1={r && d.hasMoney ? `公司實收 ${nt(r.gp)}，淨利 ${nt(r.net)}` : `${pl}還沒有收款`}
        sub={<>{c.headcount} 位有效教練 · 收款 {nt(po.received)} · 要匯出去 {nt(po.net)}（已匯 {nt(po.paid)}）{po.pending.n ? <> · <b className="text-danger">{po.pending.n} 筆顧問費待查帳</b></> : null}</>}
        right={<>
          {c.bodies.map((b) => <div key={b.code} className="inline-flex items-center gap-1.5 bg-panel2 border border-line rounded-lg px-3 py-2 text-xs text-tx2 shadow-e1">{b.label} <b className="text-tx">{b.n}</b></div>)}
        </>} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3 mb-4">
        <Kpi icon="💎" label={`營業額（${pl}）`} value={nt(r?.rev ?? 0)} top="var(--brand)" />
        <Kpi icon="🏢" label="公司實收" value={nt(r?.gp ?? 0)} note={r?.rev ? `${Math.round(r.gp / r.rev * 100)}%` : undefined} top="var(--ok)" />
        <Kpi icon="📈" label="淨利" value={nt(r?.net ?? 0)} note={r ? `固定 ${nt(r.fixed)}・稅 ${nt(r.vat)}` : undefined} top={r && r.net < 0 ? "var(--danger)" : "var(--ok)"} />
        <Kpi icon="🏦" label="還要匯" value={nt(po.remaining)} note={multi ? `最後一月發放日 ${po.payDate}` : `發放日 ${po.payDate}`} top="var(--danger)" />
        <Kpi icon="📇" label="合作到期／未設" value={`${c.expired}／${c.unlicensed}`} sm="位" top="var(--c5)" />
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 items-start">
        <div>
          <Section title={`🧭 ${pl}損益`} more="本月帳務" moreHref="/admin/accounting/monthly">
            {r && d.hasMoney ? <WaterfallChart r={r} /> : <NoMoney>{pl}還沒有收款，畫不出損益。</NoMoney>}
          </Section>
          <Section title={multi ? `📈 營業額 vs 公司實收（${pl}逐月）` : "📈 營業額 vs 公司實收（近 8 個月）"}>
            {c.trend.some((x) => x.rev > 0) ? <TwoLines rows={c.trend.map((x) => ({ ym: x.ym, a: x.rev, b: x.company }))} /> : <NoMoney>還沒有任何月份的收款。</NoMoney>}
          </Section>
          <Section title="📅 近期行程" more="全部行程" moreHref="/dashboard/calendar">
            <Agenda items={d.agenda} today={todayISO()} />
          </Section>
        </div>
        <div>
          <Section title="🧭 組織健康度（制度量表）">
            <div className="flex items-center gap-5 flex-wrap">
              <Gauge score={c.healthScore} />
              <div className="flex-1 min-w-[180px] flex flex-col gap-2.5">
                {c.health.map((g, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs">
                    <span className="text-tx2 min-w-[74px]">{g.label}</span>
                    <div className="flex-1 h-[7px] bg-field rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${g.pct}%`, background: g.color }} /></div>
                    <span className="font-extrabold min-w-[38px] text-right">{g.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-11 text-tx3 mt-2">合作有效＝未到期教練比例；維持資格＝本年度達標比例；推薦動能＝{pl}有推薦分潤的人數比例；回訪完成＝{pl}回訪對帳到位；對帳完成＝已匯／實匯。</div>
          </Section>
          <Section title={`🏢 各輔導鏈${pl}實匯`}>
            {c.chains.length === 0 ? <Empty>還沒有任何團隊</Empty> : c.chains.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 items-center py-2.5 border-b border-line last:border-0">
                <div><div className="font-bold text-13">{t.name}</div><div className="text-tx2 text-xs">{t.headcount} 位成員</div></div>
                <div className="text-right font-extrabold tabular-nums">{nt(t.net)}</div>
                <div className="col-span-2 h-2 bg-field rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${(t.net / cmax) * 100}%`, background: "linear-gradient(90deg,var(--tx3),var(--tx2))" }} /></div>
              </div>
            ))}
          </Section>
          <Section title={`🏅 ${pl}實匯 Top 5`} more="分潤匯款" moreHref="/admin/accounting/payouts">
            {d.top5.length === 0 ? <Empty>{pl}還沒有分潤</Empty> : d.top5.map((x, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-line last:border-0"><span className="text-tx3 w-5 text-center font-extrabold">{i + 1}</span><span className="flex-1 font-bold text-13">{x.name}</span><span className="font-extrabold tabular-nums">{nt(x.net)}</span></div>
            ))}
          </Section>
          <Section title="🧲 報聘漏斗" more="待我處理" moreHref="/admin/inbox"><Funnel steps={d.funnel.steps} /></Section>
        </div>
      </div>
    </>
  );
}

// ══════════ 近期行程（公司行事曆 ＋ 我的客戶約訪）══════════
//
// 2026/09/14：首頁的分界是「有時間、要出席的」對上「沒時間、要做完的」，
// 不是「公司的」對上「個人的」。所以公司行程與客戶約訪在同一條時間軸上，
// 靠左側色條與標籤分開，而不是拆成兩塊要教練自己拼。
const AGENDA_COLOR: Record<string, string> = {
  meeting: "var(--info)",
  training: "var(--brand)",
  activity: "var(--c5)",
  ops: "var(--tx2)",
  appt: "var(--ok)",
};
const WD = ["日", "一", "二", "三", "四", "五", "六"];

function dayLabel(iso: string, todayISO: string): { dd: string; wd: string; isToday: boolean } {
  // 純字串 → UTC 取星期，不經過本地時區（伺服器在 UTC，使用者在台北）。
  const d = new Date(iso + "T00:00:00Z");
  const diff = Math.round((d.getTime() - new Date(todayISO + "T00:00:00Z").getTime()) / 86400000);
  return {
    dd: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
    wd: diff === 0 ? "今天" : diff === 1 ? "明天" : `週${WD[d.getUTCDay()]}`,
    isToday: diff === 0,
  };
}

function Agenda({ items, today }: { items: AgendaItem[]; today: string }) {
  if (items.length === 0) {
    return <Empty>未來七天沒有排定的行程</Empty>;
  }
  // 依日期分組，日期當左軸。
  const groups: { date: string; rows: AgendaItem[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === it.date) last.rows.push(it);
    else groups.push({ date: it.date, rows: [it] });
  }
  return (
    <div className="flex flex-col">
      {groups.map((g) => {
        const d = dayLabel(g.date, today);
        return (
          <div key={g.date} className="flex gap-3 py-2 border-t border-line first:border-0 first:pt-0">
            <div className="shrink-0 w-[58px] pt-0.5">
              <div className={`font-serif text-lg font-bold leading-tight tabular-nums ${d.isToday ? "text-brand2" : "text-tx"}`}>{d.dd}</div>
              <div className={`text-11 font-semibold tracking-wide ${d.isToday ? "text-brand" : "text-tx3"}`}>{d.wd}</div>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              {g.rows.map((r) => (
                <Link
                  key={r.id}
                  href={r.href}
                  className="flex items-baseline gap-2.5 flex-wrap px-2.5 py-1.5 rounded-lg bg-panel2 hover:bg-field border-l-2 transition"
                  style={{ borderLeftColor: AGENDA_COLOR[r.kind] ?? "var(--tx3)" }}
                >
                  <span className="shrink-0 text-xs font-semibold text-tx2 tabular-nums min-w-[38px]">{r.timeLabel}</span>
                  <span className="text-13 text-tx">{r.title}</span>
                  <span className="shrink-0 text-10 font-bold px-1.5 py-px rounded" style={{ color: AGENDA_COLOR[r.kind], background: "color-mix(in srgb, var(--panel) 40%, transparent)" }}>{r.kindLabel}</span>
                  {r.visLabel && <span className="shrink-0 text-10 font-bold px-1.5 py-px rounded border border-line text-tx3">{r.visLabel}</span>}
                  {r.place && <span className="text-11 text-tx3">{r.place}</span>}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-tx3 text-sm bg-panel2 border border-line rounded-lg px-3 py-6 text-center shadow-e1">{children}</div>;
}

export default function Home({ data }: { data: HomeView }) {
  // pl＝期間在句子裡的叫法：當月仍說「本月」，其他說「2026年8月」「2026 第四季」這種。
  const multi = data.period.multi, pl = !multi && data.period.current ? "本月" : data.period.label;
  return (
    <div>
      {data.member && <MemberView d={data.member} today={data.today} pl={pl} multi={multi} />}
      {data.manager && <ManagerView d={data.manager} pl={pl} multi={multi} />}
      {data.owner && <OwnerView d={data.owner} pl={pl} multi={multi} />}
      <div className="text-tx3 text-11 text-center mt-6 pt-4 border-t border-line">
        嵐途 LAN TU · {data.today} · {data.periodLabel} · 數字來自後台帳務、分潤匯款與業務制度
      </div>
    </div>
  );
}
