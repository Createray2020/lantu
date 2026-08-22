"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  clonePlanAction,
  createPlanAction,
  updatePlanMetaAction,
  deletePlanAction,
  createReviewAction,
  deleteReviewAction,
  createActionItemAction,
  setActionItemDoneAction,
  deleteActionItemAction,
  updateClientAction,
  archiveClientAction,
} from "../../actions";
import { StageGuideModal } from "../../StageGuide";
import {
  fmtMoney,
  stageColor,
  stageName,
  stageTask,
  STATUS_LABEL,
  PLAN_STATUS_LABEL,
  REVIEW_TYPE_LABEL,
  REVIEW_TYPES,
  CLIENT_SOURCES,
} from "../../format";

type Contact = { phone?: string; email?: string; line?: string };
type ClientLite = { id: string; name: string; contact: Contact; source: string | null; tags: string[]; status: string; birthDate: string | null };
type PassportPlan = { id: string; year: number; healthGrade: string | null; netWorth: number | null; updatedAt: string | null };
type PlanLite = { id: string; year: number; label: string | null; status: string; healthGrade: string | null; netWorth: number | null; basedOnDate: string | null; updatedAt: string | null };
type ReviewLite = { id: string; date: string; type: string; planId: string | null; attendees: string | null; summary: string | null; nextAppt: string | null };
type ItemLite = { id: string; title: string; owner: string | null; dueDate: string | null; done: boolean; reviewId: string | null };
// 數字欄位可能是 null＝「這一版的 data 算不出來」，畫面顯示「—」而不是假的 0。
type Compare = { id: string; year: number; label: string | null; status: string; net: number | null; assetTotal: number | null; debtTotal: number | null; incTotal: number | null; expTotal: number | null; save: number | null; gap: number | null; grade: string | null; safety: number | null; freedom: number | null; vision: number | null };

const field = "w-full bg-[#0a1a2b] border border-white/15 rounded-md text-sm px-3 py-2 text-[#eef2f7]";
const btn = "px-3 py-1.5 text-sm font-bold rounded-md";
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ClientDetail({
  client,
  plans,
  passportPlan,
  reviews,
  actionItems,
  compare,
}: {
  client: ClientLite;
  plans: PlanLite[];
  reviews: ReviewLite[];
  actionItems: ItemLite[];
  compare: Compare[];
  passportPlan: PassportPlan | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "plans" | "reviews">("overview");
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  function run(fn: () => Promise<unknown>, after?: (r: unknown) => void) {
    setErr("");
    start(async () => {
      try {
        const r = await fn();
        if (after) after(r);
        else router.refresh();
      } catch {
        setErr("操作失敗，請重試。");
      }
    });
  }

  const latest = plans[0] ?? null;
  const latestCmp = useMemo(() => compare.find((c) => c.id === latest?.id) ?? null, [compare, latest]);
  const planYear = useMemo(() => new Map(plans.map((p) => [p.id, p.year])), [plans]);
  const openItems = actionItems.filter((i) => !i.done);
  const nextAppt = useMemo(() => {
    const t = todayISO();
    return reviews.map((r) => r.nextAppt).filter((d): d is string => !!d && d >= t).sort()[0] ?? null;
  }, [reviews]);

  const tabBtn = (k: typeof tab) =>
    `px-4 py-2 text-sm font-bold border-b-2 transition ${
      tab === k ? "border-[#c99a5b] text-[#eef2f7]" : "border-transparent text-[#6b7d8f] hover:text-[#a9bccf]"
    }`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
      <div className="flex items-center gap-2 text-sm text-[#6b7d8f] mb-3">
        <Link href="/dashboard/clients" className="hover:text-[#a9bccf]">客戶</Link>
        <span>/</span>
        <span className="text-[#a9bccf]">{client.name}</span>
      </div>

      <ClientHeader client={client} onSave={(patch) => run(() => updateClientAction(client.id, patch))} onArchive={() => { if (confirm("確定封存這位客戶？")) run(() => archiveClientAction(client.id)); }} pending={pending} />

      {err && <div className="mt-3 text-[#d9773f] text-sm">{err}</div>}

      <div className="flex gap-1 border-b border-white/10 mt-4 mb-5">
        <button className={tabBtn("overview")} onClick={() => setTab("overview")}>概況</button>
        <button className={tabBtn("plans")} onClick={() => setTab("plans")}>年度版本</button>
        <button className={tabBtn("reviews")} onClick={() => setTab("reviews")}>諮詢紀錄</button>
      </div>

      {tab === "overview" && (
        <Overview
          latest={latest}
          latestCmp={latestCmp}
          planCount={plans.length}
          nextAppt={nextAppt}
          reviews={reviews}
          openItems={openItems}
          planYear={planYear}
          passportPlan={passportPlan}
          onToggle={(id, done) => run(() => setActionItemDoneAction(client.id, id, done))}
        />
      )}

      {tab === "plans" && (
        <Plans
          plans={plans}
          compare={compare}
          pending={pending}
          onOpen={(id) => router.push(`/dashboard/plans/${id}/edit`)}
          onClone={(id) => run(() => clonePlanAction(id), (r) => router.push(`/dashboard/plans/${r as string}/edit`))}
          onNew={() => run(() => createPlanAction(client.id, client.name), (r) => router.push(`/dashboard/plans/${r as string}/edit`))}
          onStatus={(id, status) => run(() => updatePlanMetaAction(client.id, id, { status }))}
          onDelete={(id) => { if (confirm("刪除此年度版本？此動作無法復原。")) run(() => deletePlanAction(client.id, id)); }}
        />
      )}

      {tab === "reviews" && (
        <Reviews
          clientId={client.id}
          reviews={reviews}
          actionItems={actionItems}
          plans={plans}
          planYear={planYear}
          pending={pending}
          onAddReview={(input) => run(() => createReviewAction(client.id, input))}
          onDeleteReview={(id) => { if (confirm("刪除此諮詢紀錄？")) run(() => deleteReviewAction(client.id, id)); }}
          onAddItem={(input) => run(() => createActionItemAction(client.id, input))}
          onToggleItem={(id, done) => run(() => setActionItemDoneAction(client.id, id, done))}
          onDeleteItem={(id) => run(() => deleteActionItemAction(client.id, id))}
        />
      )}
    </div>
  );
}

