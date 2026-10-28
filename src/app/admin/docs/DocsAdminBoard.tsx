"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import SubmitButton from "@/components/ui/SubmitButton";
import { FIELD, SELECT_SM } from "@/components/ui/Field";
import {
  CATEGORY_LABEL,
  DOC_CATEGORIES,
  DOC_ROLES,
  DOC_SET_KINDS,
  DOC_CSS,
  ROLE_LABEL,
  ASK_KIND_LABEL,
  ASK_MAX,
  type DocAsk,
  type DocCategory,
  type DocSetKind,
  type DocSignerSlot,
} from "@/lib/docs";
import { STARTER_HTML } from "@/lib/docsVars";
import { previewTemplateAction, saveSealAction, saveSetAction, saveTemplateAction, setTemplateEnabledAction, saveDocSettingsAction, deleteTemplateAction } from "./actions";
import RichTemplateEditor from "@/components/RichTemplateEditor";
import { confirmDialog } from "@/components/ui/confirm";

export type TemplateLite = {
  id: string;
  key: string;
  version: number;
  versions: number;
  category: DocCategory;
  name: string;
  html: string;
  useSeal: boolean;
  required: boolean;
  signDays: number | null;
  signers: DocSignerSlot[];
  asks: DocAsk[];
  itemIds: string[];
  enabled: boolean;
  note: string;
  createdAt: string;
};
export type ItemLite = { id: string; name: string; price: number; cat: string };

type Draft = {
  key: string | null;
  category: DocCategory;
  name: string;
  html: string;
  useSeal: boolean;
  required: boolean;
  signDays: string;
  signers: DocSignerSlot[];
  asks: DocAsk[];
  itemIds: string[];
  note: string;
};

const emptyDraft = (category: DocCategory = "training"): Draft => ({
  key: null,
  category,
  name: "",
  html: STARTER_HTML,
  useSeal: true,
  required: true,
  signDays: "14",
  signers: category === "training" ? [{ role: "member", seq: 1, label: "申請人" }] : [{ role: "client", seq: 1, label: "簽約人" }, { role: "coach", seq: 2 }],
  asks: [],
  itemIds: [],
  note: "",
});
const toDraft = (t: TemplateLite): Draft => ({
  key: t.key,
  category: t.category,
  name: t.name,
  html: t.html,
  useSeal: t.useSeal,
  required: t.required,
  signDays: t.signDays == null ? "" : String(t.signDays),
  signers: t.signers,
  asks: t.asks ?? [],
  itemIds: t.itemIds ?? [],
  note: t.note,
});

