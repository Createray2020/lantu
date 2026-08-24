"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClientListItem } from "@/lib/clients";
import type { QuotaState } from "@/lib/license";
import { QUOTA_FULL_MESSAGE, LICENSE_LOCKED_MESSAGE } from "@/lib/license";
import { createClientAction } from "./actions";
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
  quota,
  readOnly = false,
}: {
  clients: ClientListItem[];
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

  const sel = "bg-[#0d2b45] border border-white/15 rounded-md text-sm px-2.5 py-1.5 text-[#eef2f7]";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h1 className="font-serif text-xl tracking-wide mr-1">客戶</h1>
        <span className="text-[#6b7d8f] text-sm">{rows.length} / {clients.length}</span>
        {quota?.cap != null && (
          <span
            className={`text-xs font-bold px-2 py-1 rounded-md border ${
              quota.full
                ? "border-[#e5484d]/60 text-[#ff9d9f] bg-[#e5484d]/10"
                : quota.left != null && quota.left <= 3
                  ? "border-[#c99a5b]/60 text-[#e0bd8b] bg-[#c99a5b]/10"
                  : "border-white/15 text-[#a9bccf]"
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
          className="rounded-md bg-[#c99a5b] text-[#08202a] font-bold text-sm px-3.5 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ＋ 新增客戶
        </button>
      </div>
      {quota?.full && quota.cap != null && (
        <p className="mb-4 text-xs text-[#e0bd8b] bg-[#c99a5b]/10 border border-[#c99a5b]/40 rounded-lg px-3 py-2">
          {QUOTA_FULL_MESSAGE(quota.cap)}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋姓名／編號／標籤／來源"
          className={sel + " flex-1 min-w-[180px]"}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="all">全部狀態</option>
          <option value="active">進行中</option>
          <option value="pending">待處理</option>
          <option value="archived">已封存</option>
        </select>
        {allTags.length > 0 && (
          <select value={tag} onChange={(e) => setTag(e.target.value)} className={sel}>
            <option value="all">全部標籤</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={sel}>
          <option value="updated">最近更新</option>
          <option value="next">下次預約</option>
          <option value="net">淨值高→低</option>
          <option value="stage">階段（整裝期優先）</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-20 text-[#6b7d8f]">
          <div className="text-4xl mb-3">🗂️</div>
          {clients.length === 0 ? "還沒有客戶，點右上角新增第一位客戶。" : "沒有符合條件的客戶。"}
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="hidden md:grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_0.8fr] gap-3 px-3 text-[11px] uppercase tracking-wider text-[#6b7d8f]">
            <div>客戶</div>
            <div>最新版本</div>
            <div>
              <button
                type="button"
                onClick={() => setGuideFor(null)}
                className="uppercase tracking-wider hover:text-[#e0bd8b]"
                title="看四個階段的定義與判定標準"
              >
                財務階段 <span className="text-[#c99a5b]">ⓘ</span>
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
              className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_0.8fr] gap-3 items-center bg-[#0c2135] hover:bg-[#123049] border border-white/10 rounded-lg px-3 py-3 transition"
            >
              <div className="col-span-2 md:col-span-1">
                <div className="font-bold">{c.name}</div>
                {c.code && (
                  <div className="font-mono text-[10px] tracking-wider text-[#6b7d8f]">{c.code}</div>
                )}
                <div className="flex flex-wrap gap-1 mt-1">
                  {(c.tags ?? []).map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#0d2b45] text-[#a9bccf] border border-white/10">{t}</span>
                  ))}
                </div>
              </div>
              <div className="text-sm text-[#a9bccf]">
                {c.latestPlan ? (
                  <>
                    <span className="text-[#eef2f7]">{c.latestPlan.year}</span>
                    <span className="ml-1 text-[11px] text-[#6b7d8f]">{PLAN_STATUS_LABEL[c.latestPlan.status] ?? c.latestPlan.status}</span>
                    {c.planCount > 1 && <span className="ml-1 text-[11px] text-[#6b7d8f]">·{c.planCount}版</span>}
                  </>
                ) : (
                  <span className="text-[#6b7d8f]">—</span>
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
              <div className="text-sm tabular-nums text-[#eef2f7]">{fmtMoney(c.latestPlan?.netWorth ?? null)}</div>
              <div className="text-[12px] text-[#a9bccf]">
                <div>上次 {c.lastReviewDate ?? "—"}</div>
                <div className={c.nextAppt ? "text-[#e0bd8b]" : "text-[#6b7d8f]"}>下次 {c.nextAppt ?? "—"}</div>
              </div>
              <div className="text-[12px] text-[#a9bccf]">{STATUS_LABEL[c.status] ?? c.status}</div>
            </Link>
          ))}
        </div>
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

    const field = "w-full bg-[#0a1a2b] border border-white/15 rounded-md text-sm px-3 py-2 text-[#eef2f7]";

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
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4" onClick={onClose}>
        <div className="w-full max-w-md bg-[#0c2135] border border-white/15 rounded-xl p-5" onClick={(e) => e.stopPropagation()}>
          <h2 className="font-serif text-lg mb-4">新增客戶</h2>
          <div className="grid gap-3">
            <div>
              <label className="text-xs text-[#a9bccf]">姓名 *</label>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-xs text-[#a9bccf]">來源</label>
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
              <label className="text-xs text-[#a9bccf]">標籤（逗號分隔）</label>
              <input className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="VIP, 轉介" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#a9bccf]">電話</label>
                <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-[#a9bccf]">生日</label>
                <input type="date" className={field} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
            </div>
            {err && <div className="text-[#d9773f] text-sm">{err}</div>}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-[#a9bccf]">取消</button>
            <button onClick={submit} disabled={pending} className="px-4 py-1.5 text-sm font-bold rounded-md bg-[#c99a5b] text-[#08202a] disabled:opacity-60">
              {pending ? "建立中…" : "建立並開始"}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
