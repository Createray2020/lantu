"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  savePlanDataAction,
  addNoteAction,
  deleteNoteAction,
  listNotesAction,
  startSessionAction,
  endSessionAction,
  saveConsultRecordAction,
  discardDraftAction,
  openSessionAction,
  listSessionsAction,
  restoreToSessionAction,
  createActionItemsAction,
} from "../../../actions";
import type { NoteRow, NoteInput } from "@/lib/notes";
import type { SessionRow, EndInput } from "@/lib/consultSession";
import ConsultRecordForm from "../../../ConsultRecordForm";
import { UI_SCALE_KEY, normalizeScale } from "@/lib/uiScale";
import { LICENSE_LOCKED_MESSAGE } from "@/lib/license";

// 唯讀有兩種來源，提示文字必須分開：協作教練沒有「期限」問題，
// 給他看「請聯繫管理員延長期限」只會讓他去找錯的人。
const RO_NOTE = {
  license: LICENSE_LOCKED_MESSAGE,
  collab: "共同執案（唯讀）：這份報告書由主責教練維護，你的修改不會被儲存。",
} as const;
const RO_BADGE = { license: "唯讀", collab: "協作唯讀" } as const;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * 註記的權限，跟「資料能不能改」是兩件事：
 *   owner  主責教練 —— 全部可寫、可勾客戶可見
 *   viewer 共同執案的協作教練 —— 資料一個字都不能改，但**可以寫註記**（會標上名字、
 *          不可勾客戶可見）。一個字都留不下的協作，等於只能口頭講完就散了。
 *   none   使用期限到期 —— 這是帳號層的鎖，連註記都不給寫。
 */
type NoteAccess = "owner" | "viewer" | "none";

/** iframe → 父層的註記／諮詢訊息。 */
type NoteMsg =
  | { type: "lantu:note"; op: "add"; input: NoteInput }
  | { type: "lantu:note"; op: "del"; noteId: string }
  | { type: "lantu:session"; op: "start"; adoptLoose: boolean }
  | { type: "lantu:session"; op: "end"; sessionId: string; input: EndInput }
  | { type: "lantu:session"; op: "restore"; sessionId: string };

/**
 * 父層 → iframe 的失敗回報。
 *
 * 為什麼需要它：iframe 端是樂觀更新（先在畫面長出 pending 的假註記），
 * 父層存不進去卻不吭聲，那則假註記就會一直留著騙人，直到重新載入才消失；
 * 而「回到上次諮詢開始時」失敗更是按下去毫無反應。每一支都要把失敗送回去。
 *
 *   { type: 'lantu:noteerr', op, id, message, blockKey?, body? }
 *
 *   op       'add' | 'del' | 'start' | 'end' | 'restore'
 *   id       這一筆的識別：del＝noteId；end／restore＝sessionId；add／start＝null
 *   message  給人看的中文理由
 *   blockKey add 專用：那則樂觀註記掛在哪個區塊（父層拿不到 iframe 自己編的 tmp_ id）
 *   body     add 專用：註記內容，配合 blockKey 用來定位要收掉的那一則
 */
type NoteErrOp = "add" | "del" | "start" | "end" | "restore";
const NOTE_ERR_FALLBACK = "沒有存成功。請檢查網路後再試一次。";

