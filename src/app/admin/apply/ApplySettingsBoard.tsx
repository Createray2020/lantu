"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveApplySettingsAction } from "../actions";
import { APPLY_ROUTES, APPLY_TEXT_FIELDS, type ApplySettings, type ChecklistItem } from "@/lib/coachApply";
import { RANK_GROUP_LABEL } from "@/lib/license";

const field =
  "bg-[#0a1a2b] border border-white/15 rounded-md text-sm px-2 py-1.5 text-[#eef2f7] placeholder:text-[#4f6478]";

// 後台的報聘設定面板。
//
// ⚠️ 存檔一定要有回饋（見「後台存檔UI同步」那次事故）：Server Component 內嵌 form ＋
//    select defaultValue 的寫法會讓「選了存不進去」看起來像 bug，其實是畫面沒跟上。
//    所以這裡是受控 client 元件，存完印一行「已儲存」。
export default function ApplySettingsBoard({
  settings,
  rankCodes,
}: {
  settings: ApplySettings;
  rankCodes: string[];
}) {
  const router = useRouter();
  const [s, setS] = useState<ApplySettings>(settings);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const patch = (p: Partial<ApplySettings>) => setS((prev) => ({ ...prev, ...p }));

  function setItem(i: number, p: Partial<ChecklistItem>) {
    patch({ checklist: s.checklist.map((it, j) => (j === i ? { ...it, ...p } : it)) });
  }

  function save() {
    setMsg(null);
    setErr(null);
    start(async () => {
      // 空白標題的檢核項一律丟掉：留著會變成畫面上一個勾不掉又看不懂的空行。
      const clean = s.checklist.filter((it) => it.label.trim());
      const r = await saveApplySettingsAction({ ...s, checklist: clean });
      if (r.ok) {
        setS((prev) => ({ ...prev, checklist: clean }));
        setMsg("已儲存");
        router.refresh();
      } else setErr(r.error);
    });
  }

  return (
    <div className="grid gap-6">
      {/* ① 核准時自動帶什麼 */}
      <section className="border border-white/10 rounded-lg p-4">
        <h2 className="font-bold mb-1">核准時自動帶入</h2>
        <p className="text-[11px] text-[#6f869c] mb-3">
          三項都是「這位教練原本沒有值才寫」——後台已經手動設過的人不會被蓋掉，停權後再核准也不會被降級。
        </p>

        <div className="grid gap-3 text-sm">
          <label className="flex items-center gap-3">
            <span className="w-28 text-[#a9bccf] text-[12px]">預設職級</span>
            <select
              className={field}
              value={s.defaultRankCode ?? ""}
              onChange={(e) => patch({ defaultRankCode: e.target.value || null })}
            >
              <option value="">不帶（維持未定級）</option>
              {rankCodes.map((c) => (
                <option key={c} value={c}>
                  {RANK_GROUP_LABEL[c] ?? c}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-[#6f869c]">未定級的教練在官網不可被客戶直接指定。</span>
          </label>

          <label className="flex items-center gap-3">
            <span className="w-28 text-[#a9bccf] text-[12px]">上線</span>
            <input
              type="checkbox"
              className="accent-[#c99a5b]"
              checked={s.bindUplineToIntroducer}
              onChange={(e) => patch({ bindUplineToIntroducer: e.target.checked })}
            />
            <span className="text-[12px]">核准時把上線設成介紹人</span>
          </label>

          <div className="flex items-center gap-3">
            <span className="w-28 text-[#a9bccf] text-[12px]">使用期限</span>
            <input
              type="checkbox"
              className="accent-[#c99a5b]"
              checked={s.licenseOn}
              onChange={(e) => patch({ licenseOn: e.target.checked })}
            />
            <span className="text-[12px]">核准時一併開通</span>
            <input
              type="number"
              min={1}
              max={120}
              className={`${field} w-16`}
              value={s.licenseQty}
              disabled={!s.licenseOn}
              onChange={(e) => patch({ licenseQty: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })}
            />
            <select
              className={field}
              value={s.licenseUnit}
              disabled={!s.licenseOn}
              onChange={(e) => patch({ licenseUnit: e.target.value === "month" ? "month" : "year" })}
            >
              <option value="year">年</option>
              <option value="month">個月</option>
            </select>
            <span className="text-[11px] text-[#6f869c]">實習教練固定半年，不受這裡影響。</span>
          </div>
        </div>
      </section>

      {/* ② 申請表的必填欄位 */}
      <section className="border border-white/10 rounded-lg p-4">
        <h2 className="font-bold mb-1">申請表必填欄位</h2>
        <p className="text-[11px] text-[#6f869c] mb-3">姓名與手機永遠必填；介紹人推薦路線的介紹人編號也永遠必填。</p>
        <div className="grid gap-2 text-sm">
          {APPLY_TEXT_FIELDS.map((f) => {
            const on = s.requiredFields.includes(f.key);
            return (
              <label key={f.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-[#c99a5b]"
                  checked={on}
                  onChange={() =>
                    patch({
                      requiredFields: on
                        ? s.requiredFields.filter((k) => k !== f.key)
                        : [...s.requiredFields, f.key],
                    })
                  }
                />
                <span className="text-[13px]">{f.label}</span>
              </label>
            );
          })}
        </div>
      </section>

      {/* ③ 審核檢核表 */}
      <section className="border border-white/10 rounded-lg p-4">
        <h2 className="font-bold mb-1">審核檢核表</h2>
        <p className="text-[11px] text-[#6f869c] mb-3">
          審核者在教練帳號頁逐項打勾，標了「必勾」的沒勾完就按不下核准。只在某條路線出現的項目可以限定路線。
        </p>

        <label className="flex items-center gap-2 mb-3 text-sm">
          <input
            type="checkbox"
            className="accent-[#c99a5b]"
            checked={s.requireIntroducerConfirm}
            onChange={(e) => patch({ requireIntroducerConfirm: e.target.checked })}
          />
          <span className="text-[13px]">介紹人推薦路線：介紹人確認過才給核准</span>
        </label>

        <div className="grid gap-2">
          {s.checklist.map((it, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 border border-white/10 rounded-md p-2">
              <input
                className={`${field} flex-1 min-w-[180px]`}
                value={it.label}
                onChange={(e) => setItem(i, { label: e.target.value })}
                placeholder="檢核項目"
              />
              <label className="flex items-center gap-1 text-[12px] text-[#a9bccf]">
                <input
                  type="checkbox"
                  className="accent-[#c99a5b]"
                  checked={it.required}
                  onChange={(e) => setItem(i, { required: e.target.checked })}
                />
                必勾
              </label>
              <select
                className={field}
                value={it.routes?.length === 1 ? it.routes[0] : ""}
                onChange={(e) =>
                  setItem(i, { routes: e.target.value ? [e.target.value as (typeof APPLY_ROUTES)[number]["key"]] : undefined })
                }
              >
                <option value="">全部路線</option>
                {APPLY_ROUTES.map((r) => (
                  <option key={r.key} value={r.key}>
                    只在「{r.label}」
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => patch({ checklist: s.checklist.filter((_, j) => j !== i) })}
                className="text-[#a9bccf] hover:text-white text-xs px-2"
              >
                移除
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            patch({
              checklist: [...s.checklist, { key: `chk${Date.now().toString(36)}`, label: "", required: true }],
            })
          }
          className="mt-2 text-xs text-[#c99a5b] hover:text-[#e0bd8b]"
        >
          ＋ 新增檢核項目
        </button>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-[#c99a5b] text-[#08202a] font-bold px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存設定"}
        </button>
        {msg && <span className="text-[#7fd1a8] text-xs">{msg}</span>}
        {err && <span className="text-[#e08b7a] text-xs">失敗：{err}</span>}
      </div>
    </div>
  );
}
