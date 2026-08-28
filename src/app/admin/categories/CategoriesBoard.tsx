"use client";
import MoneyInput from "@/components/MoneyInput";

import { useMemo, useState, useTransition } from "react";
import {
  addCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  toggleCategoryAction,
  seedCategoriesAction,
  saveEduCostAction,
  resetEduCostsAction,
  type ActionResult,
} from "./actions";
import { CAT_PARENTS, CAT_KIND_LABEL, type CatKind } from "@/lib/financeCategories.defaults";
import type { FinCatRow } from "@/lib/financeCategories";
import type { EduCostRow } from "@/lib/eduCosts";

const KINDS: CatKind[] = ["income", "expense", "saving", "asset", "liability"];

// 每個 kind 的引擎語意提示：讓管理員知道「大類選錯會壞掉什麼」，而不是隨手亂挑。
const KIND_HINT: Record<CatKind, string> = {
  income:
    "大類決定稅務歸屬：工作＝薪資所得（其中「執行業務所得」走費用率扣除）、理財＝股利利息租金、其他＝不課綜所稅的收入。",
  expense:
    "大類決定財務比率：生活＋消費＝家庭生活費、消費＋其他＝可刪減支出、稅賦／保險／孝親各自入表。放錯會讓儲蓄率與可刪減空間算錯。",
  saving:
    "儲蓄理財投入不是「花掉」、不計入總支出，它是「有效儲蓄率」的分子。放進支出會讓儲蓄率被自己吃掉一次。",
  asset:
    "大類決定淨值結構：自用資產不計入核心資產、可投資資產才是累積進度的分母。「計入風險性資產」另外決定資產配置與風險承受度的分子。",
  liability:
    "大類決定負債品質：房貸看房貸負擔率、信貸／勾了「消費性負債」的會進消費性負債比。放錯會讓債務體質評級失真。",
};

const inputCls =
  "w-full rounded border border-white/15 bg-[#0b2136] px-2 py-1 text-sm text-[#eef2f7] outline-none focus:border-[#c99a5b]";
const btnCls =
  "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-[#a9bccf] hover:bg-[#17406a] disabled:opacity-40";

type Draft = {
  parent: string;
  label: string;
  riskAsset: boolean;
  liquidity: string;
  consumer: boolean;
  needsNote: boolean;
  sortOrder: number;
  active: boolean;
};

const toDraft = (r: FinCatRow): Draft => ({
  parent: r.parent,
  label: r.label,
  riskAsset: r.riskAsset,
  liquidity: r.liquidity ?? "",
  consumer: r.consumer,
  needsNote: r.needsNote,
  sortOrder: r.sortOrder,
  active: r.active,
});

export default function CategoriesBoard({
  rows,
  eduRows,
}: {
  rows: FinCatRow[];
  eduRows: EduCostRow[];
}) {
  const [tab, setTab] = useState<CatKind | "edu">("expense");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const run = (fn: () => Promise<ActionResult>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error });
      if (r.ok) {
        setEditing(null);
        setDraft(null);
      }
    });

  const grouped = useMemo(() => {
    const m = new Map<CatKind, FinCatRow[]>();
    for (const k of KINDS) m.set(k, []);
    for (const r of rows) m.get(r.kind)?.push(r);
    return m;
  }, [rows]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === k ? "bg-[#c99a5b] text-[#081a2b] font-semibold" : "border border-white/15 text-[#a9bccf] hover:bg-[#17406a]"
            }`}
          >
            {CAT_KIND_LABEL[k]}
            <span className="ml-1.5 opacity-70">{grouped.get(k)?.length ?? 0}</span>
          </button>
        ))}
        <button
          onClick={() => setTab("edu")}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            tab === "edu" ? "bg-[#c99a5b] text-[#081a2b] font-semibold" : "border border-white/15 text-[#a9bccf] hover:bg-[#17406a]"
          }`}
        >
          教育費用參數
        </button>
        <div className="flex-1" />
        {msg && (
          <span className={`text-sm ${msg.ok ? "text-[#6f8f74]" : "text-[#e08a7a]"}`}>{msg.text}</span>
        )}
      </div>

      {tab === "edu" ? (
        <EduTable rows={eduRows} run={run} pending={pending} />
      ) : (
        <CatTable
          kind={tab}
          rows={grouped.get(tab) ?? []}
          editing={editing}
          draft={draft}
          setEditing={(id, r) => {
            setEditing(id);
            setDraft(r ? toDraft(r) : null);
          }}
          setDraft={setDraft}
          run={run}
          pending={pending}
        />
      )}
    </div>
  );
}

