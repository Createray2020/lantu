// 首頁三角色版面（伺服器元件，純呈現）。設計對齊嵐途 v12 深藍＋琥珀金色票。
import type { HomeView, MemberHome, ManagerHome, OwnerHome } from "@/lib/home";

function nt(n: number): string { return "NT$" + n.toLocaleString("en-US"); }

const TAG: Record<string, string> = {
  blue: "bg-[#8fb2d6]/15 text-[#8fb2d6]",
  amber: "bg-[#c99a5b]/18 text-[#e0bd8b]",
  green: "bg-[#8fc0a3]/16 text-[#8fc0a3]",
  warn: "bg-[#e08a68]/16 text-[#e08a68]",
  mut: "bg-[#12334f] text-[#a7bacb] border border-white/10",
};

function Section({ title, more, children }: { title: string; more?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0d2b45] border border-white/10 rounded-xl px-4 py-4 mb-4">
      <h4 className="text-[14.5px] font-bold text-[#e0bd8b] flex items-center gap-2 mb-3">
        {title}
        {more && <span className="ml-auto text-[#a9bccf] text-[12px] font-bold">{more} →</span>}
      </h4>
      {children}
    </div>
  );
}

function Kpi({ icon, label, value, sm, note, up, dn, top = "#a9bccf" }: {
  icon?: string; label: string; value: string; sm?: string; note?: string; up?: string; dn?: string; top?: string;
}) {
  return (
    <div className="bg-[#12334f] border border-white/10 rounded-xl px-4 py-3" style={{ borderTop: `3px solid ${top}` }}>
      <div className="text-[#a7bacb] text-[12.5px] flex items-center gap-1.5">{icon && <span>{icon}</span>}{label}</div>
      <div className="text-[23px] font-extrabold mt-1 leading-tight">{value}{sm && <span className="text-[12px] text-[#6f869c] font-semibold"> {sm}</span>}</div>
      {(note || up || dn) && (
        <div className="text-[11.5px] mt-0.5 text-[#6f869c]">
          {up && <span className="text-[#8fc0a3] font-bold">▲ {up}</span>}
          {dn && <span className="text-[#e08a68] font-bold">▼ {dn}</span>} {note}
        </div>
      )}
    </div>
  );
}

function Bar({ pct, kind = "amber" }: { pct: number; kind?: string }) {
  const bg = kind === "teal" ? "linear-gradient(90deg,#7d94a8,#a9bccf)"
    : kind === "green" ? "linear-gradient(90deg,#6fa585,#8fc0a3)"
    : "linear-gradient(90deg,#c99a5b,#e0bd8b)";
  return (
    <div className="h-[9px] bg-[#0a1a20] rounded-md overflow-hidden">
      <div className="h-full rounded-md" style={{ width: `${Math.min(100, pct)}%`, background: bg }} />
    </div>
  );
}

function Progress({ label, cur, goal, unit, kind }: { label: string; cur: number; goal: number; unit: string; kind: string }) {
  const pct = goal ? Math.min(100, Math.round((cur / goal) * 100)) : 0;
  const fmt = (v: number) => (unit === "money" ? nt(v) : v.toLocaleString("en-US") + unit);
  return (
    <div className="my-2.5">
      <div className="flex justify-between text-[12.5px] mb-1.5">
        <span>{label}</span>
        <span><b className="text-[#eef2f7]">{fmt(cur)}</b> <span className="text-[#6f869c]">/ {fmt(goal)} ({pct}%)</span></span>
      </div>
      <Bar pct={pct} kind={kind} />
    </div>
  );
}

