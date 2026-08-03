"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClientListItem } from "@/lib/clients";
import { createClientAction } from "./actions";
import {
  fmtMoney,
  gradeColor,
  STATUS_LABEL,
  PLAN_STATUS_LABEL,
  LIFE_STAGES,
  CLIENT_SOURCES,
} from "./format";

type SortKey = "updated" | "next" | "net" | "grade";

export default function ClientList({ clients }: { clients: ClientListItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [stage, setStage] = useState("all");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<SortKey>("updated");
  const [showNew, setShowNew] = useState(false);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    clients.forEach((c) => (c.tags ?? []).forEach((t) => s.add(t)));
    return [...s].sort();
  }, [clients]);

  const rows = useMemo(() => {
    let r = clients.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (stage !== "all" && (c.lifeStage || "") !== stage) return false;
      if (tag !== "all" && !(c.tags ?? []).includes(tag)) return false;
      if (q.trim()) {
        const hay = (c.name + " " + (c.tags ?? []).join(" ") + " " + (c.source ?? "")).toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
    const gr2n = (g: string | null | undefined) => ({ A: 4, B: 3, C: 2, D: 1 } as Record<string, number>)[g ?? ""] ?? 0;
    r = [...r].sort((a, b) => {
      if (sort === "net") return (b.latestPlan?.netWorth ?? -1) - (a.latestPlan?.netWorth ?? -1);
      if (sort === "grade") return gr2n(b.latestPlan?.healthGrade) - gr2n(a.latestPlan?.healthGrade);
      if (sort === "next") {
        const av = a.nextAppt ?? "9999";
        const bv = b.nextAppt ?? "9999";
        return av < bv ? -1 : av > bv ? 1 : 0;
      }
      return 0; // updated：後端已按 updatedAt desc
    });
    return r;
  }, [clients, q, status, stage, tag, sort]);

  const sel = "bg-[#0d2b45] border border-white/15 rounded-md text-sm px-2.5 py-1.5 text-[#eef2f7]";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h1 className="font-serif text-xl tracking-wide mr-1">客戶</h1>
        <span className="text-[#6b7d8f] text-sm">{rows.length} / {clients.length}</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowNew(true)}
          className="rounded-md bg-[#c99a5b] text-[#08202a] font-bold text-sm px-3.5 py-1.5"
        >
          ＋ 新增客戶
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋姓名／標籤／來源"
          className={sel + " flex-1 min-w-[180px]"}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="all">全部狀態</option>
          <option value="active">進行中</option>
          <option value="pending">待處理</option>
          <option value="archived">已封存</option>
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={sel}>
          <option value="all">全部生命階段</option>
          {LIFE_STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
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
          <option value="grade">等級高→低</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-20 text-[#6b7d8f]">
          <div className="text-4xl mb-3">🗂️</div>
          {clients.length === 0 ? "還沒有客戶，點右上角新增第一位客戶。" : "沒有符合條件的客戶。"}
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="hidden md:grid grid-cols-[1.6fr_1fr_0.8fr_1fr_1fr_0.8fr] gap-3 px-3 text-[11px] uppercase tracking-wider text-[#6b7d8f]">
            <div>客戶</div>
            <div>最新版本</div>
            <div>等級</div>
            <div>淨值</div>
            <div>上次／下次諮詢</div>
            <div>狀態</div>
          </div>
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/clients/${c.id}`}
              className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_0.8fr_1fr_1fr_0.8fr] gap-3 items-center bg-[#0c2135] hover:bg-[#123049] border border-white/10 rounded-lg px-3 py-3 transition"
            >
              <div className="col-span-2 md:col-span-1">
                <div className="font-bold">{c.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(c.tags ?? []).map((t) => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#0d2b45] text-[#a9bccf] border border-white/10">{t}</span>
                  ))}
                  {c.lifeStage && <span className="text-[10px] text-[#6b7d8f]">{c.lifeStage}</span>}
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
              <div className="font-extrabold" style={{ color: gradeColor(c.latestPlan?.healthGrade) }}>
                {c.latestPlan?.healthGrade ?? "—"}
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

      {showNew && <NewClientDialog onClose={() => setShowNew(false)} onCreated={(id) => router.push(`/dashboard/clients/${id}`)} />}
    </div>
  );

  // 內嵌新增客戶對話框
  function NewClientDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
    const [name, setName] = useState("");
    const [source, setSource] = useState("");
    const [lifeStage, setLifeStage] = useState("");
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
      start(async () => {
        try {
          const id = await createClientAction({
            name: name.trim(),
            source: source || null,
            lifeStage: lifeStage || null,
            tags: tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
            contact: phone ? { phone } : {},
            birthDate: birthDate || null,
          });
          onCreated(id);
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#a9bccf]">來源</label>
                <select className={field} value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">—</option>
                  {CLIENT_SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#a9bccf]">生命階段</label>
                <select className={field} value={lifeStage} onChange={(e) => setLifeStage(e.target.value)}>
                  <option value="">—</option>
                  {LIFE_STAGES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
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
