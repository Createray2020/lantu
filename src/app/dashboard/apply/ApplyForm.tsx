"use client";

import { useState } from "react";
import Link from "next/link";
import { applyAsCoachAction } from "./actions";

const field =
  "w-full bg-[#0a1a2b] border border-white/15 rounded-md text-sm px-3 py-2 text-[#eef2f7] placeholder:text-[#4f6478]";

// 「成為教練」必須是明確動作。舊版是任何人走到 /dashboard 就被自動建成待審教練，
// 客戶點邀請連結被導進來時就變成「教練申請」——所以這裡一定要有一次確認。
//
// 2026/08/25 從「一顆送出鈕」加成四欄：後台審核時看到的只有 email 與 Clerk 姓名，
// 每一件都要回頭私訊問手機與現況。姓名／手機必填，現職與推薦人選填。
export default function ApplyForm({ email, defaultName = "" }: { email: string | null; defaultName?: string }) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [currentJob, setCurrentJob] = useState("");
  const [sponsorCode, setSponsorCode] = useState("");
  const [busy, setBusy] = useState(false);

  const ready = name.trim().length > 0 && phone.trim().length > 0;

  return (
    <div className="w-full max-w-md">
      <div className="text-center">
        <h1 className="font-serif text-2xl tracking-[0.1em] mb-3">申請成為嵐途財務教練</h1>
        <p className="text-[#a9bccf] text-sm leading-relaxed mb-2">
          送出後由嵐途審核（含費用確認），開通即可使用完整的教練工作台。
        </p>
        <p className="text-[#6f869c] text-xs mb-7">登入帳號：{email || "（未提供 email）"}</p>
      </div>

      <div className="grid gap-3 text-left">
        <div>
          <label className="text-[11px] text-[#a9bccf]">姓名 <span className="text-[#c99a5b]">*</span></label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="王小明" />
        </div>
        <div>
          <label className="text-[11px] text-[#a9bccf]">手機 <span className="text-[#c99a5b]">*</span></label>
          {/* 不做格式驗證：擋掉境外號碼或分機的代價，遠大於少數格式不一致的困擾。 */}
          <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0912-345-678" />
        </div>
        <div>
          <label className="text-[11px] text-[#a9bccf]">目前工作／現況</label>
          <input className={field} value={currentJob} onChange={(e) => setCurrentJob(e.target.value)} placeholder="例：壽險業務三年／會計事務所／應屆畢業" />
        </div>
        <div>
          <label className="text-[11px] text-[#a9bccf]">推薦人教練編號</label>
          <input className={field} value={sponsorCode} onChange={(e) => setSponsorCode(e.target.value)} placeholder="例 FC2608012（沒有可留空）" />
        </div>
      </div>

      <button
        onClick={async () => {
          setBusy(true);
          await applyAsCoachAction({ name, phone, currentJob, sponsorCode });
        }}
        disabled={busy || !ready}
        className="mt-6 w-full font-bold text-[#08202a] bg-[#c99a5b] hover:bg-[#e0bd8b] px-6 py-2.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? "送出中…" : "送出教練申請"}
      </button>
      {!ready && <p className="mt-2 text-center text-[11px] text-[#6f869c]">姓名與手機填了才送得出去</p>}

      <div className="mt-8 pt-6 border-t border-white/10 text-center">
        <p className="text-[#6f869c] text-xs mb-3">不是要當教練？</p>
        <Link href="/portal" className="text-sm text-[#a7bacb] hover:text-white underline underline-offset-4">
          我是客戶，前往我的財務規劃 →
        </Link>
      </div>
    </div>
  );
}