function Leaderboard({ rows }: { rows: { name: string; income: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.income));
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div className="grid gap-1">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[20px_1fr_auto] gap-3 items-center py-1.5">
          <div className={`text-center text-[13px] font-extrabold ${i === 0 ? "text-[#c99a5b]" : "text-[#6f869c]"}`}>{medal[i] ?? i + 1}</div>
          <div>
            <span className="text-[13.5px] font-bold block mb-1">{r.name}</span>
            <div className="h-[9px] bg-[#0a1a20] rounded-md overflow-hidden">
              <div className="h-full rounded-md" style={{ width: `${(r.income / max) * 100}%`, background: i === 0 ? "linear-gradient(90deg,#c99a5b,#e0bd8b)" : "linear-gradient(90deg,#7d94a8,#a9bccf)" }} />
            </div>
          </div>
          <div className="font-extrabold text-[13px] tabular-nums">{nt(r.income)}</div>
        </div>
      ))}
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
          <div key={i} className="relative h-[38px] rounded-lg flex items-center justify-between px-3.5 text-[#0c1c14] font-bold"
            style={{ width: `${w}%`, background: "linear-gradient(90deg,rgba(201,154,91,.9),rgba(201,154,91,.55))" }}>
            <span className="text-[13px]">{s.label}</span>
            <span className="text-[14px] tabular-nums">{s.value.toLocaleString("en-US")}</span>
            {conv != null && <span className="absolute -right-14 top-1/2 -translate-y-1/2 text-[#a7bacb] text-[11.5px] font-semibold whitespace-nowrap">轉化 {conv}%</span>}
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
  const col = score >= 80 ? "#8fc0a3" : score >= 60 ? "#c99a5b" : "#e08a68";
  return (
    <svg width="184" height="104" viewBox="0 0 184 104">
      <path d="M10 90 A80 80 0 0 1 170 90" fill="none" stroke="#0a1a20" strokeWidth="13" strokeLinecap="round" />
      <path d={`M10 90 A80 80 0 0 1 ${x} ${y}`} fill="none" stroke={col} strokeWidth="13" strokeLinecap="round" />
      <text x="92" y="82" textAnchor="middle" fontSize="34" fontWeight="800" fill={col}>{score}</text>
      <text x="92" y="99" textAnchor="middle" fontSize="12" fill="#a7bacb">組織健康度 / 100</text>
    </svg>
  );
}