// v12 App（/lantu-app.html?embed=1）以 iframe 載入。
// 握手：iframe onLoad / 'lantu:ready' → 父層 postMessage 'lantu:init' 灌入 data；
// iframe 每次 save() → 'lantu:save'，父層 debounce 後呼叫 savePlanDataAction 存回 DB。
export default function PlanEditor({
  planId,
  clientId,
  year,
  label,
  data,
  uiScale = 100,
  readOnly = false,
  readOnlyReason = "license",
  clientCode = null,
  birthDate = null,
}: {
  planId: string;
  clientId: string;
  year: number;
  label: string | null;
  data: unknown;
  uiScale?: number;
  readOnly?: boolean;
  /** 唯讀的原因：license＝使用期限到期；collab＝我是被邀來共同執案的協作教練。 */
  readOnlyReason?: "license" | "collab";
  /** 客戶編號：報告書／方案書／診斷書的表頭要印它。 */
  clientCode?: string | null;
  /**
   * 客戶主檔的生日（clients.birth_date）。規劃裡的 profile.birth 還空著時由 iframe 帶入，
   * 教練不必在家庭成員那裡把同一個生日再打一次。⚠️ 只帶不覆蓋；反向回寫在 updatePlanData。
   */
  birthDate?: string | null;
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<unknown>(null);
  const [state, setState] = useState<SaveState>("idle");
  // ⚠️ 結束諮詢不再直接寫紀錄，而是回一份草稿讓教練當場改（可改日期、類型、貼全文）。
  //    表單跟客戶詳情頁是同一個元件，就地彈出＝不用離開規劃編輯器。
  const [draft, setDraft] = useState<{ sessionId: string; draft: string; todos: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftErr, setDraftErr] = useState<string | null>(null);
  // 存檔輪次：一輪重試還在退避等待時，使用者又動了規劃 → 新的一輪接手，舊的那輪不准再改狀態。
  const saveGen = useRef(0);

  /**
   * 存回 DB，失敗就指數退避重試（1s／2s／4s，共四次嘗試）。
   *
   * 為什麼要重試：規劃器是「一直打字、每次都自動存」的工具，最常見的失敗是網路瞬斷；
   * 第一次就宣告失敗、把責任丟回給使用者，等於要他自己記得回來按重試。
   */
  const doSave = useCallback(async () => {
    const gen = ++saveGen.current;
    const backoff = [1000, 2000, 4000];
    setState("saving");
    for (let attempt = 0; ; attempt++) {
      try {
        await savePlanDataAction(planId, latest.current);
        if (saveGen.current !== gen) return; // 已被新的一輪接手
        setState("saved");
        return;
      } catch {
        if (saveGen.current !== gen) return;
        if (attempt >= backoff.length) {
          setState("error");
          return;
        }
        await new Promise((r) => setTimeout(r, backoff[attempt]));
        if (saveGen.current !== gen) return;
      }
    }
  }, [planId]);

  // 註記與諮詢場次不住在 plans.data 裡（它們掛在客戶身上，年度重製時要延續），
  // 所以走自己的通道：父層持有狀態，變動後整批 push 進 iframe。
  const notesRef = useRef<NoteRow[]>([]);
  const sessionRef = useRef<SessionRow | null>(null);
  const pastRef = useRef<SessionRow[]>([]);
  const noteAccess: NoteAccess = readOnly ? (readOnlyReason === "collab" ? "viewer" : "none") : "owner";

  useEffect(() => {
    // 規劃器是 px 版面，父層的 rem 縮放對它無效 —— 一併把字級與唯讀狀態送進去。
    // 以 localStorage 為準：使用者剛在頂欄按過字級，帳號欄位還沒重新讀進來。
    function currentScale() {
      try {
        return normalizeScale(localStorage.getItem(UI_SCALE_KEY) ?? uiScale);
      } catch {
        return normalizeScale(uiScale);
      }
    }

    function postInit() {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "lantu:init",
          data,
          uiScale: currentScale(),
          readOnly,
          readOnlyNote: RO_NOTE[readOnlyReason],
          clientCode: clientCode ?? null,
          birthDate: birthDate ?? null,
          notes: notesRef.current,
          session: sessionRef.current,
          past: pastRef.current,
          noteAccess,
        },
        window.location.origin,
      );
    }

    /** 註記或場次變動後，把最新的整批推進 iframe（它不自己查 DB）。 */
    function pushNotes() {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "lantu:notes", notes: notesRef.current, session: sessionRef.current, past: pastRef.current, noteAccess },
        window.location.origin,
      );
    }

    async function reload() {
      try {
        const [ns, sess, all] = await Promise.all([
          listNotesAction(clientId),
          openSessionAction(clientId),
          listSessionsAction(clientId),
        ]);
        notesRef.current = ns;
        sessionRef.current = sess;
        // 「回到上次諮詢開始時」要的是最近一場**已結束**的；還開著的那場是「回到開場狀態」。
        pastRef.current = all.filter((x) => !!x.endedAt);
        pushNotes();
      } catch {
        /* 讀不到就維持現況：註記讀失敗不該讓整個規劃器停擺 */
      }
    }

    // 進場先把註記載進來（iframe 可能已經 ready，所以載完再 push 一次）
    void reload();

    /** 把失敗送回 iframe，讓它收掉樂觀更新出來的假註記／解除按鈕的等待狀態。 */
    function postErr(op: NoteErrOp, id: string | null, message: string, extra?: { blockKey?: string; body?: string }) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "lantu:noteerr", op, id, message: message || NOTE_ERR_FALLBACK, ...extra },
        window.location.origin,
      );
    }

    /** 例外的訊息只有具名錯誤才是中文，其餘一律換成看得懂的一句話。 */
    const reason = (e: unknown) =>
      e instanceof Error && e.name !== "Error" && e.message ? e.message : NOTE_ERR_FALLBACK;

    async function onNoteMsg(msg: NoteMsg) {
      if (noteAccess === "none") return;
      try {
        if (msg.type === "lantu:note" && msg.op === "add") {
          const r = await addNoteAction(clientId, { ...msg.input, sessionId: sessionRef.current?.id ?? null });
          if (r.ok) {
            notesRef.current = [...notesRef.current, r.note];
            pushNotes();
          } else {
            postErr("add", null, r.error, { blockKey: msg.input.blockKey, body: msg.input.body });
          }
        } else if (msg.type === "lantu:note" && msg.op === "del") {
          const ok = await deleteNoteAction(clientId, msg.noteId);
          if (ok) {
            notesRef.current = notesRef.current.filter((x) => x.id !== msg.noteId);
            pushNotes();
          } else {
            postErr("del", msg.noteId, "這則註記刪不掉——可能已經被刪除，或你沒有權限。");
          }
        } else if (msg.type === "lantu:session" && msg.op === "start") {
          const r = await startSessionAction(clientId, planId, msg.adoptLoose);
          if (r.ok) await reload();
          else postErr("start", null, r.error);
        } else if (msg.type === "lantu:session" && msg.op === "end") {
          const r = await endSessionAction(clientId, msg.sessionId, msg.input);
          if (r.ok) {
            await reload();
            router.refresh();
            setDraft({ sessionId: r.sessionId, draft: r.draft, todos: r.todos });
          } else {
            postErr("end", msg.sessionId, r.error);
          }
        } else if (msg.type === "lantu:session" && msg.op === "restore") {
          const r = await restoreToSessionAction(clientId, msg.sessionId);
          // 還原改的是 plans.data，整頁重載才拿得到新資料
          if (r.ok) router.refresh();
          // ⚠️ 這一支原本 else 什麼都沒做＝按鈕按下去完全沒反應，是最容易被當成「壞掉」的一種失敗。
          else postErr("restore", msg.sessionId, r.error);
        }
      } catch (e) {
        // server action 例外（到期唯讀、網路斷線…）也要回報，否則 iframe 端永遠在等
        const op: NoteErrOp = msg.type === "lantu:note" ? msg.op : msg.op;
        const id = msg.type === "lantu:note"
          ? (msg.op === "del" ? msg.noteId : null)
          : (msg.op === "start" ? null : msg.sessionId);
        postErr(op, id, reason(e),
          msg.type === "lantu:note" && msg.op === "add"
            ? { blockKey: msg.input.blockKey, body: msg.input.body }
            : undefined);
      }
    }

    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = e.data as { type?: string; data?: unknown } | null;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "lantu:ready") {
        postInit();
      } else if (msg.type === "lantu:note" || msg.type === "lantu:session") {
        void onNoteMsg(msg as unknown as NoteMsg);
      } else if (msg.type === "lantu:todos") {
        // 規劃器的「待補齊清單」勾了幾項，按下送出 → 寫進 action_items，
        // 客戶在 /portal 首頁的「我的待辦」就看得到（同一張表，不另開新的）。
        if (readOnly) {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "lantu:todosdone", error: "這份規劃目前是唯讀的，沒辦法新增客戶待辦。" },
            window.location.origin,
          );
          return;
        }
        const raw = (msg as unknown as { titles?: unknown }).titles;
        const titles = Array.isArray(raw) ? raw.map((x) => String(x)) : [];
        if (!titles.length) return;
        void (async () => {
          const r = await createActionItemsAction(clientId, titles);
          iframeRef.current?.contentWindow?.postMessage(
            r.ok
              ? { type: "lantu:todosdone", added: r.added, skipped: r.skipped }
              : { type: "lantu:todosdone", error: r.error },
            window.location.origin,
          );
          if (r.ok) router.refresh();
        })();
      } else if (msg.type === "lantu:save") {
        if (readOnly) return; // 到期唯讀：不寫回（server action 也會擋，這裡只是不要一直跳「儲存失敗」）
        latest.current = msg.data;
        setState("saving");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void doSave(), 700);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [planId, clientId, data, uiScale, readOnly, readOnlyReason, clientCode, birthDate, noteAccess, router, doSave]);

  // 還沒存完就離站＝這一段編輯直接消失。瀏覽器只給得起一句制式警告，但那一句就夠救回東西了。
  useEffect(() => {
    if (state !== "saving" && state !== "error") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state]);

  const statusText: Record<SaveState, string> = {
    idle: "",
    dirty: "未儲存",
    saving: "儲存中…",
    saved: "已儲存",
    error: "儲存失敗",
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#081a2b]">
      <div className="flex items-center gap-3 px-4 py-2 bg-[#0d2b45] border-b border-white/10 text-[#eef2f7]">
        <Link
          href={`/dashboard/clients/${clientId}`}
          onClick={() => router.refresh()}
          className="text-sm text-[#a9bccf] hover:text-[#eef2f7]"
        >
          ← 返回客戶
        </Link>
        <span className="text-sm font-bold">{year} 年度版本{label ? ` · ${label}` : ""}</span>
        {readOnly && (
          <span
            className={
              "text-[11px] font-bold px-2 py-0.5 rounded border " +
              (readOnlyReason === "collab"
                ? "border-[#3b82f6]/60 text-[#8fb8ff] bg-[#3b82f6]/10"
                : "border-[#e5484d]/60 text-[#ff9d9f] bg-[#e5484d]/10")
            }
            title={RO_NOTE[readOnlyReason]}
          >
            {RO_BADGE[readOnlyReason]}
          </span>
        )}
        <div className="flex-1" />
        <Link href={`/dashboard/plans/${planId}/history`} className="text-xs text-[#a9bccf] hover:text-[#eef2f7] mr-3">版本紀錄</Link>
        <span className={"text-xs " + (state === "saved" ? "text-[#7bbf6a]" : "text-[#6b7d8f]")}>
          {state === "error" ? "" : statusText[state]}
        </span>
      </div>

      {/* ── 存檔失敗：重試四次都沒過。12px 的四個字撐不起「你剛打的東西還沒進資料庫」這件事 ── */}
      {state === "error" && (
        <div
          role="alert"
          className="sticky top-0 z-40 flex flex-wrap items-center gap-3 px-4 py-2.5 bg-[#5b1f22] text-[#ffd7d8] border-b border-[#ff9d9f]/40"
        >
          <span className="text-[13px] font-bold">
            ⚠️ 儲存失敗——重試 4 次都沒成功，這一段修改<b className="underline">還沒進資料庫</b>。請不要關掉這個分頁。
          </span>
          <span className="text-[12px] text-[#ffb9ba]">檢查一下網路，或按「立即重試」。</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void doSave()}
            className="text-[13px] font-bold rounded-md px-3 py-1 bg-[#ffd7d8] text-[#5b1f22] hover:bg-white"
          >
            立即重試
          </button>
        </div>
      )}
      {/* 結束諮詢後就地彈出的紀錄表單。⚠️ 蓋在 iframe 上，教練不用離開編輯器；
          關掉也不會掉東西——草稿已經寫進 consult_sessions.draft_summary，
          客戶詳情頁會跳「摘要還沒存」。 */}
      {draft && (
        <div className="fixed inset-0 z-50 bg-[#040c14]/75 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
          <div className="w-full max-w-[680px]">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-sm font-bold text-[#eef2f7]">這一場的諮詢紀錄</h2>
              <div className="flex-1" />
              <button className="text-[#6b7d8f] text-lg leading-none px-2" title="稍後再存" onClick={() => { setDraft(null); setDraftErr(null); }}>✕</button>
            </div>
            <ConsultRecordForm
              plans={[{ id: planId, year }]}
              initial={{ planId, summary: draft.draft }}
              todos={draft.todos}
              notice="這是依你在各區塊留下的註記與缺口改善產出的草稿。日期、類型、內容都可以改——把整理好的紀錄整段貼上來也可以。現在不存也沒關係，客戶詳情頁會提醒你。"
              submitLabel="存成諮詢紀錄"
              pending={saving}
              error={draftErr}
              // ⚠️ 只有 finally 沒有 catch 的話，action 一 throw 就整段中斷：
              //    表單留在原地、spinner 停了、卻沒有任何訊息，看起來就是「按了沒反應」。
              onSubmit={async (v) => {
                setSaving(true);
                setDraftErr(null);
                try {
                  const r = await saveConsultRecordAction(clientId, draft.sessionId, v);
                  if (!r.ok) {
                    setDraftErr(r.error || "存不進去。請稍後再試一次。");
                    return;
                  }
                  setDraft(null);
                  router.refresh();
                } catch (e) {
                  setDraftErr(e instanceof Error && e.name !== "Error" && e.message ? e.message : "存不進去。請稍後再試一次；草稿還留著，不會消失。");
                } finally {
                  setSaving(false);
                }
              }}
              onCancel={() => { setDraft(null); setDraftErr(null); }}
              onDiscard={async () => {
                setSaving(true);
                setDraftErr(null);
                try {
                  const ok = await discardDraftAction(clientId, draft.sessionId);
                  if (!ok) {
                    setDraftErr("這份草稿丟不掉——它可能已經被存成正式紀錄了。重新整理看看。");
                    return;
                  }
                  setDraft(null);
                  router.refresh();
                } catch (e) {
                  setDraftErr(e instanceof Error && e.name !== "Error" && e.message ? e.message : "丟不掉這份草稿。請稍後再試一次。");
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="/lantu-app.html?embed=1"
        title={`嵐途規劃 ${year}`}
        className="flex-1 w-full border-0"
        onLoad={() =>
          iframeRef.current?.contentWindow?.postMessage(
            { type: "lantu:init", data, uiScale: normalizeScale(uiScale), readOnly, readOnlyNote: RO_NOTE[readOnlyReason], clientCode: clientCode ?? null, birthDate: birthDate ?? null },
            window.location.origin,
          )
        }
      />
    </div>
  );
}
