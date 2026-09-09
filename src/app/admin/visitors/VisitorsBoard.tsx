"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { VisitorStats } from "@/lib/visitors";

export type VisitorRow = {
  id: string;
  name: string | null;
  email: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
  clientCode: string | null;
  passportSaved: boolean;
  passportAt: string | null;
  healthGrade: string | null;
  coachState: "none" | "pending" | "linked";
  coachName: string | null;
  applyState: "none" | "introducer" | "review" | "active" | "suspended";
  applyAt: string | null;
};

const CHIP = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-11 font-bold whitespace-nowrap";
const OK = `${CHIP} bg-ok/16 text-ok`;
const WARN = `${CHIP} bg-brand/18 text-brand2`;
const MUT = `${CHIP} bg-panel2 text-tx2 border border-line`;

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDay(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
/** 「多久沒回來」比絕對時間更能一眼看出溫度。
 *  ⚠️ 基準時間由伺服器端算好傳進來，不在渲染中呼叫 Date.now()：
 *     那是不純的（同一次渲染兩次呼叫可能不同），react-hooks/purity 也會擋。 */
function ago(iso: string | null, now: number) {
  if (!iso) return null;
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 個月前`;
  return `${Math.floor(days / 365)} 年前`;
}

const APPLY_LABEL: Record<VisitorRow["applyState"], string> = {
  none: "—",
  introducer: "待推薦人確認",
  review: "待後台審核",
  active: "已開通教練",
  suspended: "教練已停權",
};

type Tab = "all" | "returned" | "passport" | "linked" | "applying" | "idle";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "returned", label: "7 天內回來過" },
  { key: "passport", label: "已存護照" },
  { key: "linked", label: "已指定教練" },
  { key: "applying", label: "報聘進行中" },
  { key: "idle", label: "只註冊沒再回來" },
];

export default function VisitorsBoard({ rows, stats, now }: { rows: VisitorRow[]; stats: VisitorStats; now: number }) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const week = now - 7 * 86400000;
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "returned" && !(r.lastLoginAt && new Date(r.lastLoginAt).getTime() >= week)) return false;
      if (tab === "passport" && !r.passportSaved) return false;
      if (tab === "linked" && r.coachState !== "linked") return false;
      if (tab === "applying" && !(r.applyState === "introducer" || r.applyState === "review")) return false;
      if (tab === "idle" && r.loginCount > 1) return false;
      if (!kw) return true;
      return [r.name, r.email, r.clientCode, r.coachName].some((v) => (v ?? "").toLowerCase().includes(kw));
    });
  }, [rows, tab, q, now]);

  return (
    <>
      {/* 六個數字先講完整體，再讓人往下看名單。分頁本身就是這六個數字的篩選器，
          所以數字與分頁擺在一起，點了就是那一群人。 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-4">
        <Stat label="註冊訪客" value={stats.total} />
        <Stat label="7 天內回來過" value={stats.active7d} tone="ok" />
        <Stat label="已存人生護照" value={stats.passportSaved} />
        <Stat label="已指定教練" value={stats.coachLinked} />
        <Stat label="報聘進行中" value={stats.applying} tone="warn" />
        <Stat label="只註冊沒再回來" value={stats.oneShot} tone="mut" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "rounded-lg px-2.5 py-1.5 text-13 whitespace-nowrap border transition " +
                (tab === t.key
                  ? "bg-brand text-onbrand border-brand font-bold"
                  : "text-tx2 border-line hover:bg-panel3 hover:text-tx")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋姓名 / Email / 客戶編號 / 教練"
          className="w-full sm:w-64 bg-field border border-line rounded-lg px-3 py-1.5 text-sm"
        />
      </div>

      <div className="text-xs text-tx3 mb-2">
        顯示 <b className="text-tx2">{shown.length}</b> / {rows.length} 位
      </div>

      <div className="tbl-wrap rounded-xl border border-line">
        <table className="min-w-[1040px] w-full text-sm tbl-sticky">
          <thead>
            <tr className="bg-panel2 text-tx2 text-left text-xs">
              <th className="px-3 py-2 font-semibold">訪客</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">註冊日</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">最後登入</th>
              <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">登入次數</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">人生護照</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">指定教練</th>
              <th className="px-3 py-2 font-semibold whitespace-nowrap">申請成為教練</th>
              <th className="px-3 py-2 font-semibold text-right"></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-tx3">沒有符合條件的訪客</td></tr>
            )}
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="px-3 py-2">
                  <div className="font-semibold flex items-center gap-1.5">
                    {r.name || "（未填姓名）"}
                    {r.status !== "active" && <span className={WARN}>已停權</span>}
                  </div>
                  <div className="text-tx3 text-11">{r.email || "—"}</div>
                  {r.clientCode && <div className="text-tx3 text-11">編號 {r.clientCode}</div>}
                </td>
                <td className="px-3 py-2 text-tx2 whitespace-nowrap">{fmtDay(r.createdAt)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.lastLoginAt ? (
                    <>
                      <div className="text-tx2">{fmt(r.lastLoginAt)}</div>
                      <div className="text-tx3 text-11">{ago(r.lastLoginAt, now)}</div>
                    </>
                  ) : (
                    // ⚠️ 「—」有兩種來源：真的沒回來過，以及這個欄位上線前就註冊的舊帳號。
                    //    這裡不猜，只標示「無紀錄」。
                    <span className="text-tx3">無紀錄</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.loginCount > 0 ? r.loginCount : <span className="text-tx3">—</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.passportSaved ? (
                    <>
                      <span className={OK}>已存檔{r.healthGrade ? ` · ${r.healthGrade}` : ""}</span>
                      <div className="text-tx3 text-11 mt-0.5">{fmtDay(r.passportAt)}</div>
                    </>
                  ) : (
                    <span className={MUT}>未建立</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.coachState === "linked" ? (
                    <span className={OK}>已掛上 · {r.coachName || "—"}</span>
                  ) : r.coachState === "pending" ? (
                    <span className={WARN}>申請中 · {r.coachName || "—"}</span>
                  ) : (
                    <span className={MUT}>未指定</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.applyState === "none" ? (
                    <span className="text-tx3">—</span>
                  ) : (
                    <>
                      <span className={r.applyState === "active" ? OK : r.applyState === "suspended" ? MUT : WARN}>
                        {APPLY_LABEL[r.applyState]}
                      </span>
                      {r.applyAt && <div className="text-tx3 text-11 mt-0.5">{fmtDay(r.applyAt)}</div>}
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link href={`/admin/visitors/${r.id}`} className="text-xs text-tx2 underline underline-offset-2 hover:text-tx">
                    明細
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "mut" }) {
  const color = tone === "ok" ? "text-ok-solid" : tone === "warn" ? "text-brand" : tone === "mut" ? "text-tx3" : "text-tx";
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
      <div className="text-11 text-tx3">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
