"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { applyAsCoachAction, lookupIntroducerAction } from "./actions";
import {
  APPLY_CONSENTS,
  APPLY_ROUTES,
  APPLY_TEXT_FIELDS,
  LICENSE_MAX,
  LICENSE_TYPES,
  consentsDone,
  emptyDraft,
  fieldLabel,
  missingFields,
  routeMeta,
  type ApplyDraft,
  type ApplyLicense,
  type ApplySettings,
} from "@/lib/coachApply";

const field =
  "w-full bg-[#0a1a2b] border border-white/15 rounded-md text-sm px-3 py-2 text-[#eef2f7] placeholder:text-[#4f6478]";

// 「成為教練」必須是明確動作。舊版是任何人走到 /dashboard 就被自動建成待審教練，
// 客戶點邀請連結被導進來時就變成「教練申請」——所以這裡一定要有一次確認。
//
// 2026/08/25 從一顆送出鈕加成四欄（後台審核時看得到手機與現況）。
// 2026/08/31 改成完整的報聘表：先選路線 → 自述 → 證照 → 聲明。
//   · 教練推薦：填推薦人教練編號，送出後由他確認推薦，再進審核。
//   · 直接申請：不需要任何人先確認，直接送進審核佇列。
//   · 必填規則與聲明由 lib/coachApply 那份純函式決定，與 server action 共用同一份。
export default function ApplyForm({
  email,
  defaultName = "",
  settings,
}: {
  email: string | null;
  defaultName?: string;
  settings: ApplySettings;
}) {
  const [d, setD] = useState<ApplyDraft>(() => emptyDraft(defaultName));
  const [introName, setIntroName] = useState<string | null>(null);
  const [introBad, setIntroBad] = useState(false);
  const [err, setErr] = useState("");
  const [busy, startSubmit] = useTransition();

  const patch = (p: Partial<ApplyDraft>) => setD((prev) => ({ ...prev, ...p }));
  const meta = routeMeta(d.route);
  const missing = missingFields(d, settings);
  const ready = missing.length === 0 && consentsDone(d.consents);
  const req = (key: string) => settings.requiredFields.includes(key);

  async function checkIntroducer(code: string) {
    setIntroName(null);
    setIntroBad(false);
    if (!code.trim()) return;
    const r = await lookupIntroducerAction(code);
    if (r.ok) setIntroName(r.name);
    else setIntroBad(true);
  }

  function setLicense(i: number, p: Partial<ApplyLicense>) {
    patch({ licenses: d.licenses.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  }

  return (
    <div className="w-full max-w-xl">
      <div className="text-center">
        <h1 className="font-serif text-2xl tracking-[0.1em] mb-3">申請成為嵐途財務教練</h1>
        <p className="text-[#a9bccf] text-sm leading-relaxed mb-2">
          送出後由嵐途審核（含費用確認），開通即可使用完整的教練工作台。
        </p>
        <p className="text-[#6f869c] text-xs mb-7">登入帳號：{email || "（未提供 email）"}</p>
      </div>

      {/* ① 報聘路線 —— 先選路線，後面的欄位跟著變（推薦人只在推薦路線出現）。 */}
      <h2 className="text-[13px] text-[#c99a5b] font-bold mb-2">① 報聘路線</h2>
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {APPLY_ROUTES.map((r) => {
          const on = d.route === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => patch({ route: r.key })}
              className={`text-left rounded-lg border p-3 transition ${
                on ? "border-[#c99a5b] bg-[#c99a5b]/10" : "border-white/15 hover:border-white/30"
              }`}
            >
              <div className={`text-sm font-bold ${on ? "text-[#e0bd8b]" : "text-[#eef2f7]"}`}>{r.label}</div>
              <div className="text-[11px] text-[#a9bccf] leading-relaxed mt-1">{r.desc}</div>
            </button>
          );
        })}
      </div>

      {/* ② 基本資料 */}
      <h2 className="text-[13px] text-[#c99a5b] font-bold mb-2">② 基本資料</h2>
      <div className="grid gap-3 text-left mb-6">
        <div>
          <label className="text-[11px] text-[#a9bccf]">
            姓名 <span className="text-[#c99a5b]">*</span>
          </label>
          <input className={field} value={d.name} onChange={(e) => patch({ name: e.target.value })} placeholder="王小明" />
        </div>
        <div>
          <label className="text-[11px] text-[#a9bccf]">
            手機 <span className="text-[#c99a5b]">*</span>
          </label>
          {/* 不做格式驗證：擋掉境外號碼或分機的代價，遠大於少數格式不一致的困擾。 */}
          <input
            className={field}
            value={d.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            inputMode="tel"
            placeholder="0912-345-678"
          />
        </div>

        {meta.needsIntroducer && (
          <div>
            <label className="text-[11px] text-[#a9bccf]">
              推薦人教練編號 <span className="text-[#c99a5b]">*</span>
            </label>
            <input
              className={field}
              value={d.introducerCode}
              onChange={(e) => {
                patch({ introducerCode: e.target.value });
                setIntroName(null);
                setIntroBad(false);
              }}
              onBlur={(e) => checkIntroducer(e.target.value)}
              placeholder="例 FC2608012"
            />
            {introName && <p className="mt-1 text-[11px] text-[#7fd1a8]">推薦人：{introName}</p>}
            {introBad && (
              <p className="mt-1 text-[11px] text-[#e0a25b]">查無這個編號，仍可送出，但會由嵐途人工確認推薦人。</p>
            )}
            <p className="mt-1 text-[11px] text-[#6f869c]">送出後會通知這位教練確認推薦，確認後才進入審核。</p>
          </div>
        )}

        {APPLY_TEXT_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-[11px] text-[#a9bccf]">
              {f.label} {req(f.key) && <span className="text-[#c99a5b]">*</span>}
            </label>
            {f.rows > 1 ? (
              <textarea
                className={field}
                rows={f.rows}
                value={d[f.key]}
                onChange={(e) => patch({ [f.key]: e.target.value } as Partial<ApplyDraft>)}
                placeholder={f.placeholder}
              />
            ) : (
              <input
                className={field}
                value={d[f.key]}
                onChange={(e) => patch({ [f.key]: e.target.value } as Partial<ApplyDraft>)}
                placeholder={f.placeholder}
              />
            )}
          </div>
        ))}
      </div>

      {/* ③ 證照／資歷 —— 結構化欄位，不收上傳檔（本站沒有檔案儲存服務）。 */}
      <h2 className="text-[13px] text-[#c99a5b] font-bold mb-1">③ 證照與資歷</h2>
      <p className="text-[11px] text-[#6f869c] mb-2">沒有證照也可以申請，這一段是選填；完整填寫有助於後續審核。</p>
      <div className="grid gap-2 mb-3">
        {d.licenses.map((r, i) => (
          <div key={i} className="grid sm:grid-cols-[1fr_auto] gap-2 items-start border border-white/10 rounded-md p-2">
            <div className="grid gap-2">
              <select className={field} value={r.type} onChange={(e) => setLicense(i, { type: e.target.value })}>
                <option value="">選擇證照類別…</option>
                {LICENSE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {r.type === "其他" && (
                <input
                  className={field}
                  value={r.name ?? ""}
                  onChange={(e) => setLicense(i, { name: e.target.value })}
                  placeholder="證照名稱"
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={field}
                  value={r.at ?? ""}
                  onChange={(e) => setLicense(i, { at: e.target.value })}
                  placeholder="取得年月 2024-06"
                />
                <input
                  className={field}
                  value={r.no ?? ""}
                  onChange={(e) => setLicense(i, { no: e.target.value })}
                  placeholder="證書字號（選填）"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => patch({ licenses: d.licenses.filter((_, j) => j !== i) })}
              className="text-[#a9bccf] hover:text-white text-xs px-2 py-1"
            >
              移除
            </button>
          </div>
        ))}
      </div>
      {d.licenses.length < LICENSE_MAX && (
        <button
          type="button"
          onClick={() => patch({ licenses: [...d.licenses, { type: "" }] })}
          className="text-xs text-[#c99a5b] hover:text-[#e0bd8b] mb-6"
        >
          ＋ 新增一項證照
        </button>
      )}

      {/* ④ 聲明 —— 全部勾了才送得出去。嵐途是一般顧問公司、純顧問費，界線在入口就要講清楚。 */}
      <h2 className="text-[13px] text-[#c99a5b] font-bold mb-2 mt-4">④ 聲明</h2>
      <div className="grid gap-2 mb-6">
        {APPLY_CONSENTS.map((c) => {
          const on = d.consents.includes(c.key);
          return (
            <label key={c.key} className="flex gap-2 items-start text-[12px] text-[#a9bccf] leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                className="mt-[3px] accent-[#c99a5b]"
                checked={on}
                onChange={() =>
                  patch({ consents: on ? d.consents.filter((k) => k !== c.key) : [...d.consents, c.key] })
                }
              />
              <span>{c.label}</span>
            </label>
          );
        })}
      </div>

      <button
        onClick={() =>
          startSubmit(async () => {
            setErr("");
            const r = await applyAsCoachAction(d);
            if (r && !r.ok) setErr(r.error);
          })
        }
        disabled={busy || !ready}
        className="w-full font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? "送出中…" : meta.needsIntroducer ? "送出報聘申請（通知推薦人確認）" : "送出報聘申請"}
      </button>
      {err && <p className="mt-2 text-center text-[11px] text-[#e0a25b]">{err}</p>}
      {!ready && (
        <p className="mt-2 text-center text-[11px] text-[#6f869c]">
          {missing.length ? `還缺：${missing.map(fieldLabel).join("、")}` : "聲明全部勾選後才送得出去"}
        </p>
      )}

      <div className="mt-8 pt-6 border-t border-white/10 text-center">
        <p className="text-[#6f869c] text-xs mb-3">不是要當教練？</p>
        <Link href="/portal" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">
          我是客戶，前往我的財務規劃 →
        </Link>
      </div>
    </div>
  );
}
