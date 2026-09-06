"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { approveCoach, saveReviewChecksAction } from "../actions";
import {
  APPLY_CONSENTS,
  INTRODUCER_STATE_LABEL,
  approvalGate,
  checklistFor,
  routeMeta,
  type ApplySettings,
  type ApplyLicense,
  type IntroducerState,
} from "@/lib/coachApply";

/**
 * 「待我處理」——手機上真的做得完的那一類後台工作。
 *
 * ⚠️ 為什麼另開一頁，而不是把 /admin 的教練名冊做成手機版：
 *    那張表同時裝著兩種完全不同的任務——「核准這一位」是一次性的判斷（讀完、決定、按下去），
 *    「改職級／改期限／換組織位置」是設定工作。前者手機上做得完而且常常有人在等，
 *    後者是 12 欄表格的建構型工作，在手機上做只會做錯。
 *    把表格壓成手機版等於把兩件事一起壓小；把「判斷」單獨拉出來才做得對。
 *
 * ⚠️ 卡片本身就是二次確認：核准會一次寫入職級、組織位置與使用期限，是不可逆的。
 *    所以「按下去會寫入什麼」直接印在按鈕正上方——不是另外彈一個「確定嗎？」。
 *
 * ⚠️ 手機只給「照後台預設值核准」。要給不一樣的職級或期限，卡片不提供修改，
 *    改顯示「請用電腦開」——判斷放手機，設定留電腦。
 */

export type InboxItem = {
  id: string;
  name: string;
  email: string | null;
  clerkName: string | null;
  createdAt: string | null;
  note: string | null;
  /** 沒有申請表的舊帳號（2026/08/31 之前建的）：閘門直接放行，卡片要講明白。 */
  hasApplication: boolean;
  route: string | null;
  introducerName: string | null;
  introducerCode: string | null;
  introducerState: string;
  introducerNote: string | null;
  phone: string | null;
  currentJob: string | null;
  motive: string | null;
  experience: string | null;
  licenses: ApplyLicense[];
  consents: Record<string, string>;
  reviewChecks: Record<string, string>;
  /** 核准會寫入什麼——由伺服器把「現況 vs 預設值」算好，卡片只負責顯示。 */
  willWrite: { rank: string; upline: string; license: string };
};

const STATE_COLOR: Record<IntroducerState, string> = {
  pending: "var(--brand)",
  confirmed: "var(--ok)",
  declined: "var(--danger)",
  skipped: "var(--tx3)",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 py-1.5 border-b border-line last:border-0">
      <dt className="text-xs text-tx3">{label}</dt>
      <dd className="text-13 text-tx2 whitespace-pre-wrap break-words">{children}</dd>
    </div>
  );
}

