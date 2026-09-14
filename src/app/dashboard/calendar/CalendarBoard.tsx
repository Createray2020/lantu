"use client";

import Link from "next/link";
import { useId, useState } from "react";
import Modal from "@/components/ui/Modal";
import type { CalEvent } from "@/lib/orgEvents";

const COLOR: Record<string, string> = {
  meeting: "var(--info)",
  training: "var(--brand)",
  activity: "var(--c5)",
  ops: "var(--tx2)",
};
const KIND_LABEL: Record<string, string> = {
  meeting: "會議", activity: "活動", ops: "公司行程", training: "教育訓練",
};
const VIS_LABEL: Record<string, string> = {
  all: "全體", manager: "主管以上", owner: "僅核心",
};
const WD = ["日", "一", "二", "三", "四", "五", "六"];

/** 月曆一格最多列幾筆；超過收成「還有 N 筆」，點了捲到清單的那一天。 */
const PER_CELL = 3;

function shiftMonth(ym: string, n: number): string {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）`;
}
function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function Chip({ kind }: { kind: string }) {
  return (
    <span className="shrink-0 text-10 font-bold px-1.5 py-px rounded"
      style={{ color: COLOR[kind] ?? "var(--tx2)", background: "color-mix(in srgb, var(--panel2) 70%, transparent)" }}>
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}
function VisChip({ v }: { v: string }) {
  if (v === "all") return null;
  return (
    <span className={`shrink-0 text-10 font-bold px-1.5 py-px rounded border ${v === "owner" ? "border-danger/45 text-danger" : "border-info/45 text-info"}`}>
      {VIS_LABEL[v]}
    </span>
  );
}

function EventRow({ e, onOpen, showMinuteState }: { e: CalEvent; onOpen: (e: CalEvent) => void; showMinuteState?: boolean }) {
  return (
    <button type="button" onClick={() => onOpen(e)}
      className="w-full text-left flex gap-3 items-start px-3 py-2.5 rounded-lg bg-panel2 hover:bg-field border-l-2 transition"
      style={{ borderLeftColor: COLOR[e.kind] ?? "var(--tx3)" }}>
      <span className="shrink-0 w-[72px] text-xs font-semibold text-tx2 tabular-nums leading-snug">
        {shortDate(e.date)}
        <span className="block text-11 text-tx3 font-normal">{e.start ?? "全天"}</span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex gap-2 items-center flex-wrap text-13 text-tx">
          {e.title}
          <Chip kind={e.kind} />
          <VisChip v={e.visibility} />
          {showMinuteState && e.canMinute && (
            <span className={`shrink-0 text-10 font-bold px-1.5 py-px rounded ${e.minutes ? "bg-ok/16 text-ok" : "bg-panel text-tx3 border border-line"}`}>
              {e.minutes ? "已補紀錄" : "未補紀錄"}
            </span>
          )}
        </span>
        {(e.place || e.body) && (
          <span className="block text-11 text-tx3 mt-0.5 truncate">
            {e.place ? e.place : ""}{e.place && e.body ? "　" : ""}{e.body ?? ""}
          </span>
        )}
      </span>
    </button>
  );
}

export default function CalendarBoard({
  ym, events, past, today, initialOpenId,
}: {
  ym: string;
  events: CalEvent[];
  past: CalEvent[];
  today: string;
  initialOpenId: string | null;
}) {
  const [view, setView] = useState<"month" | "list">("month");
  // 從首頁「近期行程」點進來時帶 ?e=<id>：初始就把那一場打開。
  // ⚠️ 不要改成 useEffect + setOpen —— 那是 effect 裡同步 setState，會多一次 render，
  //    而且抽屜會先閃一下空的。換月份是 server navigation，這個元件會重建，初始值照樣會重算。
  const [open, setOpen] = useState<CalEvent | null>(() =>
    initialOpenId ? ([...events, ...past].find((e) => e.id === initialOpenId) ?? null) : null,
  );
  const titleId = useId();

  const byDate = new Map<string, CalEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  // 月曆格子：從當月 1 號往前補到週日，固定 6 列。全部用 UTC 運算，不碰本地時區。
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + w * 7 + i);
      row.push(d);
    }
    weeks.push(row);
  }
  const isoOf = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <>
      {/* ── 月份導覽 ── */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Link href={`/dashboard/calendar?m=${shiftMonth(ym, -1)}`} className="px-2.5 py-1 rounded-md border border-line text-tx2 hover:text-tx text-sm font-bold">‹</Link>
        <div className="font-serif text-lg font-bold tabular-nums min-w-[112px]">{y} 年 {m} 月</div>
        <Link href={`/dashboard/calendar?m=${shiftMonth(ym, 1)}`} className="px-2.5 py-1 rounded-md border border-line text-tx2 hover:text-tx text-sm font-bold">›</Link>
        <Link href="/dashboard/calendar" className="px-2.5 py-1 rounded-md border border-line text-tx2 hover:text-tx text-xs font-bold">今天</Link>
        <div className="flex-1" />
        {/* ⚠️ 切換鈕只在 md 以上出現：390px 下七欄的月曆每格約 50px，事件標題會被壓成
            一條看不懂的細絲。手機不是「擠」，是不能用——所以手機一律走清單。 */}
        <div className="hidden md:flex gap-1.5">
          <button type="button" onClick={() => setView("month")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold border ${view === "month" ? "bg-brand text-onbrand border-brand" : "border-line text-tx2 hover:text-tx"}`}>月曆</button>
          <button type="button" onClick={() => setView("list")}
            className={`px-2.5 py-1 rounded-md text-xs font-bold border ${view === "list" ? "bg-brand text-onbrand border-brand" : "border-line text-tx2 hover:text-tx"}`}>清單</button>
        </div>
      </div>

      {/* ── 月曆（只在 md 以上，而且 view=month 時）── */}
      <div className={view === "month" ? "hidden md:block" : "hidden"}>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse min-w-[680px]">
            <thead>
              <tr>{WD.map((w) => (
                <th key={w} className="text-11 font-semibold tracking-wide text-tx3 py-1.5 border-b border-line">{w}</th>
              ))}</tr>
            </thead>
            <tbody>
              {weeks.map((row, wi) => (
                <tr key={wi}>
                  {row.map((d) => {
                    const iso = isoOf(d);
                    const out = d.getUTCMonth() !== m - 1;
                    const isToday = iso === today;
                    const list = byDate.get(iso) ?? [];
                    return (
                      <td key={iso}
                        className={`align-top h-[96px] w-[14.28%] border border-line p-1 ${out ? "bg-canvas/60" : ""} ${isToday ? "bg-brand/8 border-brand/40" : ""}`}>
                        <div className={`text-11 font-semibold tabular-nums mb-1 ${isToday ? "text-brand2" : out ? "text-tx3/50" : "text-tx3"}`}>
                          {d.getUTCDate() === 1 ? `${d.getUTCMonth() + 1}/` : ""}{d.getUTCDate()}
                        </div>
                        {list.slice(0, PER_CELL).map((e) => (
                          <button key={e.id} type="button" onClick={() => setOpen(e)}
                            className="block w-full text-left text-11 leading-snug font-semibold rounded-r px-1 py-0.5 mb-0.5 truncate border-l-2 hover:brightness-125"
                            style={{ borderLeftColor: COLOR[e.kind] ?? "var(--tx3)", background: "color-mix(in srgb, var(--panel2) 80%, transparent)" }}>
                            {e.start ? `${e.start} ` : ""}{e.title}
                          </button>
                        ))}
                        {list.length > PER_CELL && (
                          <button type="button" onClick={() => { setView("list"); requestAnimationFrame(() => document.getElementById(`d-${iso}`)?.scrollIntoView({ behavior: "smooth", block: "center" })); }}
                            className="text-10 text-tx3 hover:text-tx2 pl-1">還有 {list.length - PER_CELL} 筆</button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 清單（手機恆顯示；桌機在 view=list 時顯示）── */}
      <div className={view === "month" ? "md:hidden" : ""}>
        {events.length === 0 ? (
          <div className="text-tx3 text-sm bg-panel2 border border-line rounded-lg px-3 py-6 text-center">這個月沒有行程</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {events.map((e) => <div key={e.id} id={`d-${e.date}`}><EventRow e={e} onOpen={setOpen} /></div>)}
          </div>
        )}
      </div>

      {/* ── 過往活動與會議紀錄 ── */}
      <div className="mt-8">
        <h2 className="text-sm font-bold text-brand2 flex items-center gap-2 mb-3">
          🗂 過往紀錄
          <span className="text-xs font-normal text-tx3">
            {past.length} 筆
            {past.filter((e) => e.canMinute && !e.minutes).length > 0 &&
              `　·　${past.filter((e) => e.canMinute && !e.minutes).length} 筆未補紀錄`}
          </span>
        </h2>
        {past.length === 0 ? (
          <div className="text-tx3 text-sm bg-panel2 border border-line rounded-lg px-3 py-6 text-center">還沒有過往紀錄</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {past.map((e) => <EventRow key={e.id} e={e} onOpen={setOpen} showMinuteState />)}
          </div>
        )}
      </div>

      {/* ── 詳情 ── */}
      {/* ⚠️ 彈窗一律走 components/ui/Modal——role=dialog、Esc、焦點移入與歸還
          這三件事缺一不可，而且缺了都不會噴錯（src/lib/uiKitUI.test.ts 在守這條）。 */}
      {open && (
        <Modal open onClose={() => setOpen(null)} labelledBy={titleId} width="max-w-[620px]">
          <div className="px-5 py-5">
            <h3 id={titleId} className="font-serif text-lg font-bold mb-1">{open.title}</h3>
            <div className="flex gap-2 items-center flex-wrap mb-4">
              <Chip kind={open.kind} />
              <span className="text-11 text-tx3">{VIS_LABEL[open.visibility]}可見</span>
              {open.readOnly && <span className="text-10 font-bold px-1.5 py-px rounded border border-line text-tx3">來自訓練時數 · 唯讀</span>}
            </div>
            <dl className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-2 text-13 mb-4">
              <dt className="text-11 font-semibold tracking-wide text-tx2 pt-0.5">日期</dt>
              <dd className="m-0">{fmtDate(open.date)}</dd>
              <dt className="text-11 font-semibold tracking-wide text-tx2 pt-0.5">時間</dt>
              <dd className="m-0">{open.start ? `${open.start}${open.end ? ` – ${open.end}` : ""}` : "全天"}</dd>
              <dt className="text-11 font-semibold tracking-wide text-tx2 pt-0.5">地點</dt>
              <dd className="m-0">{open.place || "—"}</dd>
            </dl>
            {open.body && (<>
              <div className="text-xs font-bold text-brand border-t border-line pt-3 mb-1.5">說明</div>
              <div className="text-13 leading-relaxed whitespace-pre-wrap">{open.body}</div>
            </>)}
            {open.canMinute && (<>
              <div className="text-xs font-bold text-brand border-t border-line pt-3 mt-4 mb-1.5">會議紀錄</div>
              <div className={`text-13 leading-relaxed whitespace-pre-wrap ${open.minutes ? "" : "text-tx3"}`}>
                {open.minutes ?? (open.date < today ? "這場還沒補紀錄。" : "事件結束後由後台補上。")}
              </div>
            </>)}
            <div className="mt-6">
              <button type="button" onClick={() => setOpen(null)}
                className="px-3 py-1.5 rounded-lg border border-line text-tx2 hover:text-tx text-xs font-bold">關閉</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