function Spark({ vals }: { vals: number[] }) {
  const w = 320, h = 70;
  const mx = Math.max(...vals), mn = Math.min(...vals), rng = (mx - mn) || 1;
  const pts = vals.map((v, i) => {
    const x = i / (vals.length - 1) * (w - 8) + 4;
    const y = h - 6 - (v - mn) / rng * (h - 16);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `4,${h - 2} ${pts.join(" ")} ${w - 4},${h - 2}`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block">
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c99a5b" stopOpacity=".38" /><stop offset="1" stopColor="#c99a5b" stopOpacity="0" /></linearGradient></defs>
      <polygon points={area} fill="url(#sg)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#e0bd8b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => { const [cx, cy] = p.split(","); return <circle key={i} cx={cx} cy={cy} r="2.6" fill="#e0bd8b" />; })}
    </svg>
  );
}

function Hero({ k, h1, sub, right }: { k: string; h1: string; sub: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 px-6 py-5 mb-4 flex items-center gap-4 flex-wrap" style={{ background: "linear-gradient(120deg,#0d2b45,#0c232b)" }}>
      <div>
        <div className="text-[#c99a5b] tracking-[0.16em] text-[11.5px] font-bold">{k}</div>
        <h1 className="text-[22px] font-extrabold my-1">{h1}</h1>
        <div className="text-[#a7bacb] text-[13.5px]">{sub}</div>
      </div>
      {right && <div className="ml-auto flex gap-2.5 flex-wrap">{right}</div>}
    </div>
  );
}

const Demo = () => <span className="ml-1.5 text-[10px] text-[#6f869c] font-normal align-middle">· 示範</span>;

// ══════════ 主管 ══════════
function ManagerView({ d }: { d: ManagerHome }) {
  const k = d.kpis;
  const act = [
    { v: d.activity.visits, l: "拜訪" }, { v: d.activity.calls, l: "電話" },
    { v: d.activity.proposals, l: "提案" }, { v: d.activity.closes, l: "成交" },
  ];
  return (
    <>
      <Hero k={`團隊概況 · ${d.teamName}`} h1={`本月團隊達成 ${k.achievePct}%`}
        sub={<>{d.memberCount} 位顧問 · <b className="text-[#e0bd8b]">{k.pending} 件</b> 待你審核</>}
        right={<div className="min-w-[150px]"><div className="text-[11.5px] text-[#a7bacb]">團隊月目標進度<Demo /></div><div className="text-[15px] font-extrabold text-[#e0bd8b]">{k.achievePct}%</div><div className="mt-1.5"><Bar pct={k.achievePct} /></div></div>} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3 mb-4">
        <Kpi icon="💰" label="團隊收益（本月）" value={nt(k.teamIncome)} note="示範資料" top="#c99a5b" />
        <Kpi icon="🎯" label="團隊達成率" value={String(k.achievePct)} sm="%" note={`目標 ${nt(k.teamGoal)}`} top="#8fc0a3" />
        <Kpi icon="🔥" label="本月活動量" value={String(k.activity)} sm="次" note="拜訪+電話+提案+成交" />
        <Kpi icon="🧲" label="增員進行中" value={String(k.recruitsActive)} sm="位" top="#b7c6b0" />
        <Kpi icon="✅" label="待審核 / 簽核" value={String(k.pending)} sm="件" note="真實資料" top="#e08a68" />
      </div>

      <Section title="🏆 團隊業績排行（本月收益）" more="團隊業績">
        {d.leaderboard.length === 0 ? <Empty>團隊尚無成員業績</Empty> : <Leaderboard rows={d.leaderboard} />}
      </Section>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        <Section title="🔥 活動量看板（本月）">
          <div className="grid grid-cols-4 gap-2.5">
            {act.map((a, i) => (
              <div key={i} className="bg-[#12334f] border border-white/10 rounded-lg px-3 py-2.5 text-center">
                <div className="text-[20px] font-extrabold">{a.v}</div>
                <div className="text-[12px] text-[#a7bacb] mt-0.5">{a.l}</div>
              </div>
            ))}
          </div>
          <div className="text-[#6f869c] text-[11.5px] mt-2.5">業務核心 KPI — 拜訪／電話／提案／成交漏斗即時彙總</div>
        </Section>
        <Section title="🧲 增員漏斗（本季）"><Funnel steps={d.funnel} /></Section>
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 items-start">
        <Section title="📈 團隊本週約訪熱度">
          <Spark vals={d.weekly} />
          <div className="text-[#6f869c] text-[11.5px] mt-1.5">週日 → 週六 · 本週合計 {d.weekly.reduce((a, b) => a + b, 0)} 場約訪</div>
        </Section>
        <Section title="✅ 待審核與簽核" more="成員審核">
          {d.pending.length === 0 ? <Empty>沒有待審核項目</Empty> : d.pending.map((p, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
              <div className="w-[18px] h-[18px] rounded border-2 border-[#6f869c] shrink-0" />
              <div className="flex-1 min-w-0"><div className="font-bold text-[13.5px]">{p.title}</div><div className="text-[#a7bacb] text-[12px]">{p.sub}</div></div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${TAG[p.tagKind]}`}>{p.tag}</span>
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}

// ══════════ 老闆 ══════════
function OwnerView({ d }: { d: OwnerHome }) {
  const k = d.kpis;
  const tmax = Math.max(1, ...d.teams.map((t) => t.income));
  return (
    <>
      <Hero k="全組織健康度" h1={`組織健康度 ${d.healthScore} 分 · 本月業績 ${Math.round(k.income / 10000)} 萬，月成長 ${k.growthPct >= 0 ? "+" : ""}${k.growthPct}%`}
        sub={<>{d.teams.length} 個團隊 · {k.headcount} 位夥伴 · 客戶留存率 {k.retention}%</>}
        right={<>
          <div className="inline-flex items-center gap-1.5 bg-[#12334f] border border-white/10 rounded-lg px-3 py-2 text-[12.5px] text-[#a7bacb]">🏢 團隊 <b className="text-[#eef2f7]">{d.teams.length}</b></div>
          <div className="inline-flex items-center gap-1.5 bg-[#12334f] border border-white/10 rounded-lg px-3 py-2 text-[12.5px] text-[#a7bacb]">🧑‍🤝‍🧑 人力 <b className="text-[#eef2f7]">{k.headcount}</b></div>
        </>} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3 mb-4">
        <Kpi icon="💎" label="全組織業績（本月）" value={nt(k.income)} note="示範資料" top="#c99a5b" />
        <Kpi icon="📈" label="月成長率" value={`${k.growthPct >= 0 ? "+" : ""}${k.growthPct}`} sm="%" note="對比上月" top="#8fc0a3" />
        <Kpi icon="🧑‍🤝‍🧑" label="總人力" value={String(k.headcount)} sm="人" note="真實資料" />
        <Kpi icon="🔁" label="客戶留存率" value={String(k.retention)} sm="%" note="示範資料" top="#b7c6b0" />
        <Kpi icon="🔥" label="活動總量" value={k.activity.toLocaleString("en-US")} sm="次" note="全組織本月" />
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 items-start">
        <div>
          <Section title="🧭 組織健康度總覽" more="組織儀表">
            <div className="flex items-center gap-5 flex-wrap">
              <Gauge score={d.healthScore} />
              <div className="flex-1 min-w-[180px] flex flex-col gap-2.5">
                {d.health.map((g, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="text-[#a7bacb] min-w-[74px]">{g.label}</span>
                    <div className="flex-1 h-[7px] bg-[#0a1a20] rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${g.pct}%`, background: g.color }} /></div>
                    <span className="font-extrabold min-w-[38px] text-right">{g.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
          <Section title="🏢 各團隊業績對比（本月）" more="團隊業績">
            {d.teams.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 items-center py-2.5 border-b border-white/5 last:border-0">
                <div><div className="font-bold text-[13.5px]">{t.name}</div><div className="text-[#a7bacb] text-[12px]">{t.headcount} 位成員</div></div>
                <div className="text-right font-extrabold tabular-nums">{nt(t.income)}<div className="text-[#a7bacb] text-[12px] font-normal">達成率 {t.achievePct}%</div></div>
                <div className="col-span-2 h-2 bg-[#0a1a20] rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${(t.income / tmax) * 100}%`, background: "linear-gradient(90deg,#7d94a8,#a9bccf)" }} /></div>
              </div>
            ))}
          </Section>
        </div>
        <div>
          <Section title="🔻 全組織活動漏斗（本月）"><Funnel steps={d.funnel} /></Section>
          <Section title="📈 業績月成長趨勢">
            <Spark vals={d.trend.map((t) => t.value)} />
            <div className="text-[#6f869c] text-[11.5px] mt-1.5">近 {d.trend.length} 個月業績（萬）<Demo /></div>
          </Section>
        </div>
      </div>

      <Section title="🏅 全組織顧問排行榜 Top 5" more="排行榜">
        {d.top5.length === 0 ? <Empty>尚無排行資料</Empty> : <Leaderboard rows={d.top5} />}
      </Section>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[#6f869c] text-sm bg-[#12334f] border border-white/10 rounded-lg px-3 py-6 text-center">{children}</div>;
}

export default function Home({ data }: { data: HomeView }) {
  return (
    <div>
      {data.member && <MemberViewWithDate d={data.member} today={data.today} />}
      {data.manager && <ManagerView d={data.manager} />}
      {data.owner && <OwnerView d={data.owner} />}
      <div className="text-[#6f869c] text-[11.5px] text-center mt-6 pt-4 border-t border-white/5">
        嵐途 LAN TU · 組織管理後台 · {data.today} · {data.periodLabel}（業績/活動/增員為可編輯模擬資料）
      </div>
    </div>
  );
}

// 顧問 Hero 需要日期，補一層把 today 帶進 sub。
function MemberViewWithDate({ d, today }: { d: MemberHome; today: string }) {
  const k = d.kpis;
  return (
    <>
      <Hero k={`早安，${d.coach.name}`} h1={`今天有 ${k.todayAppts} 場約訪、${k.openItems} 件待辦`}
        sub={<>{today} · 本月收益目標已達成 <b className="text-[#e0bd8b]">{d.progressPct}%</b> 💪</>}
        right={<div className="min-w-[150px]"><div className="text-[11.5px] text-[#a7bacb]">本月收益進度<Demo /></div><div className="text-[15px] font-extrabold text-[#e0bd8b]">{d.progressPct}%</div><div className="mt-1.5"><Bar pct={d.progressPct} /></div></div>} />
      <MemberBody d={d} />
    </>
  );
}

// 抽出顧問主體（去掉 Hero，避免重複）。
function MemberBody({ d }: { d: MemberHome }) {
  const k = d.kpis;
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3 mb-4">
        <Kpi icon="💵" label="本月收益" value={nt(k.income)} note="示範資料" top="#c99a5b" />
        <Kpi icon="📄" label="本月成交案" value={String(k.deals)} sm="案" note={`目標 ${k.dealsGoal} 案`} />
        <Kpi icon="🌱" label="新增客戶" value={String(k.newClients)} sm="位" top="#8fc0a3" />
        <Kpi icon="✅" label="待辦事項" value={String(k.openItems)} sm="項" note="真實資料" top="#e08a68" />
        <Kpi icon="📅" label="今日約訪" value={String(k.todayAppts)} sm="場" top="#b7c6b0" />
      </div>
      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 items-start">
        <div>
          <Section title="📌 今日待辦與提醒" more="全部待辦">
            {d.todos.length === 0 ? <Empty>今天沒有待辦</Empty> : d.todos.map((t, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                <span className="text-[#e0bd8b] font-extrabold text-[13px] w-11 tabular-nums">{t.time}</span>
                <div className="w-[18px] h-[18px] rounded border-2 border-[#6f869c] shrink-0" />
                <div className="flex-1 min-w-0"><div className="font-bold text-[13.5px]">{t.title}</div><div className="text-[#a7bacb] text-[12px]">{t.sub}</div></div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${TAG[t.tagKind]}`}>{t.tag}</span>
              </div>
            ))}
          </Section>
          <Section title="👥 待關注客戶" more="我的客戶">
            {d.watch.length === 0 ? <Empty>目前沒有待關注客戶</Empty> : d.watch.map((w, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: w.dot === "warn" ? "#e08a68" : w.dot === "ok" ? "#8fc0a3" : "#a9bccf" }} />
                <div className="flex-1 min-w-0"><div className="font-bold text-[13.5px]">{w.name}</div><div className="text-[#a7bacb] text-[12px]">{w.note}</div></div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${TAG[w.tagKind]}`}>{w.tag}</span>
              </div>
            ))}
          </Section>
        </div>
        <div>
          <Section title="🎯 我的目標進度" more="目標競賽">{d.goals.map((g, i) => <Progress key={i} {...g} />)}</Section>
          <Section title="📢 最新公告" more="公告中心">
            {d.announcements.map((a) => (
              <div key={a.id} className="py-2.5 border-b border-white/5 last:border-0">
                <div className="font-bold text-[13.5px] flex gap-2 items-center">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${a.category === "important" ? TAG.warn : a.category === "activity" ? TAG.amber : TAG.mut}`}>{a.category === "important" ? "重要" : a.category === "activity" ? "活動" : "一般"}</span>
                  {a.title}
                </div>
                <div className="text-[#6f869c] text-[11px] mt-1">{a.author}</div>
              </div>
            ))}
          </Section>
          <Section title="🛡️ 合規與學習提醒">
            <div className="flex gap-2.5 flex-wrap">
              <div className="inline-flex items-center gap-1.5 bg-[#12334f] border border-white/10 rounded-lg px-3 py-2 text-[12.5px] text-[#a7bacb]">📇 {d.compliance.licenseNote ?? "證照展延"}</div>
              <div className="inline-flex items-center gap-1.5 bg-[#12334f] border border-white/10 rounded-lg px-3 py-2 text-[12.5px] text-[#a7bacb]">🎓 進修時數 <b className="text-[#eef2f7]">{d.compliance.ceHours} / {d.compliance.ceHoursGoal} 小時</b></div>
              <div className="inline-flex items-center gap-1.5 bg-[#12334f] border border-white/10 rounded-lg px-3 py-2 text-[12.5px] text-[#a7bacb]">🛡️ 適合度問卷待補 <b className="text-[#eef2f7]">{d.compliance.kycPending} 位</b></div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
