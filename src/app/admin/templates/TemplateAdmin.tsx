"use client";

import { useState, useTransition } from "react";
import Modal from "@/components/ui/Modal";
import { FIELD } from "@/components/ui/Field";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TemplateListItem } from "@/lib/templates";
import { fmtMoney, stageColor, stageName } from "../../dashboard/format";
import {
  createTemplateAction,
  purgeTemplateAction,
  reorderTemplatesAction,
  setTemplateArchivedAction,
  updateTemplateAction,
} from "./actions";

const field = FIELD;

/** 已下架＝status 不是 active。舊資料沒有這個欄位時視為上架中。 */
const archivedOf = (t: TemplateListItem) => t.status === "archived";

export default function TemplateAdmin({ templates }: { templates: TemplateListItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<TemplateListItem | null>(null);
  // 永久刪除是真刪（plans 一起 CASCADE），所以不做「按一下就沒了」：
  // 第一下把那一列變成確認狀態，第二下才真的送出。
  // ⚠️ 下架本身不需要確認——它可回復，多一道確認只是讓人少用它。
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
        <span className="text-tx3 text-sm">{order.length} 份</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowNew(true)}
          disabled={pending}
          className="rounded-md bg-brand text-onbrand font-bold text-sm px-3.5 py-1.5 disabled:opacity-40"
        >
          ＋ 新增範本
        </button>
      </div>

      {err && (
        <div role="alert" className="mb-3 text-sm text-danger bg-danger-solid/15 border border-danger-solid/40 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {order.length === 0 ? (
        <div className="text-center py-16 text-tx3 border border-dashed border-line rounded-xl">
          <div className="text-3xl mb-2">📁</div>
          還沒有任何示範範本。點右上角建立第一份——建好之後再進去把內容填滿。
        </div>
      ) : (
        <div className="grid gap-2">
          {order.map((t, i) => {
            const archived = archivedOf(t);
            return (
            <div
              key={t.id}
              className={
                "grid grid-cols-1 md:grid-cols-[1.7fr_1fr_1fr_auto] gap-3 items-center rounded-lg px-3 py-3 border " +
                (archivedOf(t) ? "bg-field border-line opacity-70" : "bg-panel border-line")
              }
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-10 font-mono text-tx3 w-5 text-right">{i + 1}</span>
                  <Link href={`/admin/templates/${t.id}`} className="font-bold hover:text-brand2 truncate">
                    {t.name}
                  </Link>
                  {archivedOf(t) && (
                    <span className="text-10 px-1.5 py-0.5 rounded border border-line2 text-tx3">已下架</span>
                  )}
                </div>
                {t.templateLabel && (
                  <div className="ml-7 mt-1 inline-block text-10 px-1.5 py-0.5 rounded bg-panel text-tx2 border border-line">
                    {t.templateLabel}
                  </div>
                )}
              </div>
              <div className="text-xs font-bold" style={{ color: stageColor(t.healthGrade) }}>
                {t.healthGrade ? stageName(t.healthGrade) : <span className="text-tx3">尚未填內容</span>}
              </div>
              <div className="text-sm tabular-nums text-tx">{fmtMoney(t.netWorth ?? null)}</div>
              <div className="flex items-center gap-1 justify-end">
                <button
                  onClick={() => move(i, -1)}
                  disabled={pending || i === 0}
                  title="上移"
                  className="w-7 h-7 rounded border border-line text-tx2 disabled:opacity-25 hover:bg-panel3"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={pending || i === order.length - 1}
                  title="下移"
                  className="w-7 h-7 rounded border border-line text-tx2 disabled:opacity-25 hover:bg-panel3"
                >
                  ↓
                </button>
                <Link
                  href={`/admin/templates/${t.id}`}
                  className="ml-2 text-xs rounded-md border border-brand/50 text-brand2 px-2.5 py-1.5 hover:bg-brand/10"
                >
                  編輯內容
                </Link>
                <button
                  onClick={() => { setEditing(t); setConfirmDel(null); }}
                  disabled={pending}
                  className="text-xs rounded-md border border-line2 text-tx2 px-2.5 py-1.5 hover:bg-panel3 disabled:opacity-40"
                >
                  改名稱
                </button>
                {archived ? (
                  <>
                    <button
                      onClick={() => run(() => setTemplateArchivedAction(t.id, false))}
                      disabled={pending}
                      className="text-xs font-bold rounded-md border border-ok/50 text-ok px-2.5 py-1.5 hover:bg-ok/10 disabled:opacity-40"
                    >
                      重新上架
                    </button>
                    {confirmDel === t.id ? (
                      <>
                        <button
                          onClick={() => { setConfirmDel(null); run(() => purgeTemplateAction(t.id)); }}
                          disabled={pending}
                          className="text-xs font-bold rounded-md bg-danger-solid text-onsolid px-2.5 py-1.5 disabled:opacity-40"
                        >
                          確定永久刪除
                        </button>
                        <button onClick={() => setConfirmDel(null)} className="text-xs text-tx2 px-1.5">取消</button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDel(t.id)}
                        disabled={pending}
                        className="text-xs rounded-md border border-danger-solid/40 text-danger px-2.5 py-1.5 hover:bg-danger-solid/10 disabled:opacity-40"
                      >
                        永久刪除
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => { setConfirmDel(null); run(() => setTemplateArchivedAction(t.id, true)); }}
                    disabled={pending}
                    title="教練端就看不到了；內容一個字都不會少，隨時可以再上架"
                    className="text-xs rounded-md border border-line2 text-tx2 px-2.5 py-1.5 hover:bg-panel3 disabled:opacity-40"
                  >
                    下架
                  </button>
                )}
              </div>
              {archived && confirmDel !== t.id && (
                <p className="md:col-span-4 text-xs text-tx2 bg-panel/60 border border-line rounded-md px-3 py-2 shadow-e1">
                  已下架：教練端的清單看不到這一份，內容完整保留著。要真的刪掉才按「永久刪除」。
                </p>
              )}
              {confirmDel === t.id && (
                <p className="md:col-span-4 text-xs text-danger bg-danger-solid/25/40 border border-danger-solid/30 rounded-md px-3 py-2">
                  永久刪除會把這份範本連同它所有年度版本一起刪掉，<b>救不回來</b>。
                  已經有教練「複製一份給自己」的那些客戶不受影響——那些是各自獨立的資料。
                </p>
              )}
            </div>
            );
          })}
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
    <Modal onClose={onClose} labelledBy="tplDlgTitle" width="max-w-md">
      <div className="p-5">
        <h2 id="tplDlgTitle" className="font-serif text-lg mb-1">{title}</h2>
        <p className="text-11 text-tx3 mb-4">這兩個欄位是教練在清單上看到的，取名時想著「他要怎麼跟客戶介紹這一份」。</p>
        <div className="grid gap-3">
          <div>
            <label className="text-xs text-tx2">範本名稱 *</label>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="雙薪育兒家庭" autoFocus />
          </div>
          <div>
            <label className="text-xs text-tx2">客群標籤</label>
            <input className={field} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="35 歲、兩個小孩、房貸 800 萬" />
          </div>
          {local && <div className="text-danger text-sm">{local}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-tx2">取消</button>
          <button
            onClick={() => {
              if (!name.trim()) { setLocal("請填範本名稱"); return; }
              setLocal("");
              onSubmit({ name: name.trim(), templateLabel: label.trim() || null });
            }}
            disabled={pending}
            className="px-4 py-1.5 text-sm font-bold rounded-md bg-brand text-onbrand disabled:opacity-60"
          >
            {pending ? "處理中…" : submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