function CatTable({
  kind,
  rows,
  editing,
  draft,
  setEditing,
  setDraft,
  run,
  pending,
}: {
  kind: CatKind;
  rows: FinCatRow[];
  editing: string | null;
  draft: Draft | null;
  setEditing: (id: string | null, r?: FinCatRow) => void;
  setDraft: (d: Draft | null) => void;
  run: (fn: () => Promise<ActionResult>, okText: string) => void;
  pending: boolean;
}) {
  const parents = CAT_PARENTS[kind];
  const [nw, setNw] = useState<Draft>({
    parent: parents[0],
    label: "",
    riskAsset: false,
    liquidity: kind === "asset" ? "流動" : "",
    consumer: false,
    needsNote: false,
    sortOrder: 999,
    active: true,
  });

  const patch = (p: Partial<Draft>) => draft && setDraft({ ...draft, ...p });

  return (
    <div>
      <p className="mb-3 rounded-lg border border-white/10 bg-[#0b2136] px-3 py-2 text-xs leading-relaxed text-[#a9bccf]">
        <b className="text-[#e0bd8b]">大類是引擎在算的鍵，不開放新增</b>；這裡只管細類，每個細類要指定它預設落在哪個大類。
        <br />
        {KIND_HINT[kind]}
        <br />
        系統預設的細類<b>不可刪除</b>（既有客戶資料還指著這些名稱），要拿掉請按「停用」——選單不再出現，舊資料照樣顯示。
      </p>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-[#0d2b45] text-[#a9bccf]">
            <tr>
              <th className="px-2 py-2 text-left font-medium">排序</th>
              <th className="px-2 py-2 text-left font-medium">所屬大類</th>
              <th className="px-2 py-2 text-left font-medium">細類名稱</th>
              {kind === "asset" && <th className="px-2 py-2 text-left font-medium">風險性</th>}
              {kind === "asset" && <th className="px-2 py-2 text-left font-medium">流動性</th>}
              {kind === "liability" && <th className="px-2 py-2 text-left font-medium">消費性</th>}
              <th className="px-2 py-2 text-left font-medium">提示補明細</th>
              <th className="px-2 py-2 text-left font-medium">狀態</th>
              <th className="px-2 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEdit = editing === r.id && draft;
              return (
                <tr key={r.id} className={`border-t border-white/10 ${r.active ? "" : "opacity-45"}`}>
                  <td className="px-2 py-1.5 w-16">
                    {isEdit ? (
                      <input
                        type="number"
                        className={inputCls}
                        value={draft!.sortOrder}
                        onChange={(e) => patch({ sortOrder: Number(e.target.value) })}
                      />
                    ) : (
                      <span className="text-[#a9bccf]">{r.sortOrder}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 w-32">
                    {isEdit ? (
                      <select className={inputCls} value={draft!.parent} onChange={(e) => patch({ parent: e.target.value })}>
                        {parents.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    ) : (
                      r.parent
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {isEdit ? (
                      <input className={inputCls} value={draft!.label} onChange={(e) => patch({ label: e.target.value })} />
                    ) : (
                      <span className="font-medium">{r.label}</span>
                    )}
                  </td>
                  {kind === "asset" && (
                    <td className="px-2 py-1.5 w-20 text-center">
                      <input
                        type="checkbox"
                        disabled={!isEdit}
                        checked={isEdit ? draft!.riskAsset : r.riskAsset}
                        onChange={(e) => patch({ riskAsset: e.target.checked })}
                      />
                    </td>
                  )}
                  {kind === "asset" && (
                    <td className="px-2 py-1.5 w-24">
                      {isEdit ? (
                        <select className={inputCls} value={draft!.liquidity} onChange={(e) => patch({ liquidity: e.target.value })}>
                          <option value="">（不指定）</option>
                          <option>流動</option>
                          <option>固定</option>
                        </select>
                      ) : (
                        r.liquidity ?? "—"
                      )}
                    </td>
                  )}
                  {kind === "liability" && (
                    <td className="px-2 py-1.5 w-20 text-center">
                      <input
                        type="checkbox"
                        disabled={!isEdit}
                        checked={isEdit ? draft!.consumer : r.consumer}
                        onChange={(e) => patch({ consumer: e.target.checked })}
                      />
                    </td>
                  )}
                  <td className="px-2 py-1.5 w-24 text-center">
                    <input
                      type="checkbox"
                      disabled={!isEdit}
                      checked={isEdit ? draft!.needsNote : r.needsNote}
                      onChange={(e) => patch({ needsNote: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-1.5 w-24">
                    {r.active ? (
                      <span className="text-[#6f8f74]">啟用中</span>
                    ) : (
                      <span className="text-[#a9bccf]">已停用</span>
                    )}
                    {r.isSystem && <span className="ml-1 text-[10px] text-[#c99a5b]">系統</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {isEdit ? (
                      <>
                        <button
                          disabled={pending}
                          className={btnCls}
                          onClick={() =>
                            run(
                              () =>
                                updateCategoryAction(r.id, {
                                  kind,
                                  parent: draft!.parent,
                                  label: draft!.label,
                                  riskAsset: draft!.riskAsset,
                                  liquidity: draft!.liquidity,
                                  consumer: draft!.consumer,
                                  needsNote: draft!.needsNote,
                                  sortOrder: draft!.sortOrder,
                                  active: draft!.active,
                                }),
                              `已更新「${draft!.label}」`,
                            )
                          }
                        >
                          儲存
                        </button>
                        <button className={btnCls + " ml-1"} onClick={() => setEditing(null)}>
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button className={btnCls} onClick={() => setEditing(r.id, r)}>
                          編輯
                        </button>
                        <button
                          disabled={pending}
                          className={btnCls + " ml-1"}
                          onClick={() =>
                            run(() => toggleCategoryAction(r.id, !r.active), r.active ? `已停用「${r.label}」` : `已啟用「${r.label}」`)
                          }
                        >
                          {r.active ? "停用" : "啟用"}
                        </button>
                        {!r.isSystem && (
                          <button
                            disabled={pending}
                            className={btnCls + " ml-1"}
                            onClick={() => {
                              if (confirm(`確定刪除「${r.label}」？既有資料若用過這個名稱，會變成無法對應的舊值。`)) {
                                run(() => deleteCategoryAction(r.id), `已刪除「${r.label}」`);
                              }
                            }}
                          >
                            刪除
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[#a9bccf]">
                  尚無類別。按下方「載入官方預設類別」一鍵帶入。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-[#0b2136] p-3">
        <div className="mb-2 text-sm font-medium">新增細類</div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[#a9bccf]">
            所屬大類
            <select className={inputCls + " mt-1 min-w-[8rem]"} value={nw.parent} onChange={(e) => setNw({ ...nw, parent: e.target.value })}>
              {parents.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[#a9bccf]">
            細類名稱
            <input
              className={inputCls + " mt-1 min-w-[12rem]"}
              value={nw.label}
              placeholder={kind === "liability" ? "例：私人借款(親友)" : "例：加密貨幣"}
              onChange={(e) => setNw({ ...nw, label: e.target.value })}
            />
          </label>
          <label className="text-xs text-[#a9bccf]">
            排序
            <input
              type="number"
              className={inputCls + " mt-1 w-20"}
              value={nw.sortOrder}
              onChange={(e) => setNw({ ...nw, sortOrder: Number(e.target.value) })}
            />
          </label>
          {kind === "asset" && (
            <>
              <label className="flex items-center gap-1 text-xs text-[#a9bccf]">
                <input type="checkbox" checked={nw.riskAsset} onChange={(e) => setNw({ ...nw, riskAsset: e.target.checked })} />
                計入風險性資產
              </label>
              <label className="text-xs text-[#a9bccf]">
                流動性
                <select className={inputCls + " mt-1 w-24"} value={nw.liquidity} onChange={(e) => setNw({ ...nw, liquidity: e.target.value })}>
                  <option value="">（不指定）</option>
                  <option>流動</option>
                  <option>固定</option>
                </select>
              </label>
            </>
          )}
          {kind === "liability" && (
            <label className="flex items-center gap-1 text-xs text-[#a9bccf]">
              <input type="checkbox" checked={nw.consumer} onChange={(e) => setNw({ ...nw, consumer: e.target.checked })} />
              算消費性負債
            </label>
          )}
          <label className="flex items-center gap-1 text-xs text-[#a9bccf]">
            <input type="checkbox" checked={nw.needsNote} onChange={(e) => setNw({ ...nw, needsNote: e.target.checked })} />
            提示補明細
          </label>
          <button
            disabled={pending || !nw.label.trim()}
            className={btnCls}
            onClick={() =>
              run(() => addCategoryAction({ kind, ...nw }), `已新增「${nw.label}」`)
            }
          >
            新增
          </button>
          <div className="flex-1" />
          <button
            disabled={pending}
            className={btnCls}
            onClick={() => run(() => seedCategoriesAction(), "已補上官方預設類別")}
          >
            載入官方預設類別
          </button>
        </div>
      </div>
    </div>
  );
}

function EduTable({
  rows,
  run,
  pending,
}: {
  rows: EduCostRow[];
  run: (fn: () => Promise<ActionResult>, okText: string) => void;
  pending: boolean;
}) {
  const [edit, setEdit] = useState<Record<string, EduCostRow>>({});
  const val = (r: EduCostRow) => edit[r.stage] ?? r;
  const patch = (r: EduCostRow, p: Partial<EduCostRow>) =>
    setEdit((s) => ({ ...s, [r.stage]: { ...val(r), ...p } }));

  const num = (r: EduCostRow, key: keyof EduCostRow) => (
    <input
      type="number"
      className={inputCls + " w-24"}
      value={String(val(r)[key] ?? 0)}
      onChange={(e) => patch(r, { [key]: Number(e.target.value) } as Partial<EduCostRow>)}
    />
  );

  // 學雜費等金額欄要千分位（起始年齡／年數維持 type=number）。
  const money = (r: EduCostRow, key: keyof EduCostRow) => (
    <MoneyInput
      className={inputCls + " w-28"}
      value={Number(val(r)[key] ?? 0)}
      onChange={(v) => patch(r, { [key]: v ?? 0 } as Partial<EduCostRow>)}
    />
  );

  return (
    <div>
      <p className="mb-3 rounded-lg border border-white/10 bg-[#0b2136] px-3 py-2 text-xs leading-relaxed text-[#a9bccf]">
        金額一律「<b className="text-[#e0bd8b]">每學年（1 年）新台幣元</b>」，且是<b className="text-[#e0bd8b]">今日現值</b>——
        學費上漲率由客戶端的「學費上漲率」參數另外套，這裡不要先加通膨。
        客戶端會依孩子年齡推出所在學段、自動帶入這些數字，教練仍可逐格覆寫。
        <br />
        政策前提：高中職 112 學年第 2 學期起<b>學費全免</b>（雜費／代辦／餐費仍自付）；私立大專每年補助 3.5 萬，
        <b>碩博士與延修生不適用</b>；公立大專<b>沒有</b>普及性減免。
      </p>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-[#0d2b45] text-[#a9bccf]">
            <tr>
              <th className="px-2 py-2 text-left font-medium">學段</th>
              <th className="px-2 py-2 text-left font-medium">起始年齡</th>
              <th className="px-2 py-2 text-left font-medium">年數</th>
              <th className="px-2 py-2 text-left font-medium">公立學雜費/年</th>
              <th className="px-2 py-2 text-left font-medium">私立學雜費/年</th>
              <th className="px-2 py-2 text-left font-medium">海外/年</th>
              <th className="px-2 py-2 text-left font-medium">補習才藝/年</th>
              <th className="px-2 py-2 text-left font-medium">撫養費/年</th>
              <th className="px-2 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stage} className="border-t border-white/10 align-top">
                <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                  {r.stage}
                  {r.source && (
                    <div className="mt-0.5 max-w-[16rem] text-[10px] leading-snug text-[#7d93a8]">{r.source}</div>
                  )}
                </td>
                <td className="px-2 py-1.5">{num(r, "startAge")}</td>
                <td className="px-2 py-1.5">{num(r, "years")}</td>
                <td className="px-2 py-1.5">{money(r, "publicTuition")}</td>
                <td className="px-2 py-1.5">{money(r, "privateTuition")}</td>
                <td className="px-2 py-1.5">{money(r, "overseasTuition")}</td>
                <td className="px-2 py-1.5">{money(r, "extraFee")}</td>
                <td className="px-2 py-1.5">{money(r, "careFee")}</td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    disabled={pending}
                    className={btnCls}
                    onClick={() => run(() => saveEduCostAction({ ...val(r), source: val(r).source }), `已儲存「${r.stage}」`)}
                  >
                    儲存
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <button
          disabled={pending}
          className={btnCls}
          onClick={() => {
            if (confirm("回復官方預設值會覆蓋所有手動改過的金額，確定嗎？")) {
              run(() => resetEduCostsAction(), "已回復官方預設值");
            }
          }}
        >
          回復官方預設值
        </button>
      </div>
    </div>
  );
}
