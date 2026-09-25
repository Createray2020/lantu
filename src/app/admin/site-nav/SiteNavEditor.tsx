"use client";

import { useState, useTransition } from "react";
import { FIELD } from "@/components/ui/Field";
import { confirmDialog } from "@/components/ui/confirm";
import {
  INTERNAL_PAGES, MAX_ITEMS, TEXT_MAX, itemProblem, visibleNav,
  type NavItem, type NavStyle,
} from "@/lib/siteNav";
import { resetSiteNavAction, saveSiteNavAction } from "./actions";

// 官網頂欄編輯器。版面照 2026/09/25–26 與 Ray 對過的原型：上方即時預覽（電腦／手機）、
// 下方逐項編輯（文字、連到、樣式、手機露出、開關、拖曳排序）。
// 預覽的樣式必須與官網 SiteHeader 一致（E：細框＋滑過填色），否則「預覽長這樣、官網長那樣」。

const STYLE_OPTS: { v: NavStyle; label: string }[] = [
  { v: "text", label: "一般文字" },
  { v: "outline", label: "外框按鈕" },
  { v: "primary", label: "主要按鈕" },
];

const ITEM = "inline-flex items-center whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm transition-colors";
function pvClass(style: NavStyle): string {
  if (style === "primary") return `${ITEM} border-brand bg-brand text-onbrand font-bold`;
  if (style === "outline") return `${ITEM} border-line2 text-tx hover:bg-panel2`;
  return `${ITEM} border-line text-tx2 hover:bg-panel2 hover:border-panel2 hover:text-tx`;
}

