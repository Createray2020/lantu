"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DOC_CSS, ROLE_LABEL, slotKey, slotLabel, type DocAsk, type DocCategory, type DocSignerSlot } from "@/lib/docs";
import { VAR_GROUP_LABEL, varsFor, type VarGroup } from "@/lib/docsVars";
import { CHIP_CLASS, EDITOR_CSS, PASTE_KEEP, chipHtml, chipsToTokens, tokensToChips } from "@/lib/docsEditor";

/**
 * 範本的所見即所得編輯器（2026/10/28 Ray：「HTML 碼我們容易出問題」）。
 *
 * · 直接打字、從 Word／Google Docs 貼上就是排好的樣子；貼上時只留結構（標題／段落／粗體／條列／表格），Word 的樣式全丟。
 * · 欄位、簽名位、印鑑是「標籤」：點工具列插入，顯示成藍／橘／紅的小方塊，不能被打字改壞；存檔時換回 {{…}} 佔位。
 * · 對外的 value 永遠是「帶佔位的 HTML」——跟原本的儲存格式、消毒、快照完全相同，所以舊範本直接打得開。
 * · 「進階：原始碼」摺疊給除錯用。
 *
 * ⚠️ 用 document.execCommand 做粗體／條列：它雖然標 deprecated，但所有瀏覽器都還在，且不用拖一個編輯器套件進來。
 */
