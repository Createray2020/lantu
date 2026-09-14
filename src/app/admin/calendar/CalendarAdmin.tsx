"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FIELD } from "@/components/ui/Field";
import SubmitButton from "@/components/ui/SubmitButton";
import { confirmDialog } from "@/components/ui/confirm";
import type { CalEvent } from "@/lib/orgEvents";
import { createEventAction, deleteEventAction, updateEventAction } from "./actions";

const KIND_LABEL: Record<string, string> = { meeting: "會議", activity: "活動", ops: "公司行程" };
const VIS_LABEL: Record<string, string> = { all: "全體教練", manager: "主管以上", owner: "僅核心成員" };
const COLOR: Record<string, string> = { meeting: "var(--info)", activity: "var(--c5)", ops: "var(--tx2)" };
const WD = ["日", "一", "二", "三", "四", "五", "六"];

type Draft = {
  id: string | null;
  date: string;
  start: string;
  end: string;
  kind: string;
  title: string;
  place: string;
  visibility: string;
  body: string;
  minutes: string;
};

const blank = (date: string): Draft => ({
  id: null, date, start: "", end: "", kind: "meeting",
  title: "", place: "", visibility: "all", body: "", minutes: "",
});

function toDraft(e: CalEvent): Draft {
  return {
    id: e.id, date: e.date, start: e.start ?? "", end: e.end ?? "",
    kind: e.kind, title: e.title, place: e.place ?? "",
    visibility: e.visibility, body: e.body ?? "", minutes: e.minutes ?? "",
  };
}
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）`;
}

export default function CalendarAdmin({ rows, today }: { rows: CalEvent[]; today: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(blank(today));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const editing = draft.id !== null;

  const save = () => {
    setMsg(null); setErr(null);
    const input = {
      date: draft.date, start: draft.start, end: draft.end, kind: draft.kind,
      title: draft.title, place: draft.place, visibility: draft.visibility,
      body: draft.body, minutes: draft.minutes,
    };
    start(async () => {
      const r = draft.id
        ? await updateEventAction(draft.id, input)
        : await createEventAction(input);
      if (r.ok) {
        setMsg(draft.id ? "已更新" : "已建立");
        setDraft(blank(today));
        router.refresh();
      } else setErr(r.error);
    });
  };

  // ⚠️ 刪除一律走 confirmDialog。瀏覽器原生的那顆完全不受 --ui-scale 影響，
  //    把介面調成特大的人在「要不要刪掉」這一步看到的還是系統預設字級，
  //    而那正是最需要看清楚的一步（理由寫在 components/ui/confirm 裡）。
  const remove = async (e: CalEvent) => {
    setMsg(null); setErr(null);
    if (!(await confirmDialog(`刪除「${e.title}」？教練端會立刻看不到這一場。`, { danger: true, okLabel: "刪除" }))) return;
    start(async () => {
      const r = await deleteEventAction(e.id);
      if (r.ok) {
        setMsg("已刪除");
        if (draft.id === e.id) setDraft(blank(today));
        router.refresh();
      } else setErr(r.error);
    });
  };

  const upcoming = rows.filter((e) => e.date >= today);
  const past = rows.filter((e) => e.date < today);

  // ⚠️ 表單控制項只有一份定義（components/ui/Field）。在這裡再宣告一份 const field
  //    就是全站 22 種輸入框樣式長回來的第一步（src/lib/uiKitUI.test.ts 在守這條）。
  const label = "block text-11 font-semibold tracking-wide text-tx2 mb-1";

  const Row = ({ e, showMinuteState }: { e: CalEvent; showMinuteState?: boolean }) => (
    <div className="flex gap-3 items-start px-3 py-2.5 rounded-lg bg-panel2 border-l-2"
      style={{ borderLeftColor: COLOR[e.kind] ?? "var(--tx3)" }}>
      <div className="shrink-0 w-[72px] text-xs font-semibold text-tx2 tabular-nums leading-snug">
        {fmtDate(e.date)}
        <span className="block text-11 text-tx3 font-normal">{e.start ?? "全天"}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex gap-2 items-center flex-wrap text-13">
          {e.title}
          <span className="shrink-0 text-10 font-bold px-1.5 py-px rounded" style={{ color: COLOR[e.kind], background: "color-mix(in srgb, var(--panel) 60%, transparent)" }}>{KIND_LABEL[e.kind]}</span>
          {e.visibility !== "all" && (
            <span className={`shrink-0 text-10 font-bold px-1.5 py-px rounded border ${e.visibility === "owner" ? "border-danger/45 text-danger" : "border-info/45 text-info"}`}>{VIS_LABEL[e.visibility]}</span>
          )}
          {showMinuteState && (
            <span className={`shrink-0 text-10 font-bold px-1.5 py-px rounded ${e.minutes ? "bg-ok/16 text-ok" : "bg-panel text-tx3 border border-line"}`}>
              {e.minutes ? "已補紀錄" : "未補紀錄"}
            </span>
          )}
        </div>
        {e.place && <div className="text-11 text-tx3 mt-0.5 truncate">{e.place}</div>}
      </div>
      <div className="shrink-0 flex gap-1.5">
        <button type="button" disabled={pending}
          onClick={() => { setDraft(toDraft(e)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="px-2 py-1 rounded-md border border-line text-tx2 hover:text-tx text-11 font-bold disabled:opacity-40">
          {e.canMinute && !e.minutes && e.date < today ? "補紀錄" : "編輯"}
        </button>
        <button type="button" disabled={pending} onClick={() => { void remove(e); }}
          className="px-2 py-1 rounded-md border border-line text-tx3 hover:text-danger text-11 font-bold disabled:opacity-40">刪除</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {(msg || err) && (
        <div className={`text-sm rounded-lg px-3 py-2 border ${err ? "border-danger text-danger" : "border-ok text-ok"}`}>
          {err ?? msg}
        </div>
      )}

      {/* ── 表單 ── */}
      <div className="rounded-xl border border-line bg-panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-bold">{editing ? "編輯事件" : "新增事件"}</h2>
          {editing && (
            <button type="button" onClick={() => setDraft(blank(today))}
              className="text-11 font-bold text-tx3 hover:text-tx border border-line rounded px-1.5 py-0.5">取消編輯</button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ev-date">日期</label>
            <input id="ev-date" type="date" className={FIELD} value={draft.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="ev-start">時間</label>
            <div className="flex items-center gap-2">
              <input id="ev-start" type="time" className={FIELD} value={draft.start} onChange={(e) => set({ start: e.target.value })} />
              <span className="text-tx3 text-xs">–</span>
              <input id="ev-end" type="time" className={FIELD} value={draft.end} onChange={(e) => set({ end: e.target.value })} aria-label="結束時間" />
            </div>
            <div className="text-11 text-tx3 mt-1">留空＝全天事件。</div>
          </div>
          <div>
            <label className={label} htmlFor="ev-kind">類型</label>
            <select id="ev-kind" className={FIELD} value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
              <option value="meeting">會議</option>
              <option value="activity">活動</option>
              <option value="ops">公司行程</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ev-vis">可見層級</label>
            <select id="ev-vis" className={FIELD} value={draft.visibility} onChange={(e) => set({ visibility: e.target.value })}>
              <option value="all">全體教練</option>
              <option value="manager">主管以上</option>
              <option value="owner">僅核心成員</option>
            </select>
            <div className="text-11 text-tx3 mt-1">往上包含：標「主管以上」核心成員也看得到。</div>
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="ev-title">標題</label>
            <input id="ev-title" className={FIELD} value={draft.title} maxLength={200}
              onChange={(e) => set({ title: e.target.value })} placeholder="9 月全體月會" />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="ev-place">地點</label>
            <input id="ev-place" className={FIELD} value={draft.place}
              onChange={(e) => set({ place: e.target.value })} placeholder="台中辦公室 3F／線上同步" />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="ev-body">說明</label>
            <textarea id="ev-body" className={`${FIELD} min-h-[70px]`} value={draft.body}
              onChange={(e) => set({ body: e.target.value })} placeholder="議程、要帶什麼、誰主持…" />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="ev-minutes">會議紀錄</label>
            <textarea id="ev-minutes" className={`${FIELD} min-h-[90px]`} value={draft.minutes}
              onChange={(e) => set({ minutes: e.target.value })} placeholder="事件結束後回來補。" />
            <div className="text-11 text-tx3 mt-1">填了，教練那邊的「過往紀錄」就從「未補紀錄」變成「已補」。</div>
          </div>
        </div>
        <div className="mt-4">
          <SubmitButton type="button" onClick={save} disabled={!draft.title.trim()}
            state={pending ? "pending" : err ? "error" : "idle"}>
            {editing ? "更新" : "建立"}
          </SubmitButton>
        </div>
      </div>

      {/* ── 即將到來 ── */}
      <div>
        <h2 className="text-sm font-bold text-brand2 mb-2">即將到來　<span className="text-xs font-normal text-tx3">{upcoming.length} 筆</span></h2>
        {upcoming.length === 0 ? (
          <div className="text-tx3 text-sm bg-panel2 border border-line rounded-lg px-3 py-6 text-center">還沒有排定的行程</div>
        ) : (
          <div className="flex flex-col gap-1.5">{upcoming.map((e) => <Row key={e.id} e={e} />)}</div>
        )}
      </div>

      {/* ── 已過去 ── */}
      <div>
        <h2 className="text-sm font-bold text-brand2 mb-2">
          已過去　<span className="text-xs font-normal text-tx3">
            {past.length} 筆
            {past.filter((e) => !e.minutes).length > 0 && `　·　${past.filter((e) => !e.minutes).length} 筆未補紀錄`}
          </span>
        </h2>
        {past.length === 0 ? (
          <div className="text-tx3 text-sm bg-panel2 border border-line rounded-lg px-3 py-6 text-center">沒有過往事件</div>
        ) : (
          <div className="flex flex-col gap-1.5">{past.map((e) => <Row key={e.id} e={e} showMinuteState />)}</div>
        )}
      </div>
    </div>
  );
}
