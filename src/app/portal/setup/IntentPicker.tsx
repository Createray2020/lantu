"use client";

import { PURPOSES, ALL_SIM, DEFAULT_TARGET, PURPOSE_TO_ENTITY, visibleTargetMeta, type Intent } from "@/lib/intent";

// 客戶端「你想解決什麼」：關注議題（多選）＋人生目標（二態：選了＝必須達成）＋拖曳優先序。
// 手機為主，所以拖曳一定配 ◀ ▶ 按鈕，不能只靠拖。
export default function IntentPicker({ value, onChange }: { value: Intent; onChange: (next: Intent) => void }) {
  const must = value.mustHave;
  // ⚠️ 一律用 ...value 開頭：intent 上還有 entities（企業主體），漏掉會在每次勾選時把它洗掉。
  const set = (next: Partial<Intent>) => {
    const m = next.mustHave ?? must;
    onChange({ ...value, ...next, mustHave: m, targets: m.slice() });
  };

  // 企業主體開了才看得到企業目標；勾「想處理公司與個人的財務界線」就會自動開（見 intent.ts）。
  const entities = value.entities || {};
  const metas = visibleTargetMeta({ entities });
  const allNames = () => metas.map((t) => t.name);

  const togglePurpose = (p: string) => {
    const i = value.purposes.indexOf(p);
    if (i < 0) {
      const purposes = [...value.purposes, p];
      const ek = PURPOSE_TO_ENTITY[p];
      const ent = ek ? { ...entities, [ek]: true } : entities;
      // 勾「人生模擬」＝目標全選（要跑完整一生金流，就是把所有目標打開）
      set(p === ALL_SIM
        ? { purposes, entities: ent, mustHave: visibleTargetMeta({ entities: ent }).map((t) => t.name) }
        : { purposes, entities: ent });
    } else {
      const purposes = value.purposes.filter((x) => x !== p);
      // 取消議題要一併關掉它帶出來的主體，否則 normalizeIntent 下一輪又會打開
      const ek = PURPOSE_TO_ENTITY[p];
      const stillOn = ek && purposes.some((x) => PURPOSE_TO_ENTITY[x] === ek);
      const ent = ek && !stillOn ? { ...entities, [ek]: false } : entities;
      // 主體關掉 → 它帶出的目標退出必達清單，否則優先序的 index 會對不上（拖曳排錯人）
      const names = new Set(visibleTargetMeta({ entities: ent }).map((m) => m.name));
      set({ purposes, entities: ent, mustHave: must.filter((t) => names.has(t)) });
    }
  };

  const toggleTarget = (t: string) => {
    const i = must.indexOf(t);
    if (i < 0) return set({ mustHave: [...must, t] });
    if (t === DEFAULT_TARGET && !confirm("退休幾乎是必然會發生的。\n取消後，我們不會幫你算退休金需求。\n\n確定取消嗎？")) return;
    set({ mustHave: must.filter((x) => x !== t), purposes: value.purposes.filter((p) => p !== ALL_SIM) });
  };

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= must.length) return;
    const next = must.slice();
    [next[i], next[j]] = [next[j], next[i]];
    set({ mustHave: next });
  };

  const drop = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = must.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    set({ mustHave: next });
  };

  const selectAll = () =>
    set({
      mustHave: allNames(),
      purposes: value.purposes.includes(ALL_SIM) ? value.purposes : [...value.purposes, ALL_SIM],
    });

  return (
    <section className="rounded-2xl bg-[#12334f] border border-white/8 p-5 sm:p-6 mb-4">
      <h2 className="font-serif text-lg mb-1">🧭 你想解決什麼</h2>
      <p className="text-[11px] text-[#6f869c] mb-4">選起來的，我們就當作一定要達成；沒選的不會再問你相關問題。</p>

      {/* 關注議題 */}
      <div className="text-[12px] text-[#a7bacb] mb-2">關注議題 · 可複選</div>
      <div className="flex flex-wrap gap-2 mb-6">
        {PURPOSES.map((p) => {
          const on = value.purposes.includes(p);
          return (
            <button key={p} type="button" onClick={() => togglePurpose(p)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold border ${on ? "bg-[#c99a5b] text-[#08202a] border-[#c99a5b]" : "bg-[#17406a] text-[#a7bacb] border-white/12 hover:border-[#e0bd8b]"}`}>
              {on ? "✓ " : ""}{p}
            </button>
          );
        })}
      </div>

      {/* 人生目標 */}
      <div className="flex items-center flex-wrap gap-2 mb-2">
        <span className="text-[12px] text-[#a7bacb]">人生目標 · 選了＝一定要達成</span>
        <span className="flex-1" />
        <button type="button" onClick={selectAll}
          className="text-[12px] font-bold text-[#e0bd8b] border border-[#c99a5b]/40 rounded-lg px-3 py-1 hover:bg-white/5">
          我全都要 · 跑完整人生模擬
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
        {metas.map((m) => {
          const i = must.indexOf(m.name);
          const on = i >= 0;
          return (
            <button key={m.name} type="button" onClick={() => toggleTarget(m.name)}
              className={`relative text-left rounded-xl border px-3 py-2.5 ${on ? "bg-[#c99a5b] text-[#08202a] border-[#c99a5b]" : "bg-[#17406a] text-[#a7bacb] border-white/12 hover:border-[#e0bd8b]"}`}>
              {on && (
                <span className="absolute -top-2 -right-2 grid place-items-center w-[22px] h-[22px] rounded-full bg-[#08202a] text-[#e0bd8b] border border-[#c99a5b] font-serif text-[12px] font-extrabold">
                  {i + 1}
                </span>
              )}
              <span className="block font-bold text-[13.5px] leading-tight">{m.name}</span>
              <span className={`block text-[11px] mt-0.5 ${on ? "text-[#08202a]/65" : "text-[#6f869c]"}`}>
                {on && m.name === DEFAULT_TARGET ? "預設必達 · " : ""}{m.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* 優先序 */}
      <div className="text-[12px] text-[#a7bacb] mb-1">哪個最重要？</div>
      <p className="text-[11px] text-[#6f869c] mb-2">拖曳或用 ◀ ▶ 排出順序。錢不夠時，我們會從最後一項開始調整。</p>
      {must.length === 0 ? (
        <div className="text-[12.5px] text-[#6f869c] py-1">
          尚未選擇任何人生目標——這份規劃只會看你的收支與資產結構，不含任何未來目標。
        </div>
      ) : (
        <div className="flex flex-col gap-2" onDragOver={(e) => e.preventDefault()}>
          {must.map((t, i) => (
            <div key={t} draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
              onDrop={(e) => { e.preventDefault(); drop(parseInt(e.dataTransfer.getData("text/plain"), 10), i); }}
              className="flex items-center gap-2 rounded-lg bg-[#0a2137] border border-white/10 pl-3 pr-1.5 py-1.5 cursor-grab">
              <span className="text-[#6f869c] tracking-tighter">⣿</span>
              <span className="font-serif text-[14px] font-extrabold text-[#e0bd8b] min-w-[14px] text-center">{i + 1}</span>
              <span className="flex-1 font-bold text-[13px] text-[#eef2f7]">{t}</span>
              <button type="button" aria-label="往前" onClick={() => move(i, -1)}
                className="w-[26px] h-[26px] rounded-md border border-white/12 text-[#a7bacb] text-[11px] hover:border-[#e0bd8b] hover:text-[#e0bd8b]">◀</button>
              <button type="button" aria-label="往後" onClick={() => move(i, 1)}
                className="w-[26px] h-[26px] rounded-md border border-white/12 text-[#a7bacb] text-[11px] hover:border-[#e0bd8b] hover:text-[#e0bd8b]">▶</button>
              <button type="button" aria-label="移除" onClick={() => toggleTarget(t)}
                className="px-1.5 text-[#6f869c] hover:text-[#ff9b9b]">✕</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
