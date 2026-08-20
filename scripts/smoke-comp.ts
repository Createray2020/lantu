// 業務制度端對端煙霧測試：直接打 Neon，把「單元測試看不到的 SQL 行為」跑一遍
// （唯一索引、onConflict、批次 join、部分索引 where status<>'void'）。
// 全程使用 smoke_ 前綴的臨時資料，結束一律刪除。
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, like, inArray } from "drizzle-orm";
import { db } from "../src/Shared/db";
import {
  coaches, compBatches, compCases, compModules, compPayouts, compRankEvents,
  compTrainingRecords, compTrainingSessions,
} from "../src/Shared/db/schema";
import {
  ensureActiveVersion, loadParams, saveModules, saveRanks, saveSettings, saveThresholds,
} from "../src/lib/comp/repo";
import { V4_MODULES, V4_RANKS, V4_SETTINGS, V4_THRESHOLDS } from "../src/lib/comp/preset";
import {
  createBatch, createCase, listPayouts, markAttendance, markBatchPaid, recalcCase,
  refundCase, setAdvisorRank,
} from "../src/lib/comp/caseRepo";
import { personalStats } from "../src/lib/comp/stats";
import type { ThresholdKind } from "../src/lib/comp/types";

const IDS = { chief: "smoke_chief", s2: "smoke_s2", c1: "smoke_c1" };
let ok = 0, bad = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) { ok++; console.log(`  ✓ ${label}`); }
  else { bad++; console.log(`  ✗ ${label}`, extra ?? ""); }
}

async function cleanup() {
  const ids = Object.values(IDS);
  const cs = await db.select({ id: compCases.id }).from(compCases).where(inArray(compCases.executorId, ids));
  if (cs.length) {
    await db.delete(compPayouts).where(inArray(compPayouts.caseId, cs.map((c) => c.id)));
    await db.delete(compCases).where(inArray(compCases.id, cs.map((c) => c.id)));
  }
  await db.delete(compTrainingRecords).where(inArray(compTrainingRecords.coachId, ids));
  await db.delete(compTrainingSessions).where(like(compTrainingSessions.topic, "smoke%"));
  await db.delete(compRankEvents).where(inArray(compRankEvents.coachId, ids));
  await db.delete(compBatches).where(like(compBatches.period, "1999-%"));
  // 測試用的模塊也要收乾淨（FULL／SPOT 是正常設定，留著）。
  await db.delete(compModules).where(like(compModules.code, "SMOKE%"));
  await db.delete(coaches).where(inArray(coaches.id, ids));
}

