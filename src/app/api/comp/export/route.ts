// 業務制度：CSV 匯出（發放清冊、案件清單、匯入範本）。
// 需要後台權限；檔名帶 UTF-8 檔名參數，中文檔名在各家瀏覽器才不會變亂碼。

import { eq } from "drizzle-orm";
import { db } from "@/Shared/db";
import { compBatches, compCases, compPayouts } from "@/Shared/db/schema";
import { ensureCoach, isAdmin } from "@/lib/coach";
import { toCsv } from "@/lib/comp/csv";
import { IMPORT_HEADERS, importTemplateRows } from "@/lib/comp/importCases";
import { ensureActiveVersion, loadParams } from "@/lib/comp/repo";

export const dynamic = "force-dynamic";

function csvResponse(filename: string, body: string) {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}

export async function GET(req: Request) {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) return new Response("forbidden", { status: 403 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "batch";
  const version = await ensureActiveVersion();
  const params = await loadParams(version.id);
  const moduleName = (code: string) =>
    (params.modules ?? []).find((m) => m.code === code)?.name ?? code ?? "";

  if (kind === "template") {
    return csvResponse(
      "案件匯入範本.csv",
      toCsv([...IMPORT_HEADERS], importTemplateRows(params.modules ?? [])),
    );
  }

  if (kind === "batch") {
    const batchId = url.searchParams.get("batchId");
    if (!batchId) return new Response("missing batchId", { status: 400 });
    const batch = (await db.select().from(compBatches).where(eq(compBatches.id, batchId)).limit(1))[0];
    if (!batch) return new Response("not found", { status: 404 });

    const rows = await db
      .select({
        payeeName: compPayouts.payeeName,
        rankCode: compPayouts.rankCode,
        role: compPayouts.role,
        clientName: compCases.clientName,
        moduleCode: compCases.moduleCode,
        fee: compCases.fee,
        promoPct: compPayouts.promoPct,
        execPct: compPayouts.execPct,
        bonusPct: compPayouts.bonusPct,
        totalPct: compPayouts.totalPct,
        amount: compPayouts.amount,
        paidAt: compCases.paidAt,
      })
      .from(compPayouts)
      .innerJoin(compCases, eq(compPayouts.caseId, compCases.id))
      .where(eq(compPayouts.batchId, batchId));

    const body = toCsv(
      ["受款人", "職級", "身分", "客戶", "服務模塊", "顧問費", "推廣端%", "執案端%", "平階獎金%", "合計%", "金額", "實收日"],
      rows.map((r) => [
        r.payeeName, r.rankCode ?? "", r.role ?? "", r.clientName, moduleName(r.moduleCode),
        r.fee, r.promoPct, r.execPct, r.bonusPct, r.totalPct, r.amount, r.paidAt ?? "",
      ]),
    );
    return csvResponse(`分潤發放清冊_${batch.period}.csv`, body);
  }

  if (kind === "cases") {
    const rows = await db.select().from(compCases);
    const body = toCsv(
      ["案件建立日", "客戶", "服務模塊", "顧問費", "退費", "公司派案", "簽約日", "實收日", "問卷回收日", "狀態", "年度"],
      rows.map((c) => [
        c.createdAt.toISOString().slice(0, 10),
        c.clientName, moduleName(c.moduleCode), c.fee, c.refundAmount,
        c.isCompanyLead ? "是" : "否",
        c.signedAt ?? "", c.paidAt ?? "", c.surveyAt ?? "", c.status, c.caseYear,
      ]),
    );
    return csvResponse("案件清單.csv", body);
  }

  return new Response("unknown kind", { status: 400 });
}