export default function InboxBoard({
  items,
  settings,
}: {
  items: InboxItem[];
  settings: ApplySettings;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((x) => x.id === openId) ?? null;

  return (
    <div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel px-5 py-10 text-center text-tx3">
          目前沒有待審的報聘申請。
        </div>
      ) : (
        <ul className="grid gap-2.5">
          {items.map((it) => {
            const gate = approvalGate(
              {
                route: it.route,
                introducerState: it.introducerState,
                checked: Object.keys(it.reviewChecks ?? {}),
                hasApplication: it.hasApplication,
              },
              settings,
            );
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(it.id)}
                  className="w-full rounded-xl border border-line bg-panel px-4 py-3.5 text-left shadow-e1 hover:border-line2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{it.name || "（未命名）"}</div>
                      <div className="text-xs text-tx3 truncate">{it.email ?? "—"}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-11 font-bold ${
                        gate.ok ? "bg-ok/15 text-ok" : "bg-brand/15 text-brand2"
                      }`}
                    >
                      {gate.ok ? "可核准" : `尚缺 ${gate.reasons.length} 項`}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-11 text-tx3">
                    <span>{routeMeta(it.route).label}</span>
                    {it.introducerName && <span>推薦人 {it.introducerName}</span>}
                    {it.createdAt && <span>{it.createdAt} 申請</span>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <DecisionCard
          key={open.id}
          item={open}
          settings={settings}
          onClose={() => setOpenId(null)}
          onDone={() => {
            setOpenId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DecisionCard({
  item,
  settings,
  onClose,
  onDone,
}: {
  item: InboxItem;
  settings: ApplySettings;
  onClose: () => void;
  onDone: () => void;
}) {
  const [checked, setChecked] = useState<string[]>(() => Object.keys(item.reviewChecks ?? {}));
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const items = checklistFor(settings, item.route);
  const st = item.introducerState as IntroducerState;
  const gate = approvalGate(
    {
      route: item.route,
      introducerState: item.introducerState,
      checked,
      hasApplication: item.hasApplication,
    },
    settings,
  );

  function toggle(key: string) {
    const next = checked.includes(key) ? checked.filter((k) => k !== key) : [...checked, key];
    setChecked(next);
    setErr(null);
    start(async () => {
      const r = await saveReviewChecksAction(item.id, next, "");
      if (!r.ok) setErr(r.error);
    });
  }

  function approve() {
    setErr(null);
    start(async () => {
      const r = await approveCoach(item.id);
      if (r.ok) onDone();
      else setErr(r.error);
    });
  }

  return (
    <Modal onClose={onClose} labelledBy="inboxCardTitle" width="max-w-lg">
      <div className="max-h-[85dvh] overflow-y-auto">
        <div className="border-b border-line px-5 py-4">
          <h2 id="inboxCardTitle" className="font-serif text-xl">{item.name || "（未命名）"}</h2>
          <div className="mt-0.5 text-xs text-tx3">{item.email ?? "—"}</div>
          {item.clerkName && item.clerkName !== item.name && (
            <div className="text-11 text-tx3">登入姓名：{item.clerkName}</div>
          )}
        </div>

        <div className="px-5 py-4">
          {!item.hasApplication ? (
            <p className="rounded-lg border border-line bg-field px-3 py-2.5 text-13 leading-relaxed text-tx2">
              這個帳號<b className="text-tx">沒有申請表</b>（報聘流程上線前建立的舊帳號），
              所以沒有可核對的自述與證照，也不跑檢核表——確認是本人就可以直接核准。
            </p>
          ) : (
            <dl>
              <Row label="路線">
                {routeMeta(item.route).label}
              </Row>
              <Row label="推薦人">
                <span style={{ color: STATE_COLOR[st] ?? "var(--tx3)" }}>
                  {INTRODUCER_STATE_LABEL[st] ?? item.introducerState}
                </span>
                {"　"}
                {item.introducerName
                  ? `${item.introducerName}${item.introducerCode ? `（${item.introducerCode}）` : ""}`
                  : item.introducerCode
                    ? `${item.introducerCode}（查無此編號）`
                    : "—"}
                {item.introducerNote && (
                  <div className="mt-1 text-tx3">留言：{item.introducerNote}</div>
                )}
              </Row>
              {item.phone && <Row label="手機">{item.phone}</Row>}
              {item.currentJob && <Row label="現況">{item.currentJob}</Row>}
              {item.motive && <Row label="動機">{item.motive}</Row>}
              {item.experience && <Row label="經歷">{item.experience}</Row>}
              <Row label="證照">
                {item.licenses?.length
                  ? item.licenses
                      .map((l) => [l.type === "其他" ? l.name || "其他" : l.type, l.at, l.no].filter(Boolean).join(" "))
                      .join("；")
                  : "未填"}
              </Row>
              <Row label="聲明">
                {APPLY_CONSENTS.every((c) => item.consents?.[c.key])
                  ? "全數勾選"
                  : "⚠ 未完整勾選"}
              </Row>
            </dl>
          )}

          {items.length > 0 && item.hasApplication && (
            <div className="mt-4">
              <div className="mb-1.5 text-11 tracking-[0.18em] text-tx3">審核檢核</div>
              <div className="grid gap-1">
                {items.map((it) => {
                  const on = checked.includes(it.key);
                  return (
                    // 整列都可點、min-h 44px：這是手機上真的會用手指戳的地方。
                    <label
                      key={it.key}
                      className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-line px-3"
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-brand"
                        checked={on}
                        disabled={busy}
                        onChange={() => toggle(it.key)}
                      />
                      <span className="text-13 text-tx">
                        {it.label}
                        {it.required && <span className="text-brand"> *</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* ⚠️ 核准是不可逆的，而且不只是「開通」——它會一次寫入職級、組織位置與使用期限。
              把要寫進去的東西印在按鈕正上方，這張卡片本身就是二次確認。 */}
          <div className="mt-4 rounded-lg border border-brand/40 bg-brand/10 px-3.5 py-3">
            <div className="mb-1.5 text-11 tracking-[0.18em] text-brand2">按下核准會寫入</div>
            <dl className="grid gap-1 text-13 text-tx2">
              <div className="flex justify-between gap-3"><dt>職級</dt><dd className="text-tx">{item.willWrite.rank}</dd></div>
              <div className="flex justify-between gap-3"><dt>組織位置</dt><dd className="text-tx">{item.willWrite.upline}</dd></div>
              <div className="flex justify-between gap-3"><dt>使用期限</dt><dd className="text-tx">{item.willWrite.license}</dd></div>
            </dl>
            <p className="mt-2 text-11 leading-relaxed text-tx3">
              要給不一樣的職級或期限，請用電腦開「教練帳號」那一頁改——這裡只做照預設值的核准。
            </p>
          </div>

          {!gate.ok && (
            <div className="mt-3 text-13 text-brand2">核准前還要：{gate.reasons.join("、")}</div>
          )}
          {err && <div className="mt-3 text-13 text-danger">失敗：{err}</div>}
        </div>

        {/* 底部兩顆大鈕。sticky 讓它在長卡片捲動時一直在手邊。 */}
        <div className="sticky bottom-0 flex gap-2 border-t border-line bg-panel px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[48px] flex-1 rounded-lg border border-line2 text-sm text-tx2 disabled:opacity-50"
          >
            先不處理
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={busy || !gate.ok}
            aria-busy={busy}
            className="min-h-[48px] flex-[1.6] rounded-lg bg-ok-solid font-bold text-onsolid disabled:opacity-40"
          >
            {busy ? "處理中…" : "核准開通"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
