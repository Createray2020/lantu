"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtMoney, stageColor, stageName } from "../../../dashboard/format";
import { addTemplatePlanAction } from "../actions";

type PlanRow = {
  id: string;
  year: number;
  label: string | null;
  track: string;
  healthGrade: string | null;
  netWorth: number | null;
};

export default function TemplatePlanList({
  templateId,
  plans,
}: {
  templateId: string;
  plans: PlanRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-serif text-lg">年度版本</h2>
        <span className="text-tx3 text-sm">{plans.length}</span>
        <div className="flex-1" />
        {adding ? (
          <div className="flex items-center gap-2">
            <input
              value={year}
              onChange={(e) => setYear(e.target.value)}
              inputMode="numeric"
              className="w-24 bg-field border border-line2 rounded-md text-sm px-2.5 py-1.5 text-tx"
              placeholder="2026"
              autoFocus
            />
            <button
              onClick={() => {
                setErr("");
                start(async () => {
                  try {
                    const r = await addTemplatePlanAction(templateId, Number(year));
                    if (!r.ok) { setErr(r.error); return; }
                    setAdding(false);
                    router.push(`/admin/templates/${templateId}/plans/${r.planId}`);
                  } catch {
                    setErr("新增失敗，請重試。");
                  }
                });
              }}
              disabled={pending}
              className="rounded-md bg-brand text-onbrand font-bold text-sm px-3 py-1.5 disabled:opacity-40"
            >
              {pending ? "建立中…" : "建立"}
            </button>
            <button onClick={() => { setAdding(false); setErr(""); }} className="text-sm text-tx2 px-1.5">取消</button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-md border border-brand/50 text-brand2 text-sm px-3 py-1.5 hover:bg-brand/10"
          >
            ＋ 新增年度版本
          </button>
        )}
      </div>

      {err && (
        <div role="alert" className="mb-3 text-sm text-danger bg-danger-solid/15 border border-danger-solid/40 rounded-lg px-3 py-2">
          {err}
        </div>
      )}

      {plans.length === 0 ? (
        <div className="text-center py-14 text-tx3 border border-dashed border-line rounded-xl">
          這份範本還沒有任何年度版本。
        </div>
      ) : (
        <div className="grid gap-2">
          {plans.map((p) => (
            <Link
              key={p.id}
              href={`/admin/templates/${templateId}/plans/${p.id}`}
              className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-center bg-panel hover:bg-panel2 border border-line rounded-lg px-3 py-3 transition shadow-e1"
            >
              <div className="font-bold">
                {p.year}
                {p.label && <span className="ml-2 text-xs font-normal text-tx2">{p.label}</span>}
                {/* 客戶軌（人生護照）示範也可以是範本的一部分，但它跟教練軌不是同一種東西，要標出來。 */}
                {p.track !== "coach" && (
                  <span className="ml-2 text-10 px-1.5 py-0.5 rounded border border-line2 text-tx2">人生護照</span>
                )}
              </div>
              <div className="text-xs font-bold" style={{ color: stageColor(p.healthGrade) }}>
                {p.healthGrade ? stageName(p.healthGrade) : "—"}
              </div>
              <div className="text-sm tabular-nums text-tx">{fmtMoney(p.netWorth ?? null)}</div>
              <div className="text-xs text-brand2">編輯內容 →</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
