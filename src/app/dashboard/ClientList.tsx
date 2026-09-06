"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClientListItem, SharedClientItem } from "@/lib/clients";
import type { TemplateListItem } from "@/lib/templates";
import type { QuotaState } from "@/lib/license";
import { QUOTA_FULL_MESSAGE, LICENSE_LOCKED_MESSAGE } from "@/lib/license";
import { createClientAction } from "./actions";
import { copyTemplateAction } from "./templates/actions";
import { StageGuideModal } from "./StageGuide";
import {
  fmtMoney,
  stageColor,
  stageName,
  STATUS_LABEL,
  PLAN_STATUS_LABEL,
  CLIENT_SOURCES,
} from "./format";

type SortKey = "updated" | "next" | "net" | "stage";

export default function ClientList({
  clients,
  shared = [],
  templates = [],
  quota,
  readOnly = false,
}: {
  clients: ClientListItem[];
  /** 別人邀我共同執案的客戶（唯讀）。刻意跟自己的客戶分兩區，也不計入額度。 */
  shared?: SharedClientItem[];
  /** 全公司共用的示範範本（唯讀、不計入額度）。同樣分開一區，理由見下方那一節。 */
  templates?: TemplateListItem[];
  /** 客戶數上限（依級別）。未定級或不限時 cap 為 null。 */
  quota?: QuotaState;
  /** 使用期限到期＝唯讀。 */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [showNew, setShowNew] = useState(false);
  // 財務階段說明浮層：false = 關閉；字串/null = 開啟並高亮該客戶所在階段
  const [guideFor, setGuideFor] = useState<string | null | false>(false);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    clients.forEach((c) => (c.tags ?? []).forEach((t) => s.add(t)));
    return [...s].sort();
  }, [clients]);

  const rows = useMemo(() => {
    let r = clients.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (tag !== "all" && !(c.tags ?? []).includes(tag)) return false;
      if (q.trim()) {
        // 客戶編號一起丟進比對字串：教練對帳／查詢時直接貼編號就能定位。
        const hay = (c.name + " " + (c.code ?? "") + " " + (c.tags ?? []).join(" ") + " " + (c.source ?? "")).toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
    // 階段序：整裝 → 啟程 → 前行 → 遠行；未評估排最後。非優劣排序，是「誰先需要陪伴」。
    const stageRank = (g: string | null | undefined) => ({ D: 1, C: 2, B: 3, A: 4 } as Record<string, number>)[g ?? ""] ?? 9;
    r = [...r].sort((a, b) => {
      if (sort === "net") return (b.latestPlan?.netWorth ?? -1) - (a.latestPlan?.netWorth ?? -1);
      if (sort === "stage") return stageRank(a.latestPlan?.healthGrade) - stageRank(b.latestPlan?.healthGrade);
      if (sort === "next") {
        const av = a.nextAppt ?? "9999";
        const bv = b.nextAppt ?? "9999";
        return av < bv ? -1 : av > bv ? 1 : 0;
      }
      return 0; // updated：後端已按 updatedAt desc
    });
    return r;
  }, [clients, q, status, tag, sort]);

  // 輸入框一律 bg-field（比面板深/淺一階），跟卡片區分開；同檔案的 field 也是同一個 token。
  const sel = "bg-field border border-line2 rounded-md text-sm px-2.5 py-1.5 text-tx";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h1 className="font-serif text-xl tracking-wide mr-1">客戶</h1>
        <span className="text-tx3 text-sm">{rows.length} / {clients.length}</span>
        {quota?.cap != null && (
          <span
            className={`text-xs font-bold px-2 py-1 rounded-md border ${
              quota.full
                ? "border-danger-solid/60 text-danger bg-danger-solid/10"
                : quota.left != null && quota.left <= 3
                  ? "border-brand/60 text-brand2 bg-brand/10"
                  : "border-line2 text-tx2"
            }`}
            title="客戶數上限依教練級別。封存的客戶不計入。"
          >
            額度 {quota.used} / {quota.cap}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setShowNew(true)}
          disabled={readOnly || !!quota?.full}
          title={readOnly ? LICENSE_LOCKED_MESSAGE : quota?.full ? QUOTA_FULL_MESSAGE(quota.cap ?? 0) : ""}
          className="rounded-md bg-brand text-onbrand font-bold text-sm px-3.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ＋ 新增客戶
        </button>
      </div>
      {quota?.full && quota.cap != null && (
        <p className="mb-4 text-xs text-brand2 bg-brand/10 border border-brand/40 rounded-lg px-3 py-2">
          {QUOTA_FULL_MESSAGE(quota.cap)}
        </p>
      )}

      {/* 搜尋與三個下拉是兩件不同的事（找特定一個人／看某一群人），
          舊版全部塞在同一條 gap-2 的 flex 裡、又沒有標籤，只能靠預設 option 的字辨認用途。
          拆成一塊有底色的篩選區，中間用一條線隔開，下拉各自帶前綴標籤。 */}
      <div className="flex flex-wrap items-center gap-3 mb-5 rounded-xl border border-line bg-panel px-3 py-2.5 shadow-e1">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋姓名／編號／標籤／來源"
          aria-label="搜尋客戶"
          className={sel + " flex-1 min-w-[200px]"}
        />
        <span className="hidden sm:block self-stretch w-px bg-line" aria-hidden="true" />
        <span className="text-[11px] font-bold text-tx3 select-none">篩選</span>
        <select aria-label="狀態" value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="all">全部狀態</option>
          <option value="active">進行中</option>
          <option value="pending">待處理</option>
          <option value="archived">已封存</option>
        </select>
        {allTags.length > 0 && (
          <select aria-label="標籤" value={tag} onChange={(e) => setTag(e.target.value)} className={sel}>
            <option value="all">全部標籤</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={sel}>
          <option value="updated">最近更新</option>
          <option value="next">下次預約</option>
          <option value="net">淨值高→低</option>
          <option value="stage">階段（整裝期優先）</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-20 text-tx3">
          <div className="text-4xl mb-3">🗂️</div>
          {clients.length === 0 ? "還沒有客戶，點右上角新增第一位客戶。" : "沒有符合條件的客戶。"}
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="hidden md:grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_0.8fr] gap-3 px-3 text-[11px] uppercase tracking-wider text-tx3">
            <div>客戶</div>
            <div>最新版本</div>
            <div>
              <button
                type="button"
                onClick={() => setGuideFor(null)}
                className="uppercase tracking-wider hover:text-brand2"
                title="看四個階段的定義與判定標準"
              >
                財務階段 <span className="text-brand">ⓘ</span>
              </button>
            </div>
            <div>淨值</div>
            <div>上次／下次諮詢</div>
            <div>狀態</div>
          </div>
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/clients/${c.id}`}
              className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_0.8fr] gap-3 items-center bg-panel hover:bg-panel2 border border-line rounded-lg px-3 py-3 transition shadow-e1"
            >
              <div className="col-span-2 md:col-span-1">
                <div className="font-bold">{c.name}</div>
                {c.code && (
                  <div className="font-mono text-[10px] tracking-wider text-tx3">{c.code}</div>
                )}
                <div className="flex flex-wrap gap-1 mt-1">
                  {(c.tags ?? []).map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-panel text-tx2 border border-line">{t}</span>
                  ))}
                </div>
              </div>
              <div className="text-sm text-tx2">
                {c.latestPlan ? (
                  <>
                    <span className="text-tx">{c.latestPlan.year}</span>
                    <span className="ml-1 text-[11px] text-tx3">{PLAN_STATUS_LABEL[c.latestPlan.status] ?? c.latestPlan.status}</span>
                    {c.planCount > 1 && <span className="ml-1 text-[11px] text-tx3">·{c.planCount}版</span>}
                  </>
                ) : (
                  <span className="text-tx3">—</span>
                )}
              </div>
              <div className="text-[12px] font-bold">
                <span
                  role="button"
                  tabIndex={0}
                  title="點開看這個階段的定義與判定標準"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setGuideFor(c.latestPlan?.healthGrade ?? null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setGuideFor(c.latestPlan?.healthGrade ?? null);
                    }
                  }}
                  className="cursor-pointer underline decoration-dotted underline-offset-4 hover:opacity-80"
                  style={{ color: stageColor(c.latestPlan?.healthGrade) }}
                >
                  {c.latestPlan ? stageName(c.latestPlan.healthGrade) : "—"}
                </span>
              </div>
              <div className="text-sm tabular-nums text-tx">{fmtMoney(c.latestPlan?.netWorth ?? null)}</div>
              <div className="text-[12px] text-tx2">
                <div>上次 {c.lastReviewDate ?? "—"}</div>
                <div className={c.nextAppt ? "text-brand2" : "text-tx3"}>下次 {c.nextAppt ?? "—"}</div>
              </div>
              <div className="text-[12px] text-tx2">{STATUS_LABEL[c.status] ?? c.status}</div>
            </Link>
          ))}
        </div>
      )}

      {shared.length > 0 && (
        <section className="mt-8 pt-6 border-t border-line">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-serif text-lg tracking-wide">共同執案</h2>
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-info/50 text-info bg-info/10 font-bold">唯讀</span>
            <span className="text-tx3 text-sm">{shared.length}</span>
          </div>
          <p className="text-[12px] text-tx3 mb-3">其他教練邀請你一起看的客戶。你看得到全部資料與報告書，但不能修改，也不計入你的客戶數上限。</p>
          <div className="grid gap-2">
            {shared.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/clients/${c.id}`}
                className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-3 items-center bg-panel hover:bg-panel2 border border-info/25 rounded-lg px-3 py-3 transition shadow-e1"
              >
                <div className="col-span-2 md:col-span-1">
                  <div className="font-bold">{c.name}</div>
                  {c.code && <div className="font-mono text-[10px] tracking-wider text-tx3">{c.code}</div>}
                </div>
                <div className="text-[12px] text-tx2">主責 {c.ownerName ?? "—"}</div>
                <div className="text-sm text-tx2">
                  {c.latestPlan ? (
                    <>
                      <span className="text-tx">{c.latestPlan.year}</span>
                      {c.planCount > 1 && <span className="ml-1 text-[11px] text-tx3">·{c.planCount}版</span>}
                    </>
                  ) : (
                    <span className="text-tx3">—</span>
                  )}
                </div>
                <div className="text-[12px] font-bold" style={{ color: stageColor(c.latestPlan?.healthGrade) }}>
                  {c.latestPlan ? stageName(c.latestPlan.healthGrade) : "—"}
                </div>
                <div className="text-sm tabular-nums text-tx">{fmtMoney(c.latestPlan?.netWorth ?? null)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {templates.length > 0 && (
        <TemplateShelf templates={templates} quota={quota} readOnly={readOnly} />
      )}

      {guideFor !== false && <StageGuideModal current={guideFor} onClose={() => setGuideFor(false)} />}

      {showNew && <NewClientDialog onClose={() => setShowNew(false)} onCreated={(id) => router.push(`/dashboard/clients/${id}`)} />}
    </div>
  );

  // 內嵌新增客戶對話框
  function NewClientDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
    const [name, setName] = useState("");
    const [source, setSource] = useState("");
    const [sourceNote, setSourceNote] = useState("");
    const [tags, setTags] = useState("");
    const [phone, setPhone] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [err, setErr] = useState("");
    const [pending, start] = useTransition();

    const field = "w-full bg-field border border-line2 rounded-md text-sm px-3 py-2 text-tx";

    function submit() {
      if (!name.trim()) {
        setErr("請填客戶姓名");
        return;
      }
      setErr("");
      const finalSource =
        source === "其他"
          ? sourceNote.trim()
            ? `其他：${sourceNote.trim()}`
            : "其他"
          : source || null;
      start(async () => {
        try {
          const r = await createClientAction({
            name: name.trim(),
            source: finalSource,
            tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
            contact: phone ? { phone } : {},
            birthDate: birthDate || null,
          });
          // 額度已滿／期限到期是「使用者要看到理由」的情況，原樣顯示伺服器的訊息。
          if (!r.ok) setErr(r.error);
          else onCreated(r.id);
        } catch {
          setErr("建立失敗，請重試。");
        }
      });
    }

    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-scrim/60 px-4" onClick={onClose}>
        <div className="w-full max-w-md bg-panel border border-line2 rounded-xl p-5 shadow-e3" onClick={(e) => e.stopPropagation()}>
          <h2 className="font-serif text-lg mb-4">新增客戶</h2>
          <div className="grid gap-3">
            <div>
              <label className="text-xs text-tx2">姓名 *</label>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-xs text-tx2">來源</label>
              <select className={field} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">—</option>
                {CLIENT_SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {source === "其他" && (
                <input
                  className={field + " mt-2"}
                  value={sourceNote}
                  onChange={(e) => setSourceNote(e.target.value)}
                  placeholder="請說明其他來源（選填）"
                  autoFocus
                />
              )}
            </div>
            <div>
              <label className="text-xs text-tx2">標籤（逗號分隔）</label>
              <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="VIP, 轉介" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-tx2">電話</label>
                <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-tx2">生日</label>
                <input type="date" className={field} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
            </div>
            {err && <div className="text-danger text-sm">{err}</div>}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-tx2">取消</button>
            <button onClick={submit} disabled={pending} className="px-4 py-1.5 text-sm font-bold rounded-md bg-brand text-onbrand disabled:opacity-60">
              {pending ? "建立中…" : "建立並開始"}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * 示範範本區。
 *
 * ⚠️ 刻意**不併進上面的客戶清單**：那份清單的每一列都是「我的客戶」——有編號、
 *    計入額度、點進去可以改。範本三件事都不是。混在一起的第一個後果是教練把它
 *    當成自己的客戶開始編輯，然後發現存不進去；第二個後果更糟——他會以為
 *    自己的額度被系統莫名其妙吃掉了幾個。
 */
function TemplateShelf({
  templates,
  quota,
  readOnly,
}: {
  templates: TemplateListItem[];
  quota?: QuotaState;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // 哪一份正在複製：整區共用一個 disabled 會讓四顆按鈕一起變灰，看起來像壞掉。
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const blocked = readOnly
    ? LICENSE_LOCKED_MESSAGE
    : quota?.full && quota.cap != null
      ? QUOTA_FULL_MESSAGE(quota.cap)
      : "";

  return (
    <section className="mt-8 pt-6 border-t border-line">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-serif text-lg tracking-wide">示範範本</h2>
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-brand/50 text-brand2 bg-brand/10 font-bold">唯讀</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-line2 text-tx2 font-bold">不計入額度</span>
        <span className="text-tx3 text-sm">{templates.length}</span>
      </div>
      <p className="text-[12px] text-tx3 mb-3">
        坐在客戶旁邊翻給他看的示範個案，全公司教練共用同一份，誰都改不了。
        想拿某一份當起點做試算，按「複製一份給自己」——複製出來的那位就是你名下的一般客戶，
        可以隨意修改，並且會計入你的客戶數。
      </p>

      {err && (
        <div role="alert" className="mb-3 text-sm text-danger bg-danger-solid/15 border border-danger-solid/40 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      <div className="grid gap-2">
        {templates.map((t) => (
          <div
            key={t.id}
            className="grid grid-cols-1 md:grid-cols-[1.8fr_1fr_1fr_auto] gap-3 items-center bg-panel border border-brand/25 rounded-lg px-3 py-3 shadow-e1"
          >
            <div className="min-w-0">
              <Link href={`/dashboard/templates/${t.id}`} className="font-bold hover:text-brand2">
                {t.name}
              </Link>
              {t.templateLabel && (
                <div className="text-[11px] text-tx2 mt-0.5">{t.templateLabel}</div>
              )}
            </div>
            <div className="text-[12px] font-bold" style={{ color: stageColor(t.healthGrade) }}>
              {t.healthGrade ? stageName(t.healthGrade) : "—"}
            </div>
            <div className="text-sm tabular-nums text-tx">{fmtMoney(t.netWorth ?? null)}</div>
            <div className="flex items-center gap-2 justify-end">
              <Link
                href={`/dashboard/templates/${t.id}`}
                className="text-xs rounded-md border border-line2 text-tx2 px-2.5 py-1.5 hover:bg-panel3"
              >
                翻給客戶看
              </Link>
              <button
                type="button"
                disabled={pending || !!blocked}
                title={blocked}
                onClick={() => {
                  setErr("");
                  setBusy(t.id);
                  start(async () => {
                    try {
                      const r = await copyTemplateAction(t.id);
                      if (!r.ok) { setErr(r.error); return; }
                      // 複製完直接進去——他要的是「用這份開始做」，不是回清單再找一次。
                      router.push(`/dashboard/clients/${r.clientId}`);
                    } catch {
                      setErr("複製失敗，請重試。");
                    } finally {
                      setBusy(null);
                    }
                  });
                }}
                className="text-xs font-bold rounded-md border border-brand/50 text-brand2 px-2.5 py-1.5 hover:bg-brand/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy === t.id && pending ? "複製中…" : "複製一份給自己"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
