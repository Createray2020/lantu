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
  updateReviewAction,
  deleteReviewAction,
  saveConsultRecordAction,
  discardDraftAction,
  createActionItemAction,
  setActionItemDoneAction,
  deleteActionItemAction,
  updateClientAction,
  archiveClientAction,
} from "../../actions";
import { StageGuideModal } from "../../StageGuide";
import Collaborators, { type CollaboratorLite } from "./Collaborators";
import ConsultRecordForm, { type ConsultRecordValue } from "../../ConsultRecordForm";
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
  draft,
  compare,
  readOnly = false,
  isOwner = true,
  collaborators = [],
}: {
  client: ClientLite;
  plans: PlanLite[];
  reviews: ReviewLite[];
  actionItems: ItemLite[];
  draft: DraftLite | null;
  compare: Compare[];
  passportPlan: PassportPlan | null;
  /** 唯讀：使用期限到期，或我是被邀來共同執案的協作教練。所有寫入按鈕都收起來。 */
  readOnly?: boolean;
  /** 我是不是這位客戶的主責教練。只有主責看得到「共同執案」面板。 */
  isOwner?: boolean;
  collaborators?: CollaboratorLite[];
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

      <ClientHeader client={client} onSave={(patch) => run(() => updateClientAction(client.id, patch))} onArchive={() => { if (confirm("確定封存這位客戶？")) run(() => archiveClientAction(client.id)); }} pending={pending} readOnly={readOnly} />

      {isOwner && <Collaborators clientId={client.id} collaborators={collaborators} readOnly={readOnly} />}

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
          readOnly={readOnly}
          onToggle={(id, done) => run(() => setActionItemDoneAction(client.id, id, done))}
        />
      )}

      {tab === "plans" && (
        <Plans
          plans={plans}
          compare={compare}
          pending={pending}
          readOnly={readOnly}
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
          draft={draft}
          pending={pending}
          readOnly={readOnly}
          onAddReview={(input) => run(() => createReviewAction(client.id, input))}
          onSaveDraft={(sessionId, input) => run(async () => { await saveConsultRecordAction(client.id, sessionId, input); })}
          onDiscardDraft={(sessionId) => run(async () => { await discardDraftAction(client.id, sessionId); })}
          onUpdateReview={(id, input) => run(() => updateReviewAction(client.id, id, input))}
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
function ClientHeader({ client, onSave, onArchive, pending, readOnly = false }: { client: ClientLite; onSave: (patch: Partial<ClientLite> & { tags?: string[]; contact?: Contact }) => void; onArchive: () => void; pending: boolean; readOnly?: boolean }) {
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
      {!readOnly && (
        <div className="flex gap-2">
          <button className={btn + " bg-[#0d2b45] text-[#a9bccf] border border-white/10"} onClick={() => setEditing(true)}>編輯</button>
          {client.status !== "archived" && <button className={btn + " text-[#6b7d8f]"} onClick={onArchive}>封存</button>}
        </div>
      )}
    </div>
  );
}

// ── 概況分頁 ───────────────────────────────────────
function Overview({ latest, latestCmp, planCount, nextAppt, reviews, openItems, planYear, passportPlan, readOnly = false, onToggle }: {
  latest: PlanLite | null; latestCmp: Compare | null; planCount: number; nextAppt: string | null; passportPlan: PassportPlan | null;
  reviews: ReviewLite[]; openItems: ItemLite[]; planYear: Map<string, number>; readOnly?: boolean; onToggle: (id: string, done: boolean) => void;
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
                  <input type="checkbox" checked={i.done} disabled={readOnly} onChange={() => onToggle(i.id, !i.done)} className="mt-1 disabled:opacity-50" />
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
function Plans({ plans, compare, pending, readOnly = false, onOpen, onClone, onNew, onStatus, onDelete }: {
  plans: PlanLite[]; compare: Compare[]; pending: boolean; readOnly?: boolean;
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
        {!readOnly && <button className={btn + " bg-[#0d2b45] text-[#a9bccf] border border-white/10 disabled:opacity-60"} disabled={pending} onClick={onNew}>＋ 空白版本</button>}
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
            <select value={p.status} onChange={(e) => onStatus(p.id, e.target.value)} disabled={readOnly} className="bg-[#0a1a2b] border border-white/15 rounded-md text-xs px-2 py-1.5 text-[#a9bccf] disabled:opacity-60">
              {Object.entries(PLAN_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="flex gap-1.5">
              <button className={btn + " bg-[#c99a5b] text-[#08202a]"} onClick={() => onOpen(p.id)}>{readOnly ? "檢視" : "開啟"}</button>
              {!readOnly && <button className={btn + " bg-[#0d2b45] text-[#a9bccf] border border-white/10 disabled:opacity-60"} disabled={pending} onClick={() => onClone(p.id)} title="以此版複製為新的一年">複製為新年度</button>}
              {!readOnly && <button className={btn + " text-[#6b7d8f]"} onClick={() => onDelete(p.id)}>刪除</button>}
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
type DraftLite = { sessionId: string; planId: string | null; endedAt: string | null; draft: string; todos: string[] };

/**
 * 諮詢紀錄分頁 —— 2026/08/28 改成 A 案版面（上下配置、時間軸吃整寬）。
 *
 * 為什麼要改：教練把 AI 整理好的諮詢紀錄整段貼進來，內容被塞進右半欄裡就撐爆版面。
 * 三案並排給 Ray 挑（docs/諮詢紀錄版面_三案原型.html），他選 A：
 * 新增表單收成一顆按鈕，時間軸橫跨整頁，長稿展開時有完整寬度。
 *
 * ⚠️ A 案把動作項目推到最底下，所以頂端補一條「未完成待辦 N 件」——
 *    那是追蹤的核心（儀表板的「逾期未檢視」吃的就是它），不能讓它沉下去看不到。
 */
function Reviews({ clientId, reviews, actionItems, plans, planYear, draft, pending, readOnly = false, onAddReview, onSaveDraft, onDiscardDraft, onUpdateReview, onDeleteReview, onAddItem, onToggleItem, onDeleteItem }: {
  clientId: string; reviews: ReviewLite[]; actionItems: ItemLite[]; plans: PlanLite[]; planYear: Map<string, number>;
  draft: DraftLite | null; pending: boolean; readOnly?: boolean;
  onAddReview: (input: ConsultRecordValue) => void;
  onSaveDraft: (sessionId: string, input: ConsultRecordValue) => void;
  onDiscardDraft: (sessionId: string) => void;
  onUpdateReview: (id: string, input: ConsultRecordValue) => void;
  onDeleteReview: (id: string) => void;
  onAddItem: (input: { title: string; owner: string | null; dueDate: string | null }) => void;
  onToggleItem: (id: string, done: boolean) => void;
  onDeleteItem: (id: string) => void;
}) {
  void clientId;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);

  const [itTitle, setItTitle] = useState("");
  const [itOwner, setItOwner] = useState("");
  const [itDue, setItDue] = useState("");

  const planOpts = plans.map((p) => ({ id: p.id, year: p.year }));
  const openItems = actionItems.filter((i) => !i.done);
  // 收合列只顯示摘要的第一行——時間軸要能一眼掃過去，長稿點開才看。
  const firstLine = (t: string | null) => {
    const l = (t ?? "").split("\n").map((x) => x.trim()).find((x) => x.length > 0) ?? "";
    return l.length > 60 ? l.slice(0, 60) + "…" : l;
  };

  return (
    <div className="grid gap-5">
      {/* ── 草稿提醒：按了結束卻沒存，場次已封但紀錄還沒生出來 ── */}
      {draft && !readOnly && (
        <div className="bg-[#c99a5b]/10 border border-[#c99a5b]/45 rounded-xl px-3.5 py-3 grid gap-2">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
            <span className="text-[#e0bd8b] font-bold">⚠️ {draft.endedAt ?? ""} 那一場的摘要還沒存</span>
            <span className="text-[#6b7d8f] text-[12px]">結束諮詢時產了草稿，但沒有送出成正式紀錄。</span>
            <div className="flex-1" />
            {!draftOpen && (
              <button className={btn + " bg-[#c99a5b] text-[#08202a]"} onClick={() => setDraftOpen(true)}>開啟草稿</button>
            )}
          </div>
          {draftOpen && (
            <ConsultRecordForm
              plans={planOpts}
              initial={{ summary: draft.draft, planId: draft.planId, date: draft.endedAt ?? undefined }}
              todos={draft.todos}
              notice="這是系統依你在各區塊留下的註記與缺口改善產出的草稿。日期、類型、內容都可以改——把整理好的紀錄整段貼上來也可以。"
              submitLabel="存成諮詢紀錄"
              pending={pending}
              onSubmit={(v) => { onSaveDraft(draft.sessionId, v); setDraftOpen(false); }}
              onCancel={() => setDraftOpen(false)}
              onDiscard={() => { onDiscardDraft(draft.sessionId); setDraftOpen(false); }}
            />
          )}
        </div>
      )}

      {/* ── 頂端：待辦提要 ＋ 新增入口 ── */}
      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && !adding && (
          <button className={btn + " bg-[#0d2b45] text-[#a9bccf] border border-white/10"} onClick={() => { setAdding(true); setEditing(null); }}>
            ＋ 新增諮詢
          </button>
        )}
        <span className="text-[12px] text-[#6b7d8f]">補記過去的諮詢也走這裡，日期可以自己選。</span>
        <div className="flex-1" />
        {openItems.length > 0 && (
          <a href="#actionItems" className="text-[12px] text-[#e0bd8b] hover:underline">
            未完成待辦 {openItems.length} 件 ↓
          </a>
        )}
      </div>

      {adding && !readOnly && (
        <ConsultRecordForm
          plans={planOpts}
          submitLabel="新增諮詢"
          pending={pending}
          onSubmit={(v) => { onAddReview(v); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* ── 諮詢時間軸（整寬，全部預設收合）── */}
      <section>
        <h3 className="text-xs uppercase tracking-wider text-[#6b7d8f] mb-2">諮詢時間軸</h3>
        {reviews.length === 0 ? <Empty>尚無諮詢紀錄</Empty> : (
          <div className="grid gap-2">
            {reviews.map((r) => (
              editing === r.id ? (
                <ConsultRecordForm
                  key={r.id}
                  plans={planOpts}
                  initial={r}
                  submitLabel="儲存修改"
                  pending={pending}
                  onSubmit={(v) => { onUpdateReview(r.id, v); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <details key={r.id} className="bg-[#0c2135] border border-white/10 rounded-lg open:border-[#c99a5b]/45">
                  <summary className="list-none cursor-pointer px-3 py-2.5 flex items-center gap-2.5">
                    <span className="text-[#6b7d8f] text-[11px] shrink-0">▸</span>
                    <span className="text-[#e0bd8b] font-bold tabular-nums shrink-0">{r.date}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#0d2b45] text-[#a9bccf] shrink-0">{REVIEW_TYPE_LABEL[r.type] ?? r.type}</span>
                    <span className="text-[12.5px] text-[#6b7d8f] truncate">{firstLine(r.summary)}</span>
                  </summary>
                  <div className="px-3 pb-3 pt-1 border-t border-white/5">
                    <div className="text-[11.5px] text-[#6b7d8f] my-2">
                      {r.attendees ? `出席：${r.attendees}` : "未填出席"}
                      {r.planId && planYear.get(r.planId) ? ` · 對應 ${planYear.get(r.planId)} 版` : ""}
                      {r.nextAppt ? ` · 下次預約 ${r.nextAppt}` : ""}
                    </div>
                    {r.summary
                      ? <div className="text-[13px] text-[#a9bccf] whitespace-pre-wrap leading-relaxed">{r.summary}</div>
                      : <div className="text-[12px] text-[#6b7d8f]">這一筆沒有內容。</div>}
                    {!readOnly && (
                      <div className="flex gap-2 mt-3">
                        <button className="text-[11.5px] px-2.5 py-1 rounded-md border border-white/10 text-[#a9bccf]" onClick={() => { setEditing(r.id); setAdding(false); }}>編輯</button>
                        <button className="text-[11.5px] px-2.5 py-1 rounded-md border border-white/10 text-[#6b7d8f]" onClick={() => onDeleteReview(r.id)}>刪除</button>
                      </div>
                    )}
                  </div>
                </details>
              )
            ))}
          </div>
        )}
      </section>

      {/* ── 動作項目 ── */}
      <section id="actionItems" className="grid gap-3 md:grid-cols-2">
        <div>
          <h3 className="text-xs uppercase tracking-wider text-[#6b7d8f] mb-2">動作項目清單</h3>
          <div className="bg-[#0c2135] border border-white/10 rounded-xl p-3 grid gap-2.5">
            {actionItems.length === 0 && <p className="text-[12px] text-[#6b7d8f]">目前沒有動作項目。</p>}
            {actionItems.map((i) => (
              <label key={i.id} className="flex items-start gap-2 border-t border-white/5 pt-2 first:border-0 first:pt-0">
                <input type="checkbox" checked={i.done} disabled={readOnly} onChange={() => onToggleItem(i.id, !i.done)} className="mt-1 disabled:opacity-50" />
                <span className={"flex-1 text-sm " + (i.done ? "line-through text-[#6b7d8f]" : "")}>
                  {i.title}
                  <span className="block text-[11px] text-[#6b7d8f]">{i.owner ? i.owner + " · " : ""}{i.dueDate ? "期限 " + i.dueDate : "無期限"}</span>
                </span>
                {!readOnly && <button className="text-[#6b7d8f] text-xs" onClick={() => onDeleteItem(i.id)}>刪</button>}
              </label>
            ))}
          </div>
        </div>
        {!readOnly && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-[#6b7d8f] mb-2">新增待辦</h3>
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
            </div>
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
