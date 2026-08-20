// 案件批次匯入：解析 → 逐列驗證 → 回報。
//
// 刻意做成「先預覽再寫入」：匯入是一次進來幾十筆的操作，
// 錯一列就整批退回太粗暴，默默跳過又會讓人以為全進來了。
// 所以驗證與寫入分成兩個函式，中間插一個人看得懂的預覽。

import { csvToObjects, normalizeDate, normalizeNumber } from "./csv";
import type { CaseInput } from "./caseRepo";
import type { ModuleRow } from "./types";

export const IMPORT_HEADERS = [
  "客戶姓名", "服務模塊代號", "顧問費", "推廣者Email", "執案者Email",
  "公司派案", "簽約日", "實收日", "問卷回收日", "備註",
] as const;

export type ImportRow = {
  line: number;
  raw: Record<string, string>;
  input: CaseInput | null;
  errors: string[];
  /** 顯示用（Email 已解析成姓名） */
  display: {
    clientName: string; moduleName: string; fee: string;
    promoter: string; executor: string; signedAt: string;
  };
};

export type Peer = { id: string; email: string | null; name: string | null; status: string };

/** 產出可直接填的範本（含一列範例）。 */
export function importTemplateRows(modules: ModuleRow[]): unknown[][] {
  const code = modules.find((m) => m.enabled !== false)?.code ?? "FULL";
  return [[
    "王小明", code, "60000", "coach@example.com", "coach@example.com",
    "否", "2026-03-01", "2026-03-05", "2026-03-10", "範例列，匯入前請刪除",
  ]];
}

/**
 * 驗證一整份 CSV，回傳每一列的結果。
 * 顧問一律以 Email 對應（姓名會重複、id 是 Clerk 的亂碼，兩者都不適合讓人手填）。
 */
export function validateImport(
  text: string,
  peers: Peer[],
  modules: ModuleRow[],
): { rows: ImportRow[]; missingHeaders: string[] } {
  const { headers, rows } = csvToObjects(text);
  const missingHeaders = IMPORT_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length) return { rows: [], missingHeaders };

  const byEmail = new Map(
    peers.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]),
  );
  const moduleMap = new Map(modules.map((m) => [m.code.toUpperCase(), m]));

  const out: ImportRow[] = rows.map((raw, i) => {
    const errors: string[] = [];

    const clientName = (raw["客戶姓名"] || "").trim();
    if (!clientName) errors.push("客戶姓名必填");

    const moduleCode = (raw["服務模塊代號"] || "").trim().toUpperCase();
    const mod = moduleCode ? moduleMap.get(moduleCode) : undefined;
    if (moduleCode && !mod) errors.push(`找不到服務模塊「${moduleCode}」`);

    const fee = normalizeNumber(raw["顧問費"] || "");
    if (fee === null) errors.push("顧問費格式看不懂");
    else if (fee <= 0) errors.push("顧問費要大於 0");

    const isCompanyLead = /^(是|Y|YES|TRUE|1|V)$/i.test((raw["公司派案"] || "").trim());

    const execEmail = (raw["執案者Email"] || "").trim().toLowerCase();
    const exec = execEmail ? byEmail.get(execEmail) : undefined;
    if (!execEmail) errors.push("執案者Email必填");
    else if (!exec) errors.push(`找不到顧問 ${execEmail}`);
    else if (exec.status !== "active") errors.push(`顧問 ${execEmail} 尚未開通`);

    const promoEmail = (raw["推廣者Email"] || "").trim().toLowerCase();
    let promoter: Peer | undefined;
    if (!isCompanyLead && promoEmail) {
      promoter = byEmail.get(promoEmail);
      if (!promoter) errors.push(`找不到推廣者 ${promoEmail}`);
    }

    const dateField = (key: string) => {
      const v = (raw[key] || "").trim();
      if (!v) return null;
      const d = normalizeDate(v);
      if (!d) errors.push(`${key}格式看不懂（請用 YYYY-MM-DD）`);
      return d;
    };
    const signedAt = dateField("簽約日");
    const paidAt = dateField("實收日");
    const surveyAt = dateField("問卷回收日");

    const input: CaseInput | null = errors.length || !exec || fee === null ? null : {
      clientName,
      moduleCode: mod?.code ?? "",
      fee,
      isCompanyLead,
      promoterId: isCompanyLead ? null : (promoter?.id ?? exec.id),
      executorId: exec.id,
      signedAt, paidAt, surveyAt,
      note: (raw["備註"] || "").trim() || null,
    };

    return {
      line: i + 2, // 第 1 列是表頭
      raw,
      input,
      errors,
      display: {
        clientName: clientName || "（空白）",
        moduleName: mod?.name ?? (moduleCode || "未指定"),
        fee: fee === null ? (raw["顧問費"] || "") : fee.toLocaleString("zh-TW"),
        promoter: isCompanyLead ? "公司派案" : (promoter?.name || promoter?.email || "同執案者"),
        executor: exec?.name || exec?.email || execEmail || "—",
        signedAt: signedAt ?? "—",
      },
    };
  });

  return { rows: out, missingHeaders: [] };
}