async function main() {
  await cleanup();

  // 1) 制度版本：載入 V4
  const v = await ensureActiveVersion();
  const before = await loadParams(v.id);
  const hadRanks = before.ranks.length > 0;
  if (!hadRanks) {
    await saveSettings(v.id, V4_SETTINGS);
    await saveRanks(v.id, V4_RANKS);
    for (const k of ["promotion_a", "promotion_b", "tenure"] as ThresholdKind[]) {
      await saveThresholds(v.id, k, V4_THRESHOLDS.filter((t) => t.kind === k));
    }
  }
  // 服務模塊：沒有就補上 V4 的兩個，並額外建一個 flat 模塊供本測試使用。
  const existing = (await loadParams(v.id)).modules ?? [];
  const wanted = [
    ...(existing.length ? existing : V4_MODULES.map((m) => ({ ...m }))),
  ];
  if (!wanted.some((m) => m.code === "SMOKEFLAT")) {
    wanted.push({
      code: "SMOKEFLAT", seq: 90, name: "smoke固定比例", splitMode: "flat" as const,
      flatExecPct: 40, flatPromoPct: 10, price: 20_000,
      countPromotion: false, countMaintenance: false, enabled: true,
    });
  }
  if (!wanted.some((m) => m.code === "SMOKELOW")) {
    wanted.push({
      code: "SMOKELOW", seq: 91, name: "smoke低比例", splitMode: "chain" as const,
      splitPromoPct: 20, splitExecPct: 70, price: null,
      countPromotion: true, countMaintenance: true, enabled: true,
    });
  }
  await saveModules(v.id, wanted);

  const params = await loadParams(v.id);
  check("職級表讀得到（7 階）", params.ranks.length === 7, params.ranks.length);
  check("服務模塊讀得到", (params.modules ?? []).length >= 3, (params.modules ?? []).length);
  check("既有職級全部落在預設表（module_code 空）",
    params.ranks.every((r) => !(r.moduleCode ?? "")), params.ranks.map((r) => r.moduleCode));

  // 2) 臨時組織：C1 → S2 → 首席
  await db.insert(coaches).values([
    { id: IDS.chief, name: "smoke首席", status: "active", rankCode: "CHIEF", uplineId: null },
    { id: IDS.s2, name: "smokeS2", status: "active", rankCode: "S2", uplineId: IDS.chief },
    { id: IDS.c1, name: "smokeC1", status: "active", rankCode: "C1", uplineId: IDS.s2, hireDate: "2024-01-01" },
  ]);

  // 3) 登錄案件 → 分潤應等於辦法範例一
  const c = await createCase({
    clientName: "smoke客戶", fee: 60_000, executorId: IDS.c1, promoterId: IDS.c1,
    signedAt: "2026-03-01", paidAt: "2026-03-05", surveyAt: "2026-03-10",
  });
  const p1 = await listPayouts(c.id);
  const pct = (id: string | null) => p1.find((x) => x.payeeId === id)?.totalPct ?? null;
  const amt = (id: string | null) => p1.find((x) => x.payeeId === id)?.amount ?? null;
  check("C1 45%／27,000", pct(IDS.c1) === 45 && amt(IDS.c1) === 27_000, [pct(IDS.c1), amt(IDS.c1)]);
  check("S2 31%／18,600", pct(IDS.s2) === 31 && amt(IDS.s2) === 18_600, [pct(IDS.s2), amt(IDS.s2)]);
  check("首席 14%／8,400", pct(IDS.chief) === 14 && amt(IDS.chief) === 8_400);
  check("加總 100%", Math.abs(p1.reduce((a, x) => a + x.totalPct, 0) - 100) < 1e-6);
  check("金額加總＝顧問費", p1.reduce((a, x) => a + x.amount, 0) === 60_000);

  // 3b) 模塊：低比例 chain 模塊會依上限重算
  const cLow = await createCase({
    clientName: "smoke低比例", fee: 60_000, executorId: IDS.c1, promoterId: IDS.c1,
    moduleCode: "SMOKELOW", paidAt: "2026-03-05", surveyAt: "2026-03-10",
  });
  const pLow = await listPayouts(cLow.id);
  const lowPct = (id: string | null) => pLow.find((x) => x.payeeId === id)?.totalPct ?? null;
  check("低比例模塊：C1 仍 45%（在上限內）", lowPct(IDS.c1) === 45, lowPct(IDS.c1));
  check("低比例模塊：S2 依新上限＝25%", lowPct(IDS.s2) === 25, lowPct(IDS.s2));
  check("低比例模塊：加總 100%",
    Math.abs(pLow.reduce((a, x) => a + x.totalPct, 0) - 100) < 1e-6);

  // 3c) flat 模塊：不沿輔導鏈
  const cFlat = await createCase({
    clientName: "smoke固定", fee: 60_000, executorId: IDS.c1, promoterId: IDS.c1,
    moduleCode: "SMOKEFLAT", paidAt: "2026-03-05", surveyAt: "2026-03-10",
  });
  const pFlat = await listPayouts(cFlat.id);
  const flatPct = (id: string | null) => pFlat.find((x) => x.payeeId === id)?.totalPct ?? null;
  check("flat 模塊：執行者 50%（40＋10 自推自執）", flatPct(IDS.c1) === 50, flatPct(IDS.c1));
  check("flat 模塊：上層不分潤", flatPct(IDS.s2) === null && flatPct(IDS.chief) === null);
  check("flat 模塊：加總 100%",
    Math.abs(pFlat.reduce((a, x) => a + x.totalPct, 0) - 100) < 1e-6);

  // 3d) 計入開關：flat 模塊關掉「計入晉升」→ 不進個人指標
  {
    const allCases = await db.select().from(compCases).where(eq(compCases.executorId, IDS.c1));
    const rows = allCases.map((x) => ({
      id: x.id, executorId: x.executorId, promoterId: x.promoterId, moduleCode: x.moduleCode,
      clientId: x.clientId, clientName: x.clientName, fee: x.fee, refundAmount: x.refundAmount,
      caseYear: x.caseYear, paidAt: x.paidAt, surveyAt: x.surveyAt, status: x.status,
    }));
    const st = personalStats(rows, IDS.c1, params);
    // 三筆案件中，SMOKEFLAT 那筆的 countPromotion=false，不該計入。
    check("關掉計入晉升的模塊不進個人指標", st.cases === rows.length - 1, [st.cases, rows.length]);
  }

  // 4) 重算兩次不會產生重複有效列（唯一部分索引）
  await recalcCase(c.id);
  await recalcCase(c.id);
  const p2 = await listPayouts(c.id);
  check("重算後有效列數不變", p2.length === p1.length, [p1.length, p2.length]);
  const voided = await db.select().from(compPayouts)
    .where(and(eq(compPayouts.caseId, c.id), eq(compPayouts.status, "void")));
  check("舊列被標為 void 而非刪除（保留稽核軌跡）", voided.length >= p1.length * 2, voided.length);

  // 5) 批次：只收已實收的分潤
  const batch = await createBatch("1999-01", "1999-02-05");
  check("批次收到本案分潤", batch.count >= p2.length, batch);
  await markBatchPaid(batch.batchId, IDS.chief);
  const afterPaid = await db.select().from(compCases).where(eq(compCases.id, c.id));
  check("發放後案件狀態轉 paid", afterPaid[0].status === "paid", afterPaid[0].status);

  // 6) 退費：按實收比例重算
  const c2 = await createCase({
    clientName: "smoke退費", fee: 60_000, executorId: IDS.c1, promoterId: IDS.c1,
    paidAt: "2026-04-05", surveyAt: "2026-04-10",
  });
  await refundCase(c2.id, 30_000);
  const p3 = await listPayouts(c2.id);
  const c1line = p3.find((x) => x.payeeId === IDS.c1);
  check("部分退費：比例不變、金額減半", c1line?.totalPct === 45 && c1line?.amount === 13_500, c1line?.amount);
  check("退費後加總仍為實收金額", p3.reduce((a, x) => a + x.amount, 0) === 30_000);

  // 7) 訓練：重複點名不會讓時數加倍
  const sess = await db.insert(compTrainingSessions).values({
    heldOn: "2026-05-01", topic: "smoke研討會", mode: "onsite", speakerId: IDS.s2,
  }).returning();
  await markAttendance(sess[0].id, [IDS.c1, IDS.s2], params);
  await markAttendance(sess[0].id, [IDS.c1, IDS.s2], params);
  const recs = await db.select().from(compTrainingRecords).where(eq(compTrainingRecords.sessionId, sess[0].id));
  const c1rec = recs.filter((r) => r.coachId === IDS.c1);
  const s2rec = recs.filter((r) => r.coachId === IDS.s2);
  check("重複點名只留一筆", c1rec.length === 1, recs.length);
  check("一般出席 2 小時", c1rec[0]?.hours === 2, c1rec[0]?.hours);
  check("講師加倍 4 小時", s2rec.some((r) => r.kind === "speaker" && r.hours === 4), s2rec);

  // 8) 職級異動留紀錄
  await setAdvisorRank(IDS.c1, "C2", "manual", IDS.chief, "smoke 測試");
  const ev = await db.select().from(compRankEvents).where(eq(compRankEvents.coachId, IDS.c1));
  check("職級異動寫入時間軸", ev.length === 1 && ev[0].fromCode === "C1" && ev[0].toCode === "C2", ev);

  console.log(`\n通過 ${ok} 項、失敗 ${bad} 項`);
}

main()
  .catch((e) => { bad++; console.error("執行錯誤：", e); })
  .finally(async () => {
    await cleanup();
    console.log("臨時資料已清除");
    process.exit(bad ? 1 : 0);
  });
