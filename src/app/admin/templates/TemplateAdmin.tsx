"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TemplateListItem } from "@/lib/templates";
import { fmtMoney, stageColor, stageName } from "../../dashboard/format";
import {
  createTemplateAction,
  deleteTemplateAction,
  reorderTemplatesAction,
  updateTemplateAction,
} from "./actions";

const field = "w-full bg-[#0a1a2b] border border-white/15 rounded-md text-sm px-3 py-2 text-[#eef2f7]";

export default function TemplateAdmin({ templates }: { templates: TemplateListItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<TemplateListItem | null>(null);
  // 刪除是真刪（plans 一起 CASCADE），所以不做「按一下就沒了」。
  // 兩段式：第一下把那一列變成確認狀態，第二下才真的送出。
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // 排序在本地先動，畫面才不會「按了上移、等一秒才跳」。
  // 伺服器回來後由 router.refresh() 覆蓋：props 換了新陣列就重新同步。
  // ⚠️ 用「渲染期間比對 props」而不是 useEffect —— 在 effect 裡 setState 會多跑一輪渲染，
  //    畫面會先閃一下舊順序（而且 eslint 的 react-hooks/set-state-in-effect 會擋）。
  const [order, setOrder] = useState(templates);
  const [seen, setSeen] = useState(templates);
  if (seen !== templates) {
    setSeen(templates);
    setOrder(templates);
  }

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string } | { ok: true; id: string }>) {
    setErr("");
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          setErr(r.error);
          router.refresh(); // 失敗時把本地的樂觀順序收回來
          return;
        }
        router.refresh();
      } catch {
        setErr("操作失敗，請重試。");
        router.refresh();
      }
    });
  }

  function move(idx: number, dir: -1 | 1) {
    const to = idx + dir;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[idx], next[to]] = [next[to], next[idx]];
    setOrder(next);
    run(() => reorderTemplatesAction(next.map((t) => t.id)));
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[#6b7d8f] text-sm">{order.length} 份</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowNew(true)}
          disabled={pending}
          className="rounded-md bg-[#c99a5b] text-[#08202a] font-bold text-sm px-3.5 py-1.5 disabled:opacity-40"
        >
          ＋ 新增範本
        </button>
      </div>

      {err && (
        <div role="alert" className="mb-3 text-sm text-[#ffd7d8] bg-[#e5484d]/15 border border-[#e5484d]/40 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {order.length === 0 ? (
        <div className="text-center py-16 text-[#6b7d8f] border border-dashed border-white/10 rounded-xl">
          <div className="text-3xl mb-2">📁</div>
          還沒有任何示範範本。點右上角建立第一份——建好之後再進去把內容填滿。
        </div>
      ) : (
        <div className="grid gap-2">
          {order.map((t, i) => (
            <div
              key={t.id}
              className="grid grid-cols-1 md:grid-cols-[1.7fr_1fr_1fr_auto] gap-3 items-center bg-[#0c2135] border border-white/10 rounded-lg px-3 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#6b7d8f] w-5 text-right">{i + 1}</span>
                  <Link href={`/admin/templates/${t.id}`} className="font-bold hover:text-[#e0bd8b] truncate">
                    {t.name}
                  </Link>
                </div>
                {t.templateLabel && (
                  <div className="ml-7 mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#0d2b45] text-[#a9bccf] border border-white/10">
                    {t.templateLabel}
                  </div>
                )}
              </div>
              <div className="text-[12px] font-bold" style={{ color: stageColor(t.healthGrade) }}>
                {t.healthGrade ? stageName(t.healthGrade) : <span className="text-[#6b7d8f]">尚未填內容</span>}
              </div>
              <div className="text-sm tabular-nums text-[#eef2f7]">{fmtMoney(t.netWorth ?? null)}</div>
              <div className="flex items-center gap-1 justify-end">
                <button
                  onClick={() => move(i, -1)}
                  disabled={pending || i === 0}
                  title="上移"
                  className="w-7 h-7 rounded border border-white/12 text-[#a9bccf] disabled:opacity-25 hover:bg-[#17406a]"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={pending || i === order.length - 1}
                  title="下移"
                  className="w-7 h-7 rounded border border-white/12 text-[#a9bccf] disabled:opacity-25 hover:bg-[#17406a]"
                >
                  ↓
                </button>
                <Link
                  href={`/admin/templates/${t.id}`}
                  className="ml-2 text-xs rounded-md border border-[#c99a5b]/50 text-[#e0bd8b] px-2.5 py-1.5 hover:bg-[#c99a5b]/10"
                >
                  編輯內容
                </Link>
                <button
                  onClick={() => { setEditing(t); setConfirmDel(null); }}
                  disabled={pending}
                  className="text-xs rounded-md border border-white/15 text-[#a9bccf] px-2.5 py-1.5 hover:bg-[#17406a] disabled:opacity-40"
                >
                  改名稱
                </button>
                {confirmDel === t.id ? (
                  <>
                    <button
                      onClick={() => { setConfirmDel(null); run(() => deleteTemplateAction(t.id)); }}
                      disabled={pending}
                      className="text-xs font-bold rounded-md bg-[#e5484d] text-white px-2.5 py-1.5 disabled:opacity-40"
                    >
                      確定下架
                    </button>
                    <button onClick={() => setConfirmDel(null)} className="text-xs text-[#a9bccf] px-1.5">取消</button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDel(t.id)}
                    disabled={pending}
                    className="text-xs rounded-md border border-[#e5484d]/40 text-[#ff9d9f] px-2.5 py-1.5 hover:bg-[#e5484d]/10 disabled:opacity-40"
                  >
                    下架
                  </button>
                )}
              </div>
              {confirmDel === t.id && (
                <p className="md:col-span-4 text-[12px] text-[#ffb9ba] bg-[#5b1f22]/40 border border-[#e5484d]/30 rounded-md px-3 py-2">
                  下架會把這份範本連同它所有年度版本一起刪掉，救不回來。
                  已經有教練「複製一份給自己」的那些客戶不受影響——那些是各自獨立的資料。
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <TemplateDialog
          title="新增示範範本"
          submitLabel="建立"
          pending={pending}
          onClose={() => setShowNew(false)}
          onSubmit={(v) => {
            setErr("");
            start(async () => {
              try {
                const r = await createTemplateAction(v);
                if (!r.ok) { setErr(r.error); return; }
                setShowNew(false);
                // 建好就直接進去填內容——建立一份空範本本身沒有任何用處。
                router.push(`/admin/templates/${r.id}`);
              } catch {
                setErr("建立失敗，請重試。");
              }
            });
          }}
        />
      )}

      {editing && (
        <TemplateDialog
          title="編輯範本資訊"
          submitLabel="儲存"
          pending={pending}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(v) => {
            const id = editing.id;
            setEditing(null);
            run(() => updateTemplateAction(id, v));
          }}
        />
      )}
    </div>
  );
}

function TemplateDialog({
  title,
  submitLabel,
  pending,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  pending: boolean;
  initial?: TemplateListItem;
  onClose: () => void;
  onSubmit: (v: { name: string; templateLabel: string | null }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [label, setLabel] = useState(initial?.templateLabel ?? "");
  const [local, setLocal] = useState("");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0c2135] border border-white/15 rounded-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-lg mb-1">{title}</h2>
        <p className="text-[11px] text-[#6b7d8f] mb-4">這兩個欄位是教練在清單上看到的，取名時想著「他要怎麼跟客戶介紹這一份」。</p>
        <div className="grid gap-3">
          <div>
            <label className="text-xs text-[#a9bccf]">範本名稱 *</label>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="雙薪育兒家庭" autoFocus />
          </div>
          <div>
            <label className="text-xs text-[#a9bccf]">客群標籤</label>
            <input className={field} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="35 歲、兩個小孩、房貸 800 萬" />
          </div>
          {local && <div className="text-[#d9773f] text-sm">{local}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-[#a9bccf]">取消</button>
          <button
            onClick={() => {
              if (!name.trim()) { setLocal("請填範本名稱"); return; }
              setLocal("");
              onSubmit({ name: name.trim(), templateLabel: label.trim() || null });
            }}
            disabled={pending}
            className="px-4 py-1.5 text-sm font-bold rounded-md bg-[#c99a5b] text-[#08202a] disabled:opacity-60"
          >
            {pending ? "處理中…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
