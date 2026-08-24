"use client";

import { useMemo, useState, useTransition } from "react";
import {
  saveInsProductAction, deleteInsProductAction, importInsProductsAction, type ActionResult,
} from "./actions";
import type { InsProductRow } from "@/lib/insProducts.defaults";
import { INS_PRODUCT_KINDS } from "@/lib/insProducts.defaults";

// 保險商品輕量主檔的後台面板。
//
// ⚠️ 定位：只當「既有保單登錄」的輸入輔助。這張表刻意不存給付公式、費率、各年保障——
// 那些一旦進來，這裡就變成比價工具，而嵐途是一般顧問公司、不做商品推薦也不碰佣金。
// 客戶的保單是他各自跟保險公司買的，把商品名稱記準是「事實登錄」，跟推薦無關。
//
// 商品是幾千筆，不可能一列一列敲 → CSV 匯入才是主要入口，手動新增只用於補一兩筆。

const inputCls =
  "w-full rounded border border-white/15 bg-[#0b2136] px-2 py-1 text-sm text-[#eef2f7] outline-none focus:border-[#c99a5b]";
const btnCls =
  "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-40";

type Draft = { company: string; code: string; name: string; kind: string; mainRider: string; onSale: boolean; bigCat: string };
const EMPTY: Draft = { company: "", code: "", name: "", kind: "", mainRider: "主約", onSale: true, bigCat: "人身" };

export default function InsProductsBoard({ rows }: { rows: InsProductRow[] }) {
  const [pick, setPick] = useState<string>("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionResult>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { setMsg(okMsg); setErr(null); }
      else { setErr(r.error); setMsg(null); }
    });

  const companies = useMemo(() => {
    const seen = new Map<string, { name: string; cat: string; n: number }>();
    for (const r of rows) {
      const e = seen.get(r.company) ?? { name: r.company, cat: r.bigCat, n: 0 };
      if (r.code || r.name) e.n += 1;
      seen.set(r.company, e);
    }
    return Array.from(seen.values());
  }, [rows]);

  const products = useMemo(
    () => rows.filter((r) => r.company === pick && (r.code || r.name)),
    [rows, pick],
  );

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d2b45] p-5 mt-6">
      <div className="flex items-baseline gap-3 flex-wrap mb-1">
        <h2 className="text-sm font-bold border-l-[3px] border-[#e0bd8b] pl-2">保險商品主檔（輸入輔助）</h2>
        <span className="text-xs text-[#6f869c]">{companies.length} 家公司・{rows.filter((r) => r.code || r.name).length} 個商品</span>
      </div>
      <p className="text-xs text-[#6f869c] mb-4 leading-relaxed">
        這張表只是保單登錄時的<b className="text-[#a9bccf]">建議清單</b>——教練仍然可以自由輸入沒收錄的商品。
        <b className="text-[#e0bd8b]">刻意不存給付公式、費率、各年保障</b>：嵐途不做商品比較或推薦，
        這裡記的是「客戶已經買了什麼」的名稱與代號，好讓跨客戶的統計對得起來。
      </p>

      {(msg || err) && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${err ? "bg-[#4a2020] text-[#f0b8b8]" : "bg-[#1d3a2a] text-[#a7dcbb]"}`}>
          {err ?? msg}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div>
          <div className="text-xs text-[#6f869c] mb-1">保險公司</div>
          <div className="max-h-[320px] overflow-y-auto rounded border border-white/10">
            {companies.map((co) => (
              <button
                key={co.name}
                onClick={() => { setPick(co.name); setDraft({ ...EMPTY, company: co.name, bigCat: co.cat }); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${pick === co.name ? "bg-[#17406a] text-[#eef2f7]" : "text-[#a9bccf] hover:bg-[#123553]"}`}
              >
                <span className="flex-1">{co.name}</span>
                <span className="text-[10px] text-[#6f869c]">{co.cat}</span>
                <span className="text-[10px] text-[#6f869c]">{co.n || ""}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          {!pick ? (
            <div className="text-sm text-[#6f869c] py-8 text-center">先從左邊選一家保險公司。</div>
          ) : (
            <>
              <div className="overflow-x-auto rounded border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-[#0b2136] text-xs text-[#6f869c]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">代號</th>
                      <th className="px-2 py-1.5 text-left">商品名稱</th>
                      <th className="px-2 py-1.5 text-left">總類</th>
                      <th className="px-2 py-1.5 text-left">主/附</th>
                      <th className="px-2 py-1.5 text-left">銷售</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 && (
                      <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-[#6f869c]">這家還沒有商品，用下方的 CSV 匯入最快。</td></tr>
                    )}
                    {products.map((p) => (
                      <tr key={p.id} className="border-t border-white/5">
                        <td className="px-2 py-1.5 font-mono text-xs">{p.code || "—"}</td>
                        <td className="px-2 py-1.5">{p.name || "—"}</td>
                        <td className="px-2 py-1.5 text-xs text-[#a9bccf]">{p.kind || "—"}</td>
                        <td className="px-2 py-1.5 text-xs text-[#a9bccf]">{p.mainRider || "—"}</td>
                        <td className="px-2 py-1.5 text-xs">{p.onSale ? "現售" : "停售"}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            className="text-xs text-[#e08a68] hover:underline disabled:opacity-40"
                            disabled={pending}
                            onClick={() => run(() => deleteInsProductAction(p.id!), "已刪除")}
                          >刪除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-6 items-end">
                <label className="text-xs text-[#6f869c]">代號
                  <input className={inputCls} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
                </label>
                <label className="text-xs text-[#6f869c] md:col-span-2">商品名稱
                  <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </label>
                <label className="text-xs text-[#6f869c]">總類
                  <select className={inputCls} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                    <option value="">—</option>
                    {INS_PRODUCT_KINDS.map((k) => <option key={k}>{k}</option>)}
                  </select>
                </label>
                <label className="text-xs text-[#6f869c]">主/附
                  <select className={inputCls} value={draft.mainRider} onChange={(e) => setDraft({ ...draft, mainRider: e.target.value })}>
                    <option>主約</option><option>附約</option>
                  </select>
                </label>
                <button
                  className={btnCls}
                  disabled={pending || !draft.code.trim()}
                  onClick={() => run(() => saveInsProductAction({ ...draft, company: pick }), "已新增")}
                >新增</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="text-xs text-[#a9bccf] mb-1 font-bold">CSV 批次匯入</div>
        <p className="text-xs text-[#6f869c] mb-2">
          每列 <code className="text-[#e0bd8b]">公司,代號,商品名稱,總類,主約或附約,現售(1/0),人身或產物</code>；
          第一列可以是表頭。同一家公司的同一個代號已存在就跳過，重跑安全。
        </p>
        <textarea
          className={`${inputCls} h-28 font-mono text-xs`}
          placeholder={"凱基,LEGOAE,安心樂高終身保險,醫療,主約,0,人身\n全球,PCH,臻愛一生防癌終身健康保險,防癌,主約,0,人身"}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <button
          className={`${btnCls} mt-2`}
          disabled={pending || !csv.trim()}
          onClick={() => run(async () => {
            const r = await importInsProductsAction(csv);
            if (r.ok) setCsv("");
            return r;
          }, "匯入完成")}
        >匯入</button>
      </div>
    </div>
  );
}