export default function DocsAdminBoard({ templates, items, sets, seal, nudgeDays = 7 }: { templates: TemplateLite[]; items: ItemLite[]; sets: Record<string, string[]>; seal: string | null; nudgeDays?: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);

  return (
    <div className="grid gap-6">
      <SealSection seal={seal} onSaved={() => router.refresh()} />

      {/* ② 範本 */}
      <section className="border border-line rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-bold">文件範本</h2>
          <div className="flex gap-2">
            {DOC_CATEGORIES.map((c) => (
              <button key={c.value} type="button" className="text-xs rounded-md border border-line px-2.5 py-1.5 hover:bg-panel2" onClick={() => setEditing(emptyDraft(c.value))}>
                ＋ 新增{c.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-11 text-tx3 mb-3">每一列是這份文件的最新版本。編輯後存檔會變成下一個版本；停用最新版＝這份文件暫時不能被啟動。</p>
        {templates.length === 0 && <p className="text-sm text-tx3">還沒有範本。先新增一份，內容可以之後再修。</p>}
        <ul className="grid gap-2">
          {templates.map((t) => (
            <TemplateRow key={t.key} t={t} onEdit={() => setEditing(toDraft(t))} onChanged={() => router.refresh()} />
          ))}
        </ul>
      </section>

      <SetsSection templates={templates} items={items} sets={sets} onSaved={() => router.refresh()} />

      <NudgeSection nudgeDays={nudgeDays} />

      {editing && (
        <TemplateEditor
          draft={editing}
          items={items}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── ① 印鑑 ───────────────────────────────────────────────────────────────────
function SealSection({ seal, onSaved }: { seal: string | null; onSaved: () => void }) {
  const [img, setImg] = useState<string | null>(seal);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    setErr(null);
    if (!f) return;
    if (f.type !== "image/png") return setErr("請用透明底 PNG");
    // 伺服器端只收 data URL ≤ SIGNATURE_MAX_CHARS（約 300KB 的 PNG）；這裡用同一把尺，不要讓人上傳完才被退。
    if (f.size > 280_000) return setErr("圖片太大（請壓到 280KB 以內——印章圖縮到 600px 寬就夠）");
    const r = new FileReader();
    r.onload = () => setImg(String(r.result));
    r.readAsDataURL(f);
  }
  function save(next: string | null) {
    setMsg(null);
    setErr(null);
    start(async () => {
      const r = await saveSealAction(next);
      if (r.ok) {
        setImg(next);
        setMsg(next ? "已儲存印鑑" : "已移除印鑑");
        onSaved();
      } else setErr(r.error);
    });
  }
  return (
    <section className="border border-line rounded-lg p-4">
      <h2 className="font-bold mb-1">公司大小章</h2>
      <p className="text-11 text-tx3 mb-3">
        一張透明底 PNG（大章＋小章合成一張）。範本裡寫 <code className="text-brand2">{"{{seal}}"}</code> 的位置、且該範本有勾「套用公司印鑑」，產文件時就直接印上去——合約視為公司已用印，不另設公司簽章步驟。
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-40 h-28 rounded-md border border-dashed border-line2 bg-white grid place-items-center overflow-hidden">
          {img ? <img src={img} alt="公司印鑑" className="max-h-24 max-w-36 object-contain" /> : <span className="text-xs text-tx3">尚未上傳</span>}
        </div>
        <div className="grid gap-2">
          <input ref={file} type="file" accept="image/png" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="flex gap-2">
            <button type="button" className="text-sm rounded-md border border-line px-3 py-1.5 hover:bg-panel2" onClick={() => file.current?.click()}>選擇 PNG</button>
            <SubmitButton state={busy ? "pending" : "idle"} disabled={!img || img === seal} onClick={() => save(img)}>儲存印鑑</SubmitButton>
            {seal && <button type="button" className="text-sm text-danger px-2" disabled={busy} onClick={() => save(null)}>移除</button>}
          </div>
          {msg && <p className="text-xs text-ok">{msg}</p>}
          {err && <p className="text-xs text-danger">{err}</p>}
        </div>
      </div>
    </section>
  );
}

// ── ② 範本列 ─────────────────────────────────────────────────────────────────
function TemplateRow({ t, onEdit, onChanged }: { t: TemplateLite; onEdit: () => void; onChanged: () => void }) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <li className={`rounded-md border ${t.enabled ? "border-line" : "border-line2 opacity-60"} bg-panel2 px-3 py-2`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-11 rounded px-1.5 py-0.5 bg-panel text-tx2">{CATEGORY_LABEL[t.category]}</span>
        <span className="font-bold">{t.name}</span>
        <span className="text-11 text-tx3">v{t.version}{t.versions > 1 ? `（共 ${t.versions} 版）` : ""}</span>
        <span className="text-11 text-tx3">{t.required ? "必簽" : "選簽"}・{t.useSeal ? "用印" : "不用印"}・{t.signDays ? `${t.signDays} 天內簽` : "不限期"}</span>
        <span className="text-11 text-tx2">
          簽署：{t.signers.map((s) => `${s.seq}.${s.label || ROLE_LABEL[s.role]}`).join(" → ")}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" className="text-xs rounded-md border border-line px-2 py-1 hover:bg-panel" onClick={onEdit}>編輯（存成新版本）</button>
          <button
            type="button"
            className="text-xs text-tx2 px-1"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await setTemplateEnabledAction(t.id, !t.enabled);
                if (!r.ok) setErr(r.error);
                else onChanged();
              })
            }
          >
            {t.enabled ? "停用" : "啟用"}
          </button>
          <button
            type="button"
            className="text-xs text-danger px-1"
            disabled={busy}
            onClick={async () => {
              const ok = await confirmDialog(`刪除「${t.name}」？所有版本一起刪，並從範本組合移除。已經有文件用過的話會改成封存（歷史文件照常看得到）。`, { danger: true, okLabel: "刪除" });
              if (!ok) return;
              start(async () => {
                const r = await deleteTemplateAction(t.key);
                if (!r.ok) setErr(r.error);
                else onChanged();
              });
            }}
          >
            刪除
          </button>
        </span>
      </div>
      {err && <p className="text-xs text-danger mt-1">{err}</p>}
    </li>
  );
}

// ── ② 範本編輯器 ─────────────────────────────────────────────────────────────
function TemplateEditor({ draft, items, onClose, onSaved }: { draft: Draft; items: ItemLite[]; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  // 確認項的 key：自動從 1 編（ask1、ask2…），避免跟內容裡已放的標籤撞名
  const nextAskKey = () => { let i = d.asks.length + 1; while (d.asks.some((a) => a.key === `ask${i}`)) i++; return `ask${i}`; };
  const setAsk = (i: number, p: Partial<DocAsk>) => patch({ asks: d.asks.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const askRoles = d.signers.map((s) => s.role).filter((r, i, arr) => r !== "company" && arr.indexOf(r) === i);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ html: string; warnings: string[] } | null>(null);
  const [busy, start] = useTransition();
  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  function setSigner(i: number, p: Partial<DocSignerSlot>) {
    patch({ signers: d.signers.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  }
  const payload = () => ({ ...d, signDays: d.signDays.trim() === "" ? null : Number(d.signDays) });

  function doPreview() {
    setErr(null);
    start(async () => {
      const r = await previewTemplateAction(payload());
      if (r.ok) setPreview({ html: r.html, warnings: r.warnings });
      else setErr(r.error);
    });
  }
  function save() {
    setErr(null);
    start(async () => {
      const r = await saveTemplateAction(payload());
      if (r.ok) onSaved();
      else setErr(r.error);
    });
  }

  return (
    <Modal onClose={onClose} labelledBy="doc-editor-title" width="max-w-5xl">
      <div className="p-5 grid gap-4 max-h-[88vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h2 id="doc-editor-title" className="font-bold text-lg">{d.key ? "編輯範本（存檔＝新版本）" : "新增範本"}</h2>
          <button type="button" className="text-sm text-tx2" onClick={onClose}>關閉</button>
        </div>

        <div className="grid sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
          <label className="grid gap-1 text-xs text-tx2">文件名稱
            <input className={FIELD} value={d.name} onChange={(e) => patch({ name: e.target.value })} placeholder="例：實習教練合作約定書" />
          </label>
          <label className="grid gap-1 text-xs text-tx2">類別
            <select className={SELECT_SM} value={d.category} disabled={!!d.key} onChange={(e) => patch({ category: e.target.value as DocCategory })}>
              {DOC_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-tx2">簽署期限（天）
            <input className={`${FIELD} w-24`} inputMode="numeric" value={d.signDays} onChange={(e) => patch({ signDays: e.target.value })} placeholder="不限" />
          </label>
          <div className="flex gap-4 text-sm pb-2">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={d.required} onChange={(e) => patch({ required: e.target.checked })} />必簽</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={d.useSeal} onChange={(e) => patch({ useSeal: e.target.checked })} />套用公司印鑑</label>
          </div>
        </div>

        {/* 簽署人 */}
        <div className="rounded-md border border-line p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold">簽署人與順序</h3>
            <button type="button" className="text-xs rounded-md border border-line px-2 py-1" onClick={() => patch({ signers: [...d.signers, { role: "coach", seq: (d.signers.at(-1)?.seq ?? 0) + 1 }] })}>＋ 加一位</button>
          </div>
          <p className="text-11 text-tx3 mb-2">順序數字小的先簽；同一個數字可以同時簽。簽名出現的位置用下面工具列「插入簽名位」放進內容；沒放的會自動補在文末。</p>
          <div className="grid gap-2">
            {d.signers.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <input className={`${FIELD} w-16 text-center`} inputMode="numeric" value={s.seq} onChange={(e) => setSigner(i, { seq: Math.max(1, Number(e.target.value) || 1) })} />
                <select className={SELECT_SM} value={s.role} onChange={(e) => setSigner(i, { role: e.target.value as DocSignerSlot["role"] })}>
                  {DOC_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}——{r.hint}</option>)}
                </select>
                <input className={`${FIELD} w-40`} value={s.label ?? ""} onChange={(e) => setSigner(i, { label: e.target.value })} placeholder={`顯示名（預設「${ROLE_LABEL[s.role]}簽名」）`} />
                <button type="button" className="text-xs text-danger" onClick={() => patch({ signers: d.signers.filter((_, j) => j !== i) })}>移除</button>
              </div>
            ))}
          </div>
        </div>

        {/* 適用方案（2026/10/28 Ray：範本多了之後，組合只看自己方案的） */}
        <div className="rounded-md border border-line p-3">
          <h3 className="text-sm font-bold mb-1">適用方案</h3>
          <p className="text-11 text-tx3 mb-2">勾了哪些方案，下面「範本組合」就只在那些方案列出這份；都不勾＝通用（每個方案都看得到，排在後面）。</p>
          <div className="flex flex-wrap gap-2 text-sm">
            {items.length === 0 && <span className="text-xs text-tx3">帳務後台還沒有營業項目。</span>}
            {items.map((it) => (
              <label key={it.id} className={`flex items-center gap-1.5 rounded px-2 py-0.5 border ${d.itemIds.includes(it.id) ? "border-brand2" : "border-line"}`}>
                <input type="checkbox" checked={d.itemIds.includes(it.id)} onChange={() => patch({ itemIds: d.itemIds.includes(it.id) ? d.itemIds.filter((x) => x !== it.id) : [...d.itemIds, it.id] })} />
                {it.name}
              </label>
            ))}
          </div>
        </div>

        {/* 本人確認項（2026/10/28）：簽署人簽名前逐項作答；必勾沒勾不能簽 */}
        <div className="rounded-md border border-line p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold">簽署人要勾的確認項</h3>
            <button type="button" className="text-xs rounded-md border border-line px-2 py-1 disabled:opacity-40" disabled={d.asks.length >= ASK_MAX} onClick={() => patch({ asks: [...d.asks, { key: nextAskKey(), label: "", kind: "must", role: askRoles[0] ?? "member" }] })}>＋ 加一項</button>
          </div>
          <p className="text-11 text-tx3 mb-2">例：「本人確認已年滿 18 歲」（必勾）、「同意寄送課程與活動資訊」（可選）。簽署頁會列出來讓本人作答，文件上用工具列「插入確認項」放 ☐，簽完依作答變 ☑；沒放進內容的會列在文末簽署欄。</p>
          <div className="grid gap-2">
            {d.asks.map((a, i) => (
              <div key={a.key} className="flex flex-wrap items-center gap-2 text-sm">
                <input className={`${FIELD} flex-1 min-w-60`} value={a.label} onChange={(e) => setAsk(i, { label: e.target.value })} placeholder="確認項文字（會原樣印在簽署頁）" />
                <select className={SELECT_SM} value={a.kind} onChange={(e) => setAsk(i, { kind: e.target.value as DocAsk["kind"] })}>
                  <option value="must">{ASK_KIND_LABEL.must}（沒勾不能簽）</option><option value="opt">{ASK_KIND_LABEL.opt}（自由勾）</option>
                </select>
                {askRoles.length > 1 && (
                  <select className={SELECT_SM} value={a.role} onChange={(e) => setAsk(i, { role: e.target.value as DocAsk["role"] })}>
                    {askRoles.map((r) => <option key={r} value={r}>由{ROLE_LABEL[r]}作答</option>)}
                  </select>
                )}
                <button type="button" className="text-xs text-danger" onClick={() => patch({ asks: d.asks.filter((_, j) => j !== i) })}>移除</button>
              </div>
            ))}
            {d.asks.length === 0 && <p className="text-xs text-tx3">沒有確認項：簽署人只要勾「同意電子簽署」再簽名。</p>}
          </div>
        </div>

        {/* 內容：所見即所得（2026/10/28 Ray：不要看到 HTML 碼） */}
        <div className="grid gap-1">
          <span className="text-xs text-tx2">內容</span>
          <RichTemplateEditor value={d.html} onChange={(html) => patch({ html })} signers={d.signers} asks={d.asks} category={d.category} useSeal={d.useSeal} />
        </div>

        <label className="grid gap-1 text-xs text-tx2">備註（只有後台看得到）
          <input className={FIELD} value={d.note} onChange={(e) => patch({ note: e.target.value })} />
        </label>

        {err && <p className="text-sm text-danger">{err}</p>}
        <div className="flex items-center gap-2">
          <button type="button" className="text-sm rounded-md border border-line px-3 py-2" disabled={busy} onClick={doPreview}>預覽</button>
          <SubmitButton state={busy ? "pending" : "idle"} onClick={save}>{d.key ? "存成新版本" : "建立範本"}</SubmitButton>
        </div>

        {preview && (
          <div className="rounded-md border border-line overflow-hidden">
            {preview.warnings.length > 0 && <p className="text-xs text-danger px-3 py-2 bg-panel2">{preview.warnings.join("；")}</p>}
            <iframe title="預覽" sandbox="" className="w-full h-[70vh] bg-white" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${DOC_CSS}</style></head><body><div class="doc-body">${preview.html}</div></body></html>`} />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── ③ 範本組合 ───────────────────────────────────────────────────────────────
function SetsSection({ templates, items, sets, onSaved }: { templates: TemplateLite[]; items: ItemLite[]; sets: Record<string, string[]>; onSaved: () => void }) {
  return (
    <section className="border border-line rounded-lg p-4">
      <h2 className="font-bold mb-1">範本組合（哪個方案要簽哪幾份）</h2>
      <p className="text-11 text-tx3 mb-3">方案＝帳務「營業項目」。沒在帳務後台建的方案不會出現在這裡，也就不能拿來簽——這是刻意的。</p>
      {items.length === 0 && <p className="text-sm text-tx3">帳務後台還沒有營業項目。</p>}
      <div className="grid gap-4">
        {DOC_SET_KINDS.map((k) => (
          <div key={k.value}>
            <h3 className="text-sm font-bold mb-2">{k.label} <span className="text-11 text-tx3 font-normal">→ 使用「{CATEGORY_LABEL[k.category]}」類別的範本</span></h3>
            <div className="grid gap-2">
              {items.map((it) => (
                <SetRow
                  key={`${k.value}:${it.id}`}
                  kind={k.value}
                  item={it}
                  // 這個方案專屬的排前面、通用（沒勾方案）排後面；勾了別的方案的不出現
                  options={[
                    ...templates.filter((t) => t.category === k.category && t.itemIds.includes(it.id)),
                    ...templates.filter((t) => t.category === k.category && t.itemIds.length === 0),
                  ]}
                  value={sets[`${k.value}:${it.id}`] ?? []}
                  onSaved={onSaved}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SetRow({ kind, item, options, value, onSaved }: { kind: DocSetKind; item: ItemLite; options: TemplateLite[]; value: string[]; onSaved: () => void }) {
  const [sel, setSel] = useState<string[]>(value);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = sel.join("|") !== value.join("|");
  const toggle = (key: string) => setSel((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  return (
    <div className="rounded-md border border-line bg-panel2 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="font-bold text-sm min-w-40">{item.name}{item.cat ? <span className="text-11 text-tx3 font-normal ml-1">{item.cat}</span> : null}</span>
      <div className="flex flex-wrap gap-2 text-sm">
        {options.length === 0 && <span className="text-xs text-tx3">（這個類別還沒有範本）</span>}
        {options.map((t) => (
          <label key={t.key} className={`flex items-center gap-1.5 rounded px-2 py-0.5 border ${sel.includes(t.key) ? "border-brand2" : "border-line"} ${t.enabled ? "" : "opacity-50"}`}>
            <input type="checkbox" checked={sel.includes(t.key)} onChange={() => toggle(t.key)} />
            {sel.includes(t.key) && <span className="text-11 text-brand2">{sel.indexOf(t.key) + 1}.</span>}
            {t.name}{!t.enabled && <span className="text-11 text-tx3">（已停用）</span>}
          </label>
        ))}
      </div>
      <span className="ml-auto flex items-center gap-2">
        {msg && <span className="text-xs text-ok">{msg}</span>}
        <button
          type="button"
          className="text-xs rounded-md border border-line px-2 py-1 disabled:opacity-40"
          disabled={!dirty || busy}
          onClick={() =>
            start(async () => {
              const r = await saveSetAction(kind, item.id, sel);
              setMsg(r.ok ? "已儲存" : r.error);
              if (r.ok) onSaved();
            })
          }
        >
          儲存
        </button>
      </span>
    </div>
  );
}

// ── ④ 催簽設定 ───────────────────────────────────────────────────────────────
function NudgeSection({ nudgeDays }: { nudgeDays: number }) {
  const [v, setV] = useState(String(nudgeDays));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <section className="border border-line rounded-lg p-4">
      <h2 className="font-bold mb-1">催簽與待辦</h2>
      <p className="text-11 text-tx3 mb-3">待簽超過這個天數（從發出或最後一次催算）就進「待我處理」與教練的「我的文件」；同一份一天最多催一次。逾期與拒簽一律進待辦。</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-tx2 text-xs">待簽超過</span>
        <input className={`${FIELD} w-20 text-center`} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} />
        <span className="text-tx2 text-xs">天進待辦</span>
        <SubmitButton state={busy ? "pending" : "idle"} onClick={() => start(async () => { const r = await saveDocSettingsAction({ nudgeDays: Number(v) }); setMsg(r.ok ? "已儲存" : r.error); })}>儲存</SubmitButton>
        {msg && <span className="text-xs text-tx2">{msg}</span>}
      </div>
    </section>
  );
}