// ── 客戶標頭（含編輯） ─────────────────────────────
function ClientHeader({ client, onSave, onArchive, pending }: { client: ClientLite; onSave: (patch: Partial<ClientLite> & { tags?: string[]; contact?: Contact }) => void; onArchive: () => void; pending: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [source, setSource] = useState((client.source ?? "").startsWith("其他") ? "其他" : (client.source ?? ""));
  const [sourceNote, setSourceNote] = useState((client.source ?? "").startsWith("其他：") ? (client.source as string).slice(3) : "");
  const [tags, setTags] = useState((client.tags ?? []).join(", "));
  const [phone, setPhone] = useState(client.contact?.phone ?? "");
  const [email, setEmail] = useState(client.contact?.email ?? "");
  const [line, setLine] = useState(client.contact?.line ?? "");
  const [birthDate, setBirthDate] = useState(client.birthDate ?? "");

  if (editing) {
    return (
      <div className="bg-[#0c2135] border border-white/15 rounded-xl p-4 grid gap-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-[#a9bccf]">姓名</label><input className={field} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="text-xs text-[#a9bccf]">生日</label><input type="date" className={field} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></div>
          <div><label className="text-xs text-[#a9bccf]">來源</label><select className={field} value={source} onChange={(e) => setSource(e.target.value)}><option value="">—</option>{CLIENT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select>{source === "其他" && <input className={field + " mt-2"} value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} placeholder="請說明其他來源（選填）" />}</div>
          <div className="sm:col-span-2"><label className="text-xs text-[#a9bccf]">標籤（逗號分隔）</label><input className={field} value={tags} onChange={(e) => setTags(e.target.value)} /></div>
          <div><label className="text-xs text-[#a9bccf]">電話</label><input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><label className="text-xs text-[#a9bccf]">Email</label><input className={field} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><label className="text-xs text-[#a9bccf]">LINE</label><input className={field} value={line} onChange={(e) => setLine(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <button className={btn + " text-[#a9bccf]"} onClick={() => setEditing(false)}>取消</button>
          <button
            className={btn + " bg-[#c99a5b] text-[#08202a] disabled:opacity-60"}
            disabled={pending}
            onClick={() => {
              onSave({
                name: name.trim() || client.name,
                source: source === "其他" ? (sourceNote.trim() ? `其他：${sourceNote.trim()}` : "其他") : source || null,
                tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
                contact: { phone, email, line },
                birthDate: birthDate || null,
              });
              setEditing(false);
            }}
          >
            儲存
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0c2135] border border-white/10 rounded-xl p-4 flex flex-wrap items-start gap-3">
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-2xl">{client.name}</h1>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#0d2b45] text-[#a9bccf] border border-white/10">{STATUS_LABEL[client.status] ?? client.status}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {client.source && <span className="text-[11px] text-[#6b7d8f]">來源 {client.source}</span>}
          {(client.tags ?? []).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#0d2b45] text-[#a9bccf] border border-white/10">{t}</span>)}
        </div>
        <div className="text-[12px] text-[#6b7d8f] mt-2 flex flex-wrap gap-x-4">
          {client.contact?.phone && <span>☎ {client.contact.phone}</span>}
          {client.contact?.email && <span>✉ {client.contact.email}</span>}
          {client.contact?.line && <span>LINE {client.contact.line}</span>}
          {client.birthDate && <span>🎂 {client.birthDate}</span>}
        </div>
      </div>
      <div className="flex gap-2">
        <button className={btn + " bg-[#0d2b45] text-[#a9bccf] border border-white/10"} onClick={() => setEditing(true)}>編輯</button>
        {client.status !== "archived" && <button className={btn + " text-[#6b7d8f]"} onClick={onArchive}>封存</button>}
      </div>
    </div>
  );
}

// ── 概況分頁 ───────────────────────────────────────
function Overview({ latest, latestCmp, planCount, nextAppt, reviews, openItems, planYear, passportPlan, onToggle }: {
  latest: PlanLite | null; latestCmp: Compare | null; planCount: number; nextAppt: string | null; passportPlan: PassportPlan | null;
  reviews: ReviewLite[]; openItems: ItemLite[]; planYear: Map<string, number>; onToggle: (id: string, done: boolean) => void;
}) {
  const [showStageGuide, setShowStageGuide] = useState(false);
  return (
    <div className="grid gap-5">
      {showStageGuide && <StageGuideModal current={latest?.healthGrade ?? null} onClose={() => setShowStageGuide(false)} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="財務階段">
          <div className="flex items-end gap-2">
            <span className="text-2xl font-extrabold leading-none tracking-wide" style={{ color: stageColor(latest?.healthGrade) }} title={stageTask(latest?.healthGrade)}>{latest ? stageName(latest.healthGrade) : "—"}</span>
            {latestCmp && (
              <span className="text-[11px] text-[#6b7d8f] leading-tight">安 {latestCmp.safety ?? "—"}<br />由 {latestCmp.freedom ?? "—"} · 願 {latestCmp.vision ?? "—"}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowStageGuide(true)}
            className="mt-1.5 text-[11px] text-[#a9bccf] underline decoration-dotted underline-offset-4 hover:text-[#e0bd8b]"
          >
            這個階段是怎麼判定的 ⓘ
          </button>
        </Card>
        <Card label="淨值"><span className="text-2xl font-bold tabular-nums">{fmtMoney(latest?.netWorth ?? null)}</span></Card>
        <Card label="年度版本"><span className="text-2xl font-bold">{planCount}<span className="text-sm text-[#6b7d8f]"> 版</span></span></Card>
        <Card label="下次預約"><span className={"text-xl font-bold " + (nextAppt ? "text-[#e0bd8b]" : "text-[#6b7d8f]")}>{nextAppt ?? "—"}</span></Card>
      </div>

      {passportPlan && (
        <div className="rounded-xl border border-[#c99a5b]/30 bg-[#0d2b45] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.18em] text-[#c99a5b] mb-0.5">客戶自己的規劃</div>
            <div className="text-sm text-[#cdd9e5]">
              這位客戶做過<b className="text-[#e0bd8b]"> 人生護照 </b>
              {passportPlan.updatedAt && <span className="text-[#6b7d8f]">（最後更新 {passportPlan.updatedAt}）</span>}
            </div>
            <div className="text-[11px] text-[#6b7d8f] mt-0.5">這份屬於客戶，你可以看、不能改。</div>
          </div>
          <Link
            href={`/dashboard/plans/${passportPlan.id}/history`}
            className="shrink-0 text-[13px] text-[#a9bccf] hover:text-white border border-white/15 rounded-lg px-3 py-1.5"
          >
            看版本紀錄 →
          </Link>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <section>
          <h3 className="text-xs uppercase tracking-wider text-[#6b7d8f] mb-2">近期諮詢</h3>
          {reviews.length === 0 ? <Empty>尚無諮詢紀錄</Empty> : (
            <div className="grid gap-2">
              {reviews.slice(0, 5).map((r) => (
                <div key={r.id} className="bg-[#0c2135] border border-white/10 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[#e0bd8b]">{r.date}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#0d2b45] text-[#a9bccf]">{REVIEW_TYPE_LABEL[r.type] ?? r.type}</span>
                    {r.planId && planYear.get(r.planId) && <span className="text-[11px] text-[#6b7d8f]">對應 {planYear.get(r.planId)} 版</span>}
                  </div>
                  {r.summary && <div className="text-[13px] text-[#a9bccf] mt-1 whitespace-pre-wrap">{r.summary}</div>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wider text-[#6b7d8f] mb-2">待辦事項</h3>
          {openItems.length === 0 ? <Empty>沒有待辦</Empty> : (
            <div className="grid gap-2">
              {openItems.map((i) => (
                <label key={i.id} className="flex items-start gap-2 bg-[#0c2135] border border-white/10 rounded-lg px-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={i.done} onChange={() => onToggle(i.id, !i.done)} className="mt-1" />
                  <span className="flex-1 text-sm">
                    {i.title}
                    <span className="block text-[11px] text-[#6b7d8f]">{i.owner ? i.owner + " · " : ""}{i.dueDate ? "期限 " + i.dueDate : "無期限"}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── 年度版本分頁 ───────────────────────────────────
function Plans({ plans, compare, pending, onOpen, onClone, onNew, onStatus, onDelete }: {
  plans: PlanLite[]; compare: Compare[]; pending: boolean;
  onOpen: (id: string) => void; onClone: (id: string) => void; onNew: () => void;
  onStatus: (id: string, status: string) => void; onDelete: (id: string) => void;
}) {
  const rows: { key: string; label: string; fmt: (c: Compare) => string; color?: (c: Compare) => string }[] = [
    { key: "grade", label: "財務階段", fmt: (c) => (c.grade ? stageName(c.grade) : "—"), color: (c) => stageColor(c.grade) },
    { key: "net", label: "淨值", fmt: (c) => fmtMoney(c.net) },
    { key: "assetTotal", label: "總資產", fmt: (c) => fmtMoney(c.assetTotal) },
    { key: "debtTotal", label: "總負債", fmt: (c) => fmtMoney(c.debtTotal) },
    { key: "incTotal", label: "年收入", fmt: (c) => fmtMoney(c.incTotal) },
    { key: "expTotal", label: "年支出", fmt: (c) => fmtMoney(c.expTotal) },
    { key: "save", label: "年結餘", fmt: (c) => fmtMoney(c.save) },
    { key: "gap", label: "保障缺口", fmt: (c) => fmtMoney(c.gap) },
    { key: "safety", label: "安全度", fmt: (c) => (c.safety ?? "—") + "" },
    { key: "freedom", label: "自由度", fmt: (c) => (c.freedom ?? "—") + "" },
    { key: "vision", label: "願景達成", fmt: (c) => (c.vision ?? "—") + "" },
  ];

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2">
        <h3 className="text-xs uppercase tracking-wider text-[#6b7d8f]">年度版本</h3>
        <div className="flex-1" />
        <button className={btn + " bg-[#0d2b45] text-[#a9bccf] border border-white/10 disabled:opacity-60"} disabled={pending} onClick={onNew}>＋ 空白版本</button>
      </div>

      <div className="grid gap-2">
        {plans.map((p, idx) => (
          <div key={p.id} className="bg-[#0c2135] border border-white/10 rounded-lg px-3 py-3 flex flex-wrap items-center gap-3">
            <div className="w-16">
              <div className="text-lg font-bold">{p.year}</div>
              {idx === 0 && <div className="text-[10px] text-[#7bbf6a]">最新</div>}
            </div>
            <div className="text-[12px] font-bold w-16 text-center" style={{ color: stageColor(p.healthGrade) }}>{stageName(p.healthGrade)}</div>
            <div className="text-sm tabular-nums w-28">{fmtMoney(p.netWorth)}</div>
            <div className="text-[11px] text-[#6b7d8f] flex-1 min-w-[120px]">{p.label} · 依據 {p.basedOnDate ?? "—"} · 更新 {p.updatedAt ?? "—"}</div>
            <select value={p.status} onChange={(e) => onStatus(p.id, e.target.value)} className="bg-[#0a1a2b] border border-white/15 rounded-md text-xs px-2 py-1.5 text-[#a9bccf]">
              {Object.entries(PLAN_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="flex gap-1.5">
              <button className={btn + " bg-[#c99a5b] text-[#08202a]"} onClick={() => onOpen(p.id)}>開啟</button>
              <button className={btn + " bg-[#0d2b45] text-[#a9bccf] border border-white/10 disabled:opacity-60"} disabled={pending} onClick={() => onClone(p.id)} title="以此版複製為新的一年">複製為新年度</button>
              <button className={btn + " text-[#6b7d8f]"} onClick={() => onDelete(p.id)}>刪除</button>
            </div>
          </div>
        ))}
      </div>

      {compare.length >= 2 && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-[#6b7d8f] mb-2">版本比較（歷年對照）</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-[#6b7d8f] font-normal px-3 py-2 sticky left-0 bg-[#081a2b]">指標</th>
                  {compare.map((c) => (
                    <th key={c.id} className="text-right px-3 py-2 whitespace-nowrap">{c.year}<span className="block text-[10px] text-[#6b7d8f] font-normal">{PLAN_STATUS_LABEL[c.status] ?? c.status}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-white/5">
                    <td className="text-[#a9bccf] px-3 py-2 sticky left-0 bg-[#081a2b] whitespace-nowrap">{row.label}</td>
                    {compare.map((c) => (
                      <td key={c.id} className="text-right px-3 py-2 tabular-nums" style={row.color ? { color: row.color(c), fontWeight: 700 } : undefined}>{row.fmt(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ── 諮詢紀錄分頁 ───────────────────────────────────
function Reviews({ clientId, reviews, actionItems, plans, planYear, pending, onAddReview, onDeleteReview, onAddItem, onToggleItem, onDeleteItem }: {
  clientId: string; reviews: ReviewLite[]; actionItems: ItemLite[]; plans: PlanLite[]; planYear: Map<string, number>; pending: boolean;
  onAddReview: (input: { date: string; type: string; planId: string | null; attendees: string | null; summary: string | null; nextAppt: string | null }) => void;
  onDeleteReview: (id: string) => void;
  onAddItem: (input: { title: string; owner: string | null; dueDate: string | null }) => void;
  onToggleItem: (id: string, done: boolean) => void;
  onDeleteItem: (id: string) => void;
}) {
  void clientId;
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState("review");
  const [planId, setPlanId] = useState("");
  const [attendees, setAttendees] = useState("");
  const [summary, setSummary] = useState("");
  const [nextAppt, setNextAppt] = useState("");

  const [itTitle, setItTitle] = useState("");
  const [itOwner, setItOwner] = useState("");
  const [itDue, setItDue] = useState("");

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <section className="grid gap-3">
        <h3 className="text-xs uppercase tracking-wider text-[#6b7d8f]">新增諮詢</h3>
        <div className="bg-[#0c2135] border border-white/10 rounded-xl p-3 grid gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[11px] text-[#a9bccf]">日期</label><input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label className="text-[11px] text-[#a9bccf]">類型</label><select className={field} value={type} onChange={(e) => setType(e.target.value)}>{REVIEW_TYPES.map((t) => <option key={t} value={t}>{REVIEW_TYPE_LABEL[t]}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[11px] text-[#a9bccf]">對應版本</label><select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">—</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.year} 版</option>)}</select></div>
            <div><label className="text-[11px] text-[#a9bccf]">下次預約</label><input type="date" className={field} value={nextAppt} onChange={(e) => setNextAppt(e.target.value)} /></div>
          </div>
          <div><label className="text-[11px] text-[#a9bccf]">出席</label><input className={field} value={attendees} onChange={(e) => setAttendees(e.target.value)} /></div>
          <div><label className="text-[11px] text-[#a9bccf]">摘要</label><textarea className={field + " min-h-[64px]"} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          <button
            className={btn + " bg-[#c99a5b] text-[#08202a] disabled:opacity-60"}
            disabled={pending || !date}
            onClick={() => {
              onAddReview({ date, type, planId: planId || null, attendees: attendees || null, summary: summary || null, nextAppt: nextAppt || null });
              setAttendees(""); setSummary(""); setNextAppt("");
            }}
          >
            新增諮詢
          </button>
        </div>

        <h3 className="text-xs uppercase tracking-wider text-[#6b7d8f] mt-2">動作項目</h3>
        <div className="bg-[#0c2135] border border-white/10 rounded-xl p-3 grid gap-2.5">
          <input className={field} value={itTitle} onChange={(e) => setItTitle(e.target.value)} placeholder="事項" />
          <div className="grid grid-cols-2 gap-2">
            <input className={field} value={itOwner} onChange={(e) => setItOwner(e.target.value)} placeholder="負責人" />
            <input type="date" className={field} value={itDue} onChange={(e) => setItDue(e.target.value)} />
          </div>
          <button
            className={btn + " bg-[#0d2b45] text-[#a9bccf] border border-white/10 disabled:opacity-60"}
            disabled={pending || !itTitle.trim()}
            onClick={() => { onAddItem({ title: itTitle.trim(), owner: itOwner || null, dueDate: itDue || null }); setItTitle(""); setItOwner(""); setItDue(""); }}
          >
            ＋ 新增待辦
          </button>
          {actionItems.map((i) => (
            <label key={i.id} className="flex items-start gap-2 border-t border-white/5 pt-2">
              <input type="checkbox" checked={i.done} onChange={() => onToggleItem(i.id, !i.done)} className="mt-1" />
              <span className={"flex-1 text-sm " + (i.done ? "line-through text-[#6b7d8f]" : "")}>
                {i.title}
                <span className="block text-[11px] text-[#6b7d8f]">{i.owner ? i.owner + " · " : ""}{i.dueDate ? "期限 " + i.dueDate : "無期限"}</span>
              </span>
              <button className="text-[#6b7d8f] text-xs" onClick={() => onDeleteItem(i.id)}>刪</button>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-[#6b7d8f] mb-2">諮詢時間軸</h3>
        {reviews.length === 0 ? <Empty>尚無諮詢紀錄</Empty> : (
          <div className="grid gap-2">
            {reviews.map((r) => (
              <div key={r.id} className="bg-[#0c2135] border border-white/10 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[#e0bd8b] font-bold">{r.date}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#0d2b45] text-[#a9bccf]">{REVIEW_TYPE_LABEL[r.type] ?? r.type}</span>
                  {r.planId && planYear.get(r.planId) && <span className="text-[11px] text-[#6b7d8f]">對應 {planYear.get(r.planId)} 版</span>}
                  <div className="flex-1" />
                  <button className="text-[#6b7d8f] text-xs" onClick={() => onDeleteReview(r.id)}>刪除</button>
                </div>
                {r.attendees && <div className="text-[12px] text-[#6b7d8f] mt-1">出席：{r.attendees}</div>}
                {r.summary && <div className="text-[13px] text-[#a9bccf] mt-1 whitespace-pre-wrap">{r.summary}</div>}
                {r.nextAppt && <div className="text-[12px] text-[#e0bd8b] mt-1">下次預約 {r.nextAppt}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0c2135] border border-white/10 rounded-xl px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[#6b7d8f] mb-1.5">{label}</div>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[#6b7d8f] text-sm bg-[#0c2135] border border-white/10 rounded-lg px-3 py-6 text-center">{children}</div>;
}