export default function RichTemplateEditor({
  value,
  onChange,
  signers,
  asks = [],
  category,
  useSeal,
}: {
  value: string;
  onChange: (html: string) => void;
  signers: DocSignerSlot[];
  asks?: DocAsk[];
  category: DocCategory;
  useSeal: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [raw, setRaw] = useState(false);
  const lastEmitted = useRef<string>("");
  const lastSigners = useRef<string>("");

  // 外部 value 變了（開啟不同範本、改了簽署人／確認項名稱、原始碼模式改過）才重灌；自己打字造成的 onChange 不回灌，避免游標跳走。
  const signersKey = JSON.stringify(signers) + "|" + JSON.stringify(asks);
  useEffect(() => {
    if (!ref.current || raw) return;
    if (value === lastEmitted.current && lastSigners.current === signersKey) return;
    ref.current.innerHTML = tokensToChips(value, signers, asks);
    lastEmitted.current = value;
    lastSigners.current = signersKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, signersKey, raw]);

  const emit = useCallback(() => {
    if (!ref.current) return;
    const html = chipsToTokens(ref.current.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  }, [onChange]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };
  const insertHtml = (html: string) => {
    ref.current?.focus();
    document.execCommand("insertHTML", false, html + "&nbsp;");
    emit();
  };

  // 貼上：只留結構，不留 Word 的 style／class／font
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    e.preventDefault();
    const clean = html ? cleanPaste(html) : text.split(/\n{2,}/).map((p) => `<p>${escapeText(p).replace(/\n/g, "<br>")}</p>`).join("");
    document.execCommand("insertHTML", false, clean);
    emit();
  };

  const vars = varsFor(category);
  const groups: VarGroup[] = ["base", "person", "admin", "check"];

  return (
    <div className="grid gap-2">
      <style dangerouslySetInnerHTML={{ __html: EDITOR_CSS }} />
      {/* 工具列 */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-panel2 p-1.5 text-xs">
        <Tb onClick={() => exec("formatBlock", "<h2>")} title="條文標題">標題</Tb>
        <Tb onClick={() => exec("formatBlock", "<p>")} title="一般段落">段落</Tb>
        <span className="w-px h-5 bg-line mx-1" />
        <Tb onClick={() => exec("bold")} title="粗體"><b>B</b></Tb>
        <Tb onClick={() => exec("underline")} title="底線"><u>U</u></Tb>
        <Tb onClick={() => exec("insertUnorderedList")} title="條列">• 條列</Tb>
        <Tb onClick={() => exec("insertOrderedList")} title="編號">1. 編號</Tb>
        <Tb onClick={() => exec("justifyCenter")} title="置中">置中</Tb>
        <Tb onClick={() => exec("justifyLeft")} title="靠左">靠左</Tb>
        <Tb onClick={() => insertHtml(`<table><tbody><tr><td>　</td><td>　</td></tr><tr><td>　</td><td>　</td></tr></tbody></table><p></p>`)} title="插入 2×2 表格">表格</Tb>
        <span className="w-px h-5 bg-line mx-1" />
        <select className="rounded border border-line bg-field px-1.5 py-1 text-xs" value="" onChange={(e) => { if (e.target.value) insertHtml(chipHtml("var", e.target.value)); e.target.value = ""; }} title="插入會自動帶入的欄位">
          <option value="">＋ 插入欄位…</option>
          {groups.map((g) => {
            const list = vars.filter((v) => v.group === g);
            return list.length ? (
              <optgroup key={g} label={VAR_GROUP_LABEL[g]}>
                {list.map((v) => <option key={v.key} value={v.key}>{g === "check" ? "☐ " : ""}{v.label}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        {asks.length > 0 && (
          <select className="rounded border border-line bg-field px-1.5 py-1 text-xs" value="" onChange={(e) => { const a = asks.find((x) => x.key === e.target.value); if (a) insertHtml(chipHtml("ask", a.key, a.label || a.key)); e.target.value = ""; }} title="簽署人作答的確認項（☐→☑）">
            <option value="">＋ 插入確認項…</option>
            {asks.map((a) => <option key={a.key} value={a.key}>☐ {a.label || a.key}</option>)}
          </select>
        )}
        <select className="rounded border border-line bg-field px-1.5 py-1 text-xs" value="" onChange={(e) => { const s = signers.find((x) => slotKey(x) === e.target.value); if (s) insertHtml(chipHtml("slot", slotKey(s), slotLabel(s))); e.target.value = ""; }} title="簽名要出現的位置">
          <option value="">＋ 插入簽名位…</option>
          {signers.map((s) => <option key={slotKey(s)} value={slotKey(s)}>{s.seq}. {slotLabel(s)}（{ROLE_LABEL[s.role]}）</option>)}
        </select>
        {useSeal && <Tb onClick={() => insertHtml(chipHtml("seal"))} title="公司大小章出現的位置">＋ 印鑑</Tb>}
        <span className="flex-1" />
        <Tb onClick={() => exec("undo")} title="復原">↶</Tb>
        <Tb onClick={() => exec("redo")} title="重做">↷</Tb>
      </div>

      {/* 編輯區：套文件本身的樣式，看到的就是簽署頁會長的樣子 */}
      {!raw && (
        <div className="rounded-md border border-line bg-white text-black overflow-auto max-h-[60vh]">
          <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
          <div
            ref={ref}
            className="doc-body tpl-editor min-h-[360px]"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="在這裡直接打字，或從 Word 貼上合約內容…"
            onInput={emit}
            onBlur={emit}
            onPaste={onPaste}
            spellCheck={false}
          />
        </div>
      )}
      <p className="text-11 text-tx3">沒放進內容裡的簽名位與確認項，產文件時會自動補在文末「簽署欄」。藍色＝自動帶入的欄位、綠色＝系統依資料打勾的格子、紫色＝簽署人自己勾的確認項、橘色＝簽名位、紅色＝公司印鑑；要刪掉就像刪一個字一樣按退格。</p>

      <details open={raw} onToggle={(e) => setRaw((e.target as HTMLDetailsElement).open)}>
        <summary className="text-11 text-tx3 cursor-pointer select-none">進階：原始碼（一般不用碰）</summary>
        {raw && (
          <textarea
            className="mt-2 w-full rounded-md border border-line bg-field font-mono text-xs leading-relaxed min-h-[300px] p-2"
            value={value}
            onChange={(e) => { lastEmitted.current = ""; onChange(e.target.value); }}
            spellCheck={false}
          />
        )}
      </details>
    </div>
  );
}

function Tb({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button type="button" title={title} className="rounded border border-line bg-panel px-2 py-1 hover:bg-panel3" onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Word／網頁貼上的 HTML：只留結構標籤、丟掉所有屬性；我們自己的標籤（chip）原樣保留。 */
function cleanPaste(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = document.createElement("div");
  const walk = (node: Node, into: HTMLElement) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        into.appendChild(document.createTextNode(n.textContent ?? ""));
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const el = n as HTMLElement;
      if (el.classList.contains(CHIP_CLASS)) { into.appendChild(el.cloneNode(true)); return; }
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "META" || tag === "LINK") return;
      if (PASTE_KEEP.has(tag)) {
        const keep = document.createElement(tag === "B" ? "strong" : tag === "I" ? "em" : tag.toLowerCase());
        walk(el, keep);
        into.appendChild(keep);
      } else if (tag === "DIV") {
        // Google Docs 用 div 當段落
        const p = document.createElement("p");
        walk(el, p);
        into.appendChild(p);
      } else {
        walk(el, into); // span／font／o:p…：拆掉外殼，留內容
      }
    });
  };
  walk(doc.body, out);
  return out.innerHTML;
}
