"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { amtCaret, amtFmt, amtRaw } from "@/lib/money";

/**
 * 金額輸入欄。
 *
 * <input type="number"> 規格上就顯示不了逗號，所以金額欄一律 text + inputmode="numeric"，
 * 自己補逗號、自己把游標留在原本那個數字上——不然打到第四位數時整個字串被重寫，
 * 游標會被踢到最後面。public/lantu-app.html 早就這樣做了（amtFmt/amtRaw/amtKey），
 * 這一支是 React 這側的對應實作，共用 src/lib/money.ts 的同一套函式。
 *
 * ⚠️ onChange 拿到的一定是 number（或 allowEmpty 時的 null），不是畫面上那串帶逗號的字。
 *    呼叫端不要再自己 Number(e.target.value)——那正是 Number('1,200') = NaN → 靜默變 0 的來源。
 *
 * allowEmpty：業務制度那套「數字留空 ＝ 該門檻不檢查，不是 0」的語意要保住，
 *            清空欄位時回 null 而不是 0。預設 false（清空即 0）。
 */
export default function MoneyInput({
  value,
  onChange,
  allowEmpty = false,
  className = "",
  placeholder,
  disabled,
  title,
  id,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  allowEmpty?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  id?: string;
}) {
  // 打字中間態（"-"、清空、剛按下第四位數）不能直接回寫成 number 再算回來，
  // 否則使用者永遠清不掉欄位。draft 只活到 blur。
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  const external =
    value === null || value === undefined || !Number.isFinite(value) ? "" : amtFmt(String(Math.round(value as number)));
  const shown = draft !== null ? draft : external;

  useLayoutEffect(() => {
    if (caretRef.current !== null && ref.current) {
      try {
        ref.current.setSelectionRange(caretRef.current, caretRef.current);
      } catch {
        /* jsdom / 非文字型 input 會丟，忽略 */
      }
      caretRef.current = null;
    }
  });

  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode="numeric"
      title={title}
      value={shown}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      onChange={(e) => {
        const el = e.target;
        const next = amtCaret(el.value, el.selectionStart ?? el.value.length);
        caretRef.current = next.caret;
        setDraft(next.value);
        const raw = amtRaw(next.value);
        if (raw === "" || raw === "-") {
          onChange(allowEmpty ? null : 0);
          return;
        }
        onChange(Number(raw));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
