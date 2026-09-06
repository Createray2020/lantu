import type { ReactNode } from "react";

/**
 * 表單控制項的單一真相。
 *
 * 改版前同一種「文字輸入框」在 22 支檔案各自宣告一次常數，圓角在 rounded /
 * rounded-md / rounded-lg 之間跳、底色四種、而且只有部分有 focus 樣式——
 * 教練在同一段流程裡（客戶詳情 → 個人檔案）會看到兩種不同的鍵盤焦點樣式。
 *
 * ⚠️ 這裡刻意同時提供「class 常數」與「元件」兩種用法：
 *    既有 <input className={FIELD}> 的呼叫點直接換常數，改動最小；
 *    新寫的畫面用 <Field> / <Select>，才會連 label、說明、錯誤訊息一起長對。
 *    不要再在別處宣告第三份。
 */

const BASE =
  "w-full bg-field border border-line2 rounded-md text-sm px-3 py-2 text-tx " +
  "placeholder:text-tx3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

/** 一般輸入框／下拉／多行 */
export const FIELD = BASE;
/** 表格內的密集版（案件登錄、制度編輯那類一列很多格的畫面） */
export const FIELD_SM = "bg-field border border-line2 rounded px-2 py-1 text-sm text-tx placeholder:text-tx3";
/** 「這一格還沒填」的虛線版 */
export const FIELD_EMPTY = `${FIELD_SM} border-dashed text-tx2`;
/** 工具列上的窄下拉 */
export const SELECT_SM = "bg-field border border-line2 rounded-md text-sm px-2.5 py-1.5 text-tx";

export type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  /** 有值就顯示紅字，並把 aria-invalid 掛上去（globals.css 會畫紅框） */
  error?: string | null;
  children: ReactNode;
};

/** label ＋ 控制項 ＋ 說明／錯誤 的固定排法。label 與控制項距離刻意大於欄位內部間距。 */
export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="block">
      {label && <span className="block text-xs text-tx2 mb-1.5">{label}</span>}
      {children}
      {error ? (
        <span className="block text-xs text-danger mt-1.5">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-tx3 mt-1.5">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({
  error,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: string | null }) {
  return <input {...rest} aria-invalid={error ? true : undefined} className={`${FIELD} ${className}`} />;
}

export function Select({
  error,
  className = "",
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string | null }) {
  return (
    <select {...rest} aria-invalid={error ? true : undefined} className={`${FIELD} ${className}`}>
      {children}
    </select>
  );
}

export function TextArea({
  error,
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string | null }) {
  return (
    <textarea
      {...rest}
      aria-invalid={error ? true : undefined}
      className={`${FIELD} resize-y leading-relaxed ${className}`}
    />
  );
}
