"use client";

import { useState, useTransition } from "react";
import {
  INTERN_MONTHS, RANK_GROUP_LABEL, addPeriod, licenseState,
  type LicenseUnit,
} from "@/lib/license";
import { setLicenseAction, setClientCapAction } from "./licenseActions";

// 後台的「級別 · 使用期限」格。
//
// 實習教練固定半年，UI 直接把單位與數量鎖死 —— 讓人選得出「實習 + 3 年」，
// 系統就得回答那是什麼意思，而制度上沒有那個東西。
export default function LicenseCell({
  id,
  rankCode,
  licenseFrom,
  licenseUntil,
  licenseUnit,
  licenseQty,
  clientCapOverride,
  status,
  rankCodes,
  capFromRank,
  usedClients,
}: {
  id: string;
  rankCode: string | null;
  licenseFrom: string | null;
  licenseUntil: string | null;
  licenseUnit: string | null;
  licenseQty: number | null;
  clientCapOverride: number | null;
  status: string;
  rankCodes: string[];
  capFromRank: number | null;
  usedClients: number;
}) {
  const [open, setOpen] = useState(false);
  const [rank, setRank] = useState(rankCode ?? "");
  const [from, setFrom] = useState(licenseFrom ?? todayLocal());
  const [unit, setUnit] = useState<LicenseUnit>(licenseUnit === "year" ? "year" : "month");
  const [qty, setQty] = useState(licenseQty ?? 1);
  const [cap, setCap] = useState(clientCapOverride == null ? "" : String(clientCapOverride));
  const [msg, setMsg] = useState("");
  const [busy, startTransition] = useTransition();

  const isIntern = rank === "INTERN";
  const effUnit: LicenseUnit = isIntern ? "month" : unit;
  const effQty = isIntern ? INTERN_MONTHS : Math.max(1, Math.round(qty || 1));
  const preview = from ? addPeriod(from, effUnit, effQty) : "";

  const st = licenseState({ licenseUntil, status });
  const cap效 = clientCapOverride ?? capFromRank;

  function save() {
    setMsg("");
    startTransition(async () => {
      const r = await setLicenseAction(id, {
        rankCode: rank || null,
        licenseFrom: from,
        unit: effUnit,
        qty: effQty,
      });
      setMsg(r.ok ? "已更新" : r.error);
      if (r.ok) setOpen(false);
    });
  }

  function saveCap() {
    setMsg("");
    startTransition(async () => {
      const v = cap.trim() === "" ? null : Math.max(0, Math.round(Number(cap)));
      const r = await setClientCapAction(id, Number.isFinite(v as number) || v === null ? v : null);
      setMsg(r.ok ? "已更新" : r.error);
    });
  }

  return (
    <div className="text-xs leading-relaxed">
      <div className="font-bold text-[#e0bd8b]">
        {rankCode ? (RANK_GROUP_LABEL[rankCode] ?? rankCode) : <span className="text-[#6f869c] font-normal">未定級</span>}
      </div>
      <div className={st.expired ? "text-[#ff9d9f]" : st.warn ? "text-[#e0bd8b]" : "text-[#a9bccf]"}>
        {!st.managed
          ? "未設定期限（不鎖）"
          : st.expired
            ? `已到期 ${licenseUntil}`
            : `至 ${licenseUntil}（剩 ${st.daysLeft} 天）`}
      </div>
      <div className="text-[#6f869c]">
        客戶 {usedClients}
        {cap效 == null ? " / 不限" : ` / ${cap效}`}
        {clientCapOverride != null && <span className="text-[#c99a5b]">（個別覆寫）</span>}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 text-[#a9bccf] hover:text-white underline underline-offset-2"
      >
        {open ? "收合" : "設定"}
      </button>

      {open && (
        <div className="mt-2 p-2 rounded-lg bg-[#0c2135] border border-white/10 space-y-2 min-w-[250px]">
          <label className="block">
            <span className="text-[#6f869c]">級別</span>
            <select
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              className="w-full mt-0.5 bg-[#081a2b] border border-white/15 rounded px-1.5 py-1"
            >
              <option value="">（未定級）</option>
              {rankCodes.map((c) => (
                <option key={c} value={c}>
                  {RANK_GROUP_LABEL[c] ?? c}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[#6f869c]">起算日</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full mt-0.5 bg-[#081a2b] border border-white/15 rounded px-1.5 py-1"
            />
          </label>

          <div className="flex items-end gap-1.5">
            <label className="flex-1">
              <span className="text-[#6f869c]">期間</span>
              <input
                type="number"
                min={1}
                value={effQty}
                disabled={isIntern}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-full mt-0.5 bg-[#081a2b] border border-white/15 rounded px-1.5 py-1 disabled:opacity-50"
              />
            </label>
            <select
              value={effUnit}
              disabled={isIntern}
              onChange={(e) => setUnit(e.target.value === "year" ? "year" : "month")}
              className="bg-[#081a2b] border border-white/15 rounded px-1.5 py-1 disabled:opacity-50"
            >
              <option value="month">個月</option>
              <option value="year">年</option>
            </select>
          </div>
          {isIntern && (
            <p className="text-[#6f869c]">實習教練固定 {INTERN_MONTHS} 個月學習期，不可調整。</p>
          )}
          <p className="text-[#a9bccf]">
            到期日：<b className="text-[#e0bd8b]">{preview || "—"}</b>
            <span className="text-[#6f869c]">（含當日）</span>
          </p>

          <button
            type="button"
            onClick={save}
            disabled={busy || !from}
            className="w-full bg-[#c99a5b] text-[#08202a] font-bold rounded px-2 py-1 disabled:opacity-50"
          >
            {licenseUntil ? "延長 / 更新期限" : "開通期限"}
          </button>

          <div className="pt-2 border-t border-white/10">
            <label className="block">
              <span className="text-[#6f869c]">客戶上限覆寫（留空＝依級別 {capFromRank ?? "不限"}）</span>
              <div className="flex gap-1.5 mt-0.5">
                <input
                  type="number"
                  min={0}
                  value={cap}
                  placeholder={capFromRank == null ? "不限" : String(capFromRank)}
                  onChange={(e) => setCap(e.target.value)}
                  className="flex-1 bg-[#081a2b] border border-white/15 rounded px-1.5 py-1"
                />
                <button
                  type="button"
                  onClick={saveCap}
                  disabled={busy}
                  className="border border-white/20 rounded px-2 disabled:opacity-50"
                >
                  儲存
                </button>
              </div>
            </label>
          </div>

          {msg && <p className="text-[#e0bd8b]">{msg}</p>}
        </div>
      )}
      {!open && msg && <p className="text-[#e0bd8b] mt-1">{msg}</p>}
    </div>
  );
}

// 用瀏覽器當地時間取今天（後台操作者在台灣，UTC 會在晚上八點後差一天）。
function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
