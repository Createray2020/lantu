"use server";

// AI 助理的 server action（2026/10/25）。
//
// ⚠️ 刻意不放在 actions.ts：那支檔案是「教練端所有寫入」的家，clientScope.drift.test 守著它不准引用
//    可讀範圍（getPlanForRead／clientAccess）。助理是**讀**——協作唯讀教練也能問答——所以它需要可讀範圍，
//    就自己住一支檔案，讓那條規則繼續有效。
import { requireCoach } from "@/lib/guard";
import { clientAccess } from "@/lib/clientScope";
import { getPlanForRead } from "@/lib/plans";
import { getCategoryPayload } from "@/lib/financeCategories";
import { askAssistant, monthlyCap, ERR_TEXT, type AssistantResult, type ChatMsg } from "@/lib/assistant";
import { recordUsage, monthTokens } from "@/lib/aiUsage";
import { getModuleStates } from "@/lib/platformModules";
import { licenseState } from "@/lib/license";

// ── AI 助理（2026/10/25）──────────────────────────────────────────
//
// 身分與歸屬在這裡驗，模型呼叫與動作解析在 lib/assistant.ts，**這一支一個字都不寫進 plans.data**：
// 助理回的是預覽卡，教練在規劃器按「套用」才走它原本的 set()／addRow() → lantu:save → savePlanDataAction。
// 所以寫入的權限閘仍然是 savePlanDataAction 那一道（ownedPlanLite），這裡只決定「要不要讓模型提案」。
//
// canWrite ＝ 主責（clientAccess 'owner'）且期限未到期且後台 assistant_write 開著。
// 協作唯讀教練（viewer）永遠只能問答——模型的系統提示會直接說明，resolveOps 也會把 ops 全退回。
export type AskAssistantInput = {
  planId: string;
  /** 規劃器當下的 case（含還沒存回 DB 的那 700ms）。⚠️ 只拿來組 grounding，不會寫回。 */
  data: unknown;
  messages: ChatMsg[];
  context?: string | null;
};

export async function askAssistantAction(input: AskAssistantInput): Promise<AssistantResult> {
  let me;
  try { me = await requireCoach(); } catch { return { ok: false, code: "forbidden", error: ERR_TEXT.forbidden }; }
  const plan = await getPlanForRead(me.id, input.planId);
  if (!plan) return { ok: false, code: "forbidden", error: ERR_TEXT.forbidden };
  const [access, mods] = await Promise.all([clientAccess(me.id, plan.clientId), getModuleStates()]);
  if (!access) return { ok: false, code: "forbidden", error: ERR_TEXT.forbidden };
  if (!mods.assistant?.enabled) return { ok: false, code: "not_configured", error: mods.assistant?.notice || ERR_TEXT.not_configured };

  const cap = monthlyCap();
  if (cap > 0 && (await monthTokens(me.id)) >= cap) return { ok: false, code: "rate_limited", error: ERR_TEXT.rate_limited };

  const canWrite = access === "owner" && !licenseState(me).expired && !!mods.assistant_write?.enabled;
  // grounding 用規劃器送來的即時 data；形狀不像 case（空、null）就退回 DB 那份，不要讓助理對著空白講話。
  const live = input.data && typeof input.data === "object" && !Array.isArray(input.data) && (input.data as { profile?: unknown }).profile
    ? input.data : plan.data;
  let cats = null;
  try { cats = await getCategoryPayload(); } catch { cats = null; }

  const r = await askAssistant({ data: live, messages: input.messages, canWrite, cats, context: input.context ?? null });
  if (r.ok) {
    await recordUsage({ coachId: me.id, clientId: plan.clientId, mode: "advisor", model: r.usage.model, input: r.usage.input, output: r.usage.output, opsProposed: r.ops.length });
  }
  return r;
}