let seq = 0;
const newId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function SiteNavEditor({ initial, configured }: { initial: NavItem[]; configured: boolean }) {
  const [items, setItems] = useState<NavItem[]>(initial);
  const [mobile, setMobile] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(
    configured ? null : { ok: true, text: "目前官網用的是預設頂欄；存過一次之後就以這裡為準。" },
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const change = (next: NavItem[]) => { setItems(next); setDirty(true); setMsg(null); };
  const patch = (id: string, p: Partial<NavItem>) => change(items.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const vis = visibleNav(items);
  const folded = vis.filter((i) => !i.mobile);
  const problems = items.filter((i) => itemProblem(i));

  const add = () => {
    if (items.length >= MAX_ITEMS) return;
    const it: NavItem = { id: newId(), text: "", kind: "ext", href: "https://", newTab: true, style: "text", on: true, mobile: false };
    // 新項目插在「登入」之前：登入與主要按鈕習慣待在最右邊。
    const at = items.findIndex((x) => x.locked);
    const next = items.slice();
    next.splice(at < 0 ? next.length : at, 0, it);
    change(next);
    setTimeout(() => document.getElementById(`nav-text-${it.id}`)?.focus(), 0);
  };

  const remove = async (it: NavItem) => {
    if (!(await confirmDialog(`刪除「${it.text || "未命名"}」？按儲存後官網頂欄就不會再出現。`, { danger: true, okLabel: "刪除" }))) return;
    change(items.filter((x) => x.id !== it.id));
  };

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = items.findIndex((x) => x.id === dragId);
    const to = items.findIndex((x) => x.id === targetId);
    const next = items.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    change(next);
  };

  const save = () => {
    if (problems.length) {
      setMsg({ ok: false, text: `有 ${problems.length} 個項目還沒填好：${itemProblem(problems[0])}` });
      return;
    }
    start(async () => {
      const r = await saveSiteNavAction(items);
      if (r.ok) { setItems(r.items); setDirty(false); setMsg({ ok: true, text: "已儲存，官網頂欄已更新" }); }
      else setMsg({ ok: false, text: r.error });
    });
  };

  const reset = async () => {
    if (!(await confirmDialog("把官網頂欄還原成系統預設（認識教練／登入／免費試算）？這裡目前的設定會清掉。", { okLabel: "還原" }))) return;
    start(async () => {
      const r = await resetSiteNavAction();
      if (r.ok) { setItems(r.items); setDirty(false); setMsg({ ok: true, text: "已還原成預設頂欄" }); }
      else setMsg({ ok: false, text: r.error });
    });
  };

  return (
    <div className="space-y-5">
      {/* ── 即時預覽 ── */}
      <section className="rounded-xl border border-line bg-panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-line text-sm text-tx2">
          <b className="text-tx">即時預覽</b>
          <span className="text-tx3">改下面的欄位，這裡跟著變</span>
          <div className="ml-auto inline-flex rounded-lg border border-line2 overflow-hidden" role="group" aria-label="預覽尺寸">
            {[["電腦", false], ["手機", true]].map(([label, m]) => (
              <button key={String(label)} type="button" aria-pressed={mobile === m}
                onClick={() => { setMobile(m as boolean); setDrawer(false); }}
                className={`px-3 py-1 text-sm ${mobile === m ? "bg-brand text-onbrand font-bold" : "text-tx2 hover:text-tx"}`}>
                {label as string}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-canvas p-4 flex justify-center overflow-x-auto">
          <div className={`rounded-lg border border-line bg-canvas ${mobile ? "w-[390px] max-w-full" : "w-full"}`}>
            <div className="h-16 flex items-center gap-3 px-4 border-b border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/api/brand/icon" alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
              <span className="flex flex-col leading-tight min-w-0">
                <span className="font-serif tracking-[0.14em] text-15 whitespace-nowrap">嵐途 LAN TU</span>
                {!mobile && <span className="text-10 tracking-[0.3em] text-brand">FINANCIAL PLANNING</span>}
              </span>
              <nav className="ml-auto flex items-center gap-2">
                {vis.filter((i) => !mobile || i.mobile).map((i) => (
                  <span key={i.id} className={pvClass(i.style)}>{i.text}</span>
                ))}
                {mobile && folded.length > 0 && (
                  <button type="button" onClick={() => setDrawer((v) => !v)} aria-label="更多選單"
                    className="grid place-items-center w-9 h-9 rounded-lg border border-line text-tx2">☰</button>
                )}
              </nav>
            </div>
            {mobile && drawer && (
              <div className="flex flex-col p-1.5 border-b border-line">
                {folded.map((i) => <span key={i.id} className="px-3 py-2.5 text-sm text-tx">{i.text}</span>)}
              </div>
            )}
            <div className="px-5 py-8 text-tx3 text-sm">（官網內容）</div>
          </div>
        </div>
      </section>

      {/* ── 逐項編輯 ── */}
      <section className="rounded-xl border border-line bg-panel p-4 space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-bold">頂欄項目</h2>
          <span className="text-xs text-tx3">拖曳 ⠿ 調整順序；關掉開關＝暫時不顯示，設定留著</span>
        </div>
        <div className="rounded-lg border border-dashed border-line2 px-3 py-2 text-sm text-tx3">
          <b className="text-tx2">嵐途 logo</b>　固定在最左邊，點了回官網首頁
        </div>

        {items.map((it) => {
          const p = itemProblem(it);
          return (
            <div key={it.id}
              draggable
              onDragStart={(e) => { setDragId(it.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(it.id); } }}
              onDragLeave={() => setOverId((v) => (v === it.id ? null : v))}
              onDrop={(e) => { e.preventDefault(); drop(it.id); setDragId(null); setOverId(null); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              className={`grid grid-cols-[24px_minmax(0,1fr)] md:grid-cols-[24px_minmax(0,1fr)_minmax(0,1.5fr)_auto] gap-3 items-start rounded-lg border p-3 bg-field ${overId === it.id ? "border-brand" : "border-line"} ${it.on ? "" : "opacity-60"}`}>
              <div className="cursor-grab select-none text-tx3 text-lg leading-9 text-center" title="拖曳排序" aria-hidden="true">⠿</div>

              <div className="space-y-2 min-w-0">
                <label className="block">
                  <span className="text-11 text-tx3">顯示文字</span>
                  <input id={`nav-text-${it.id}`} className={FIELD} value={it.text} maxLength={TEXT_MAX}
                    placeholder="例：近期講座" onChange={(e) => patch(it.id, { text: e.target.value })} />
                </label>
                <label className="flex items-center gap-2 text-sm text-tx2 whitespace-nowrap">
                  樣式
                  <select className={`${FIELD} !w-auto py-1`} value={it.style}
                    onChange={(e) => patch(it.id, { style: e.target.value as NavStyle })}>
                    {STYLE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="space-y-2 min-w-0 col-start-2 md:col-start-auto">
                <span className="text-11 text-tx3">連到</span>
                {it.locked ? (
                  <div className="text-sm text-tx2 py-2">登入頁（固定，不能改連結）</div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select className={`${FIELD} sm:w-32 shrink-0`} value={it.kind} aria-label="連結種類"
                      onChange={(e) => {
                        const kind = e.target.value as NavItem["kind"];
                        patch(it.id, { kind, href: kind === "int" ? INTERNAL_PAGES[0].href : "https://", newTab: kind === "ext" });
                      }}>
                      <option value="int">站內頁面</option>
                      <option value="ext">外部網址</option>
                    </select>
                    {it.kind === "int" ? (
                      <select className={FIELD} value={it.href} aria-label="站內頁面"
                        onChange={(e) => patch(it.id, { href: e.target.value })}>
                        {INTERNAL_PAGES.map((pg) => <option key={pg.href} value={pg.href}>{pg.label}</option>)}
                      </select>
                    ) : (
                      <input className={FIELD} value={it.href} aria-label="外部網址" inputMode="url"
                        placeholder="https://… 講座報名頁、LINE 社群、文章"
                        onChange={(e) => patch(it.id, { href: e.target.value })} />
                    )}
                  </div>
                )}
                {p && <div className="text-xs text-warn">{p}</div>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-tx2">
                  {it.kind === "ext" && !it.locked && (
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" className="accent-brand" checked={it.newTab}
                        onChange={(e) => patch(it.id, { newTab: e.target.checked })} />用新分頁開
                    </label>
                  )}
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" className="accent-brand" checked={it.mobile}
                      onChange={(e) => patch(it.id, { mobile: e.target.checked })} />手機也露出在頂欄
                  </label>
                </div>
              </div>

              <div className="col-start-2 md:col-start-auto flex md:flex-col items-center md:items-end justify-between gap-2">
                <button type="button" role="switch" aria-checked={it.on} aria-label={`顯示 ${it.text || "此項目"}`}
                  disabled={it.locked}
                  onClick={() => patch(it.id, { on: !it.on })}
                  className={`relative w-10 h-[22px] rounded-full border transition-colors disabled:opacity-60 ${it.on ? "bg-brand border-brand" : "bg-panel2 border-line2"}`}>
                  <span className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full transition-transform ${it.on ? "translate-x-[18px] bg-onbrand" : "bg-tx3"}`} />
                </button>
                {it.locked
                  ? <span className="text-xs text-tx3">鎖定</span>
                  : <button type="button" onClick={() => remove(it)} className="text-xs text-tx3 hover:text-danger">刪除</button>}
              </div>
            </div>
          );
        })}

        {items.length < MAX_ITEMS ? (
          <button type="button" onClick={add}
            className="w-full text-left rounded-lg border border-dashed border-line2 hover:border-brand px-3 py-2.5 text-sm font-bold text-brand2">
            ＋ 新增一個項目
          </button>
        ) : (
          <div className="text-xs text-tx3">頂欄最多 {MAX_ITEMS} 個項目；再多訪客就找不到重點了。</div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <button type="button" onClick={save} disabled={pending || !dirty}
            className="rounded-lg bg-brand text-onbrand font-bold px-4 py-2 text-sm hover:bg-brand2 disabled:opacity-50">
            {pending ? "儲存中…" : "儲存並套用到官網"}
          </button>
          <button type="button" onClick={reset} disabled={pending}
            className="rounded-lg border border-line2 px-4 py-2 text-sm text-tx2 hover:text-tx disabled:opacity-50">
            還原成預設
          </button>
          <span className={`text-sm ${msg ? (msg.ok ? "text-ok" : "text-danger") : "text-tx3"}`}>
            {msg ? msg.text : dirty ? "有未儲存的變更" : "尚未變更"}
          </span>
        </div>
      </section>
    </div>
  );
}
