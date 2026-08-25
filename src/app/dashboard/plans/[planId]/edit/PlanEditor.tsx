"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  savePlanDataAction,
  addNoteAction,
  deleteNoteAction,
  listNotesAction,
  startSessionAction,
  endSessionAction,
  openSessionAction,
  listSessionsAction,
  restoreToSessionAction,
} from "../../../actions";
import type { NoteRow, NoteInput } from "@/lib/notes";
import type { SessionRow, EndInput } from "@/lib/consultSession";
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
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<unknown>(null);
  const [state, setState] = useState<SaveState>("idle");

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

    async function onNoteMsg(msg: NoteMsg) {
      if (noteAccess === "none") return;
      try {
        if (msg.type === "lantu:note" && msg.op === "add") {
          const r = await addNoteAction(clientId, { ...msg.input, sessionId: sessionRef.current?.id ?? null });
          if (r.ok) {
            notesRef.current = [...notesRef.current, r.note];
            pushNotes();
          }
        } else if (msg.type === "lantu:note" && msg.op === "del") {
          const ok = await deleteNoteAction(clientId, msg.noteId);
          if (ok) {
            notesRef.current = notesRef.current.filter((x) => x.id !== msg.noteId);
            pushNotes();
          }
        } else if (msg.type === "lantu:session" && msg.op === "start") {
          const r = await startSessionAction(clientId, planId, msg.adoptLoose);
          if (r.ok) await reload();
        } else if (msg.type === "lantu:session" && msg.op === "end") {
          const r = await endSessionAction(clientId, msg.sessionId, msg.input);
          if (r.ok) {
            await reload();
            router.refresh();
          }
        } else if (msg.type === "lantu:session" && msg.op === "restore") {
          const r = await restoreToSessionAction(clientId, msg.sessionId);
          if (r.ok) router.refresh(); // 還原改的是 plans.data，整頁重載才拿得到新資料
        }
      } catch {
        /* server action 失敗不影響規劃器本體 */
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
      } else if (msg.type === "lantu:save") {
        if (readOnly) return; // 到期唯讀：不寫回（server action 也會擋，這裡只是不要一直跳「儲存失敗」）
        latest.current = msg.data;
        setState("saving");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
          try {
            await savePlanDataAction(planId, latest.current);
            setState("saved");
          } catch {
            setState("error");
          }
        }, 700);
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [planId, clientId, data, uiScale, readOnly, readOnlyReason, clientCode, noteAccess, router]);

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
        <span className={"text-xs " + (state === "error" ? "text-[#d9773f]" : state === "saved" ? "text-[#7bbf6a]" : "text-[#6b7d8f]")}>
          {statusText[state]}
        </span>
      </div>
      <iframe
        ref={iframeRef}
        src="/lantu-app.html?embed=1"
        title={`嵐途規劃 ${year}`}
        className="flex-1 w-full border-0"
        onLoad={() =>
          iframeRef.current?.contentWindow?.postMessage(
            { type: "lantu:init", data, uiScale: normalizeScale(uiScale), readOnly, readOnlyNote: RO_NOTE[readOnlyReason], clientCode: clientCode ?? null },
            window.location.origin,
          )
        }
      />
    </div>
  );
}
