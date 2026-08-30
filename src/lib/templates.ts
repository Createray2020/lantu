// 共用示範範本（2026/08/30 Ray 拍板）的資料層。
//
// 一組「所有教練登入後都看得到、誰都改不了」的示範個案，用來坐在客戶旁邊翻給他看。
// 資料上它就是 clients 的一列，只是租戶維度不同：coach_id = null、client_user_id = null、
// is_template = true（欄位形狀的理由寫在 Shared/db/schema.ts 的 clients 表上）。
//
// ⚠️ 這個檔案是全庫**唯一**准許使用 templateClient()（第四把尺、跨租戶可見）的地方，
//    clientScope.drift.test.ts 逐檔掃著。它的完整邊界與配套寫在 lib/clientScope.ts 的
//    templateClient() 上方，動這個檔案前請先讀那一段。
//
// 三種呼叫端，三種身分假設，不要混用：
//   讀取端（listTemplates / getTemplateForRead）
//     給教練端用。呼叫端自己已經過 requireCoach()／requireWritableCoach()，
//     這裡只管「範圍」——而範圍就是「全體 active 教練都一樣」。
//     ⚠️ 客戶端 /portal 不得呼叫這裡任何一支（範本只是教練的展示素材，
//        對客戶而言那是別人的財務資料）。
//   管理端（createTemplate / updateTemplate / deleteTemplate / reorderTemplates）
//     **每一支都自己驗 isAdmin()**，不相信呼叫端。理由同 lib/guard.ts：
//     「每個 action 各自記得擋」在加第二個入口時必然漏掉一個，而漏掉的那個
//     就是「任何教練都改得動全公司展示素材」。
//   複製端（copyTemplateToCoach）
//     教練把範本複製成**自己的一位正常客戶**。從落地那一刻起它就是一般客戶：
//     有客戶編號、is_template=false、coach_id＝他、計入額度、只受 ownedClient() 管轄。

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/Shared/db";
import { clients, plans } from "@/Shared/db/schema";
import { templateClient } from "./clientScope";
import { ensureCoach, isAdmin } from "./coach";
import { requireClientQuota, QuotaFullError } from "./guard";
import { allocCode } from "./codeAlloc";
import { newCaseData, planSnapshot } from "./snapshot";

const COACH_TRACK = "coach";
/** 複製出來的客戶身上的標記；教練端列表用它區分「這位是從範本試算出來的」。 */
export const TEMPLATE_COPY_TAG = "範本複製";

type ClientRow = typeof clients.$inferSelect;
type PlanRow = typeof plans.$inferSelect;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 管理端的唯一授權來源。
 * ⚠️ 不要改成「由呼叫端傳一個 isAdmin 布林進來」——那等於把授權交給 UI，
 *    而 UI 是別人接的、還會有第二個第三個入口。
 */
async function assertAdmin(): Promise<void> {
  const me = await ensureCoach();
  if (!(await isAdmin(me))) throw new Error("forbidden");
}

/**
 * 管理端寫入時的「這一列是不是範本」護欄。
 *
 * ⚠️ 刻意**不呼叫 templateClient()**：那把尺的定義是「全體教練的可見範圍」，
 *    一旦它出現在任何一句 update／delete 上，「沒有寫入路徑吃這把尺」這條
 *    唯一的邊界就不再是逐字可驗的了（drift 測試掃的就是這件事）。
 *    這裡要的是另一件事——不是授權（授權已由 assertAdmin() 完成），
 *    而是形狀護欄：管理員拿一個一般客戶的 id 打進範本 API 時，
 *    不可以改到／刪到那位真實客戶。
 */
function templateRow(id: string) {
  return and(eq(clients.id, id), eq(clients.isTemplate, true));
}

// ── 讀取端（教練端）────────────────────────────────────────────────

/** 範本清單的一列（抽屜／挑選器用；不含整份 case data）。 */
export type TemplateListItem = {
  id: string;
  name: string;
  templateLabel: string | null;
  lifeStage: string | null;
  templateOrder: number;
  /** 摘要：取教練軌最新一份 plan 的快照。沒有 plan 就是 null。 */
  healthGrade: string | null;
  netWorth: number | null;
};

/**
 * 全部範本，依 templateOrder 排（小的在前）。
 *
 * 排序刻意不吃 updated_at：範本是後台編排出來的教學素材，
 * 依更新時間排會讓「剛剛修了一個錯字」的那份跳到最前面。
 * templateOrder 相同時才用 updated_at 當次要鍵（穩定輸出，避免每次查順序都不一樣）。
 */
export async function listTemplates(): Promise<TemplateListItem[]> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      templateLabel: clients.templateLabel,
      lifeStage: clients.lifeStage,
      templateOrder: clients.templateOrder,
    })
    .from(clients)
    .where(templateClient())
    .orderBy(asc(clients.templateOrder), desc(clients.updatedAt));
  if (rows.length === 0) return [];

  // ⚠️ 明列欄位，不要 select() 整列 —— plans.data 是整份 case（約 20KB/份），
  // 清單只需要兩個快照數字（同 lib/clients.ts 的 decorateClients）。
  const ids = rows.map((r) => r.id);
  const planRows = await db
    .select({
      clientId: plans.clientId,
      year: plans.year,
      healthGrade: plans.healthGrade,
      netWorth: plans.netWorth,
      createdAt: plans.createdAt,
    })
    .from(plans)
    .where(and(inArray(plans.clientId, ids), eq(plans.track, COACH_TRACK)));

  return rows.map((r) => {
    const latest = planRows
      .filter((p) => p.clientId === r.id)
      .sort((a, b) => b.year - a.year || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0];
    return {
      ...r,
      healthGrade: latest?.healthGrade ?? null,
      netWorth: latest?.netWorth ?? null,
    };
  });
}

/** 範本的一份規劃（唯讀）。含 data：教練要翻的就是報告書本身。 */
export type TemplatePlanForRead = Readonly<{
  id: string;
  year: number;
  track: string;
  label: string | null;
  status: string;
  basedOnDate: string | null;
  healthGrade: string | null;
  netWorth: number | null;
  data: unknown;
}>;

/**
 * 範本詳情。
 * ⚠️ `readOnly: true` 是**字面量型別**不是 boolean：UI 端拿到這個型別就沒有
 *    「可能是 false」這個分支可寫，唯讀橫幅與停用編輯是照著型別掛的，不是靠記得。
 */
export type TemplateForRead = Readonly<{
  readOnly: true;
  client: Readonly<ClientRow>;
  plans: readonly TemplatePlanForRead[];
}>;

/**
 * 開一份範本來看。找不到（或那個 id 其實是一般客戶）回 null。
 *
 * 不收 coachId：範本對全體 active 教練是同一份，沒有「你的版本」。
 * 呼叫端負責驗身分（requireCoach()），這裡只負責範圍。
 */
export async function getTemplateForRead(templateId: string): Promise<TemplateForRead | null> {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, templateId), templateClient()))
    .limit(1);
  if (!client) return null;

  const planRows = await db
    .select({
      id: plans.id, year: plans.year, track: plans.track, label: plans.label, status: plans.status,
      basedOnDate: plans.basedOnDate, healthGrade: plans.healthGrade, netWorth: plans.netWorth,
      data: plans.data,
    })
    .from(plans)
    .where(eq(plans.clientId, templateId))
    .orderBy(desc(plans.year), desc(plans.createdAt));

  return { readOnly: true, client, plans: planRows };
}

// ── 管理端（後台；每一支自己驗 admin）──────────────────────────────

export type TemplateInput = {
  name: string;
  /** 客群標籤，例「雙薪育兒家庭」。 */
  templateLabel?: string | null;
  lifeStage?: string | null;
  tags?: string[];
  birthDate?: string | null;
  templateOrder?: number;
};

/**
 * 新增一份範本（同時建好第一份空白年度版本，否則詳情頁是空的、也沒東西可編輯——
 * 理由同 lib/clients.ts 的 createClient）。
 *
 * ⚠️⚠️ **不發客戶編號**（不呼叫 allocCode）。範本不是客戶：
 *    發了會吃掉當月的一個流水號（客戶編號從此跳號、對不上實際客戶數），
 *    而且那個號會印在報告書表頭上，客戶會看到一組不屬於自己的編號。
 *    `code` 留 null（clients_code_uidx 是 UNIQUE，Postgres 允許多個 NULL）。
 *
 * neon-http 沒有互動式交易（db.transaction() 直接丟錯），db.batch() 是單一交易；
 * batch 裡拿不到前一句的 returning，所以 id 自己先產。
 */
export async function createTemplate(input: TemplateInput): Promise<string> {
  await assertAdmin();
  const templateId = randomUUID();
  const year = new Date().getFullYear();
  const data = newCaseData(input.name);
  const snap = planSnapshot(data);

  await db.batch([
    db.insert(clients).values({
      id: templateId,
      // 三個欄位一起才是「範本」。coachId / clientUserId 必須是 null：
      // 給了 coachId 就會變成某位教練名下的客戶（雖然 ownedClient() 仍會擋，
      // 但那是最後一道網，不是拿來平常靠的）。
      coachId: null,
      clientUserId: null,
      isTemplate: true,
      templateLabel: input.templateLabel ?? null,
      templateOrder: input.templateOrder ?? 0,
      name: input.name,
      lifeStage: input.lifeStage ?? null,
      tags: input.tags ?? [],
      birthDate: input.birthDate ?? null,
      status: "active",
      // ⚠️ code 不給值＝null。見上方說明，不要「順手」補一個 allocCode()。
    }),
    db.insert(plans).values({
      clientId: templateId,
      year,
      label: `${year} 示範版`,
      status: "draft",
      basedOnDate: todayISO(),
      data,
      healthGrade: snap.healthGrade,
      netWorth: snap.netWorth,
    }),
  ]);
  return templateId;
}

/** 編輯範本的中繼資料（內容本身由後台走 plans 的既有編輯路徑）。 */
export async function updateTemplate(id: string, patch: Partial<TemplateInput>): Promise<void> {
  await assertAdmin();
  await db
    .update(clients)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.templateLabel !== undefined ? { templateLabel: patch.templateLabel } : {}),
      ...(patch.lifeStage !== undefined ? { lifeStage: patch.lifeStage } : {}),
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.birthDate !== undefined ? { birthDate: patch.birthDate } : {}),
      ...(patch.templateOrder !== undefined ? { templateOrder: patch.templateOrder } : {}),
      updatedAt: new Date(),
    })
    // ⚠️ WHERE 帶著 is_template：拿一般客戶的 id 打進來時什麼都改不到，
    // 而不是靜靜地改掉某位教練的客戶。
    .where(templateRow(id));
}

/**
 * 下架一份範本。
 *
 * ⚠️ 這是真的刪除，plans 會跟著 CASCADE。這在範本上是對的（它沒有歷史價值，
 *    也沒有任何真實客戶掛在上面），但正因為如此，WHERE 少一個 is_template
 *    就會變成「後台可以刪掉任何一位真實客戶連同他所有規劃」。
 *    已經複製出去的客戶不受影響——那些是各自獨立的列，跟這一列沒有任何外鍵關係。
 */
export async function deleteTemplate(id: string): Promise<void> {
  await assertAdmin();
  await db.delete(clients).where(templateRow(id));
}

/**
 * 寫回一份範本的規劃內容（後台專用）。
 *
 * ⚠️⚠️ 為什麼非得另開這一支：`lib/plans.ts` 的 `updatePlanData()` 走 `ownedClient()`，
 *    而範本的 `coach_id` 是 null——**連管理員都寫不進去**。少了這支，後台就只能
 *    「建立一份空白範本、排序它、下架它」，永遠沒有路徑把內容填進去，功能是半殘的。
 *
 * ⚠️ 邊界與其他管理端函式一致，缺一不可：
 *    1. `assertAdmin()`：授權只由它負責，不靠呼叫端。
 *    2. WHERE 用 `is_template = true` 當**形狀護欄**——拿一般客戶的 planId 打進來時
 *       什麼都改不到，而不是靜靜覆寫掉某位教練客戶的整份規劃。這一句是這支函式
 *       最重要的一行。
 *    3. 形狀檢查：`data` 不是物件就直接擋，不然 Drizzle 會略過該欄位而
 *       `healthGrade`/`netWorth` 照樣被寫成新值，變成「快照更新了、內容沒更新」。
 *
 * ⚠️ 刻意**不寫 plan_revisions**：範本不是客戶的規劃，沒有「歷史版本」的語意，
 *    而且後台反覆調整內容會把版本表灌爆（那正是 plan_revisions 保留策略在防的事）。
 */
export async function updateTemplatePlan(planId: string, data: unknown): Promise<void> {
  await assertAdmin();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("bad-plan-data");
  }
  const snap = planSnapshot(data);
  await db
    .update(plans)
    .set({ data, healthGrade: snap.healthGrade, netWorth: snap.netWorth, updatedAt: new Date() })
    .where(
      and(
        eq(plans.id, planId),
        // 只有掛在範本底下的 plan 才寫得到。
        inArray(
          plans.clientId,
          db.select({ id: clients.id }).from(clients).where(templateClient()),
        ),
      ),
    );
}

/**
 * 替一份範本新增一個年度版本（後台專用）。範本剛建立時是空的，要有這支才填得進東西。
 */
export async function addTemplatePlan(
  templateId: string,
  year: number,
  label?: string | null,
): Promise<string> {
  await assertAdmin();
  const [t] = await db.select({ name: clients.name }).from(clients).where(templateRow(templateId)).limit(1);
  if (!t) throw new Error("template-not-found");
  const id = randomUUID();
  const data = newCaseData(t.name);
  const snap = planSnapshot(data);
  await db.insert(plans).values({
    id, clientId: templateId, year, track: "coach",
    label: label ?? `${year}版`, data,
    healthGrade: snap.healthGrade, netWorth: snap.netWorth,
  });
  return id;
}

/**
 * 重排範本順序：ids 的先後就是新的 templateOrder（0,1,2…）。
 * 一次 batch 送完，不然中途斷掉會留下兩份同號、清單順序每次查都不一樣。
 */
export async function reorderTemplates(ids: string[]): Promise<void> {
  await assertAdmin();
  if (ids.length === 0) return;
  const stmts = ids.map((id, i) =>
    db.update(clients).set({ templateOrder: i, updatedAt: new Date() }).where(templateRow(id)),
  );
  await db.batch([stmts[0], ...stmts.slice(1)]);
}

// ── 複製端（教練端）────────────────────────────────────────────────

/**
 * 「額度滿了」是使用者做得完的事（去封存幾位舊客戶、或請後台調上限），
 * 所以它是回傳值不是例外——往上丟只會變成 Next 的 digest 亂碼。
 * 同 lib/plans.ts 的 CreatePlanOutcome。
 */
export type CopyTemplateOutcome = { ok: true; clientId: string } | { ok: false; error: string };

/** jsonb 出來就是純資料；深拷貝是為了不讓新客戶跟範本共用同一個物件參考。 */
function deepCopy(v: unknown): unknown {
  return v === null || typeof v !== "object" ? v : structuredClone(v);
}

/**
 * 把一份範本複製成「我的」一位正常客戶。
 *
 * ⚠️ 三件事的順序不能換：
 *   1. 先確認範本存在（templateClient()）。
 *   2. 再過 requireClientQuota()。
 *   3. **最後**才 allocCode()。
 * 發號會寫 code_counters，而且不在 batch 裡（放進去等於在交易外先消耗一個號）。
 * 把它排在額度檢查之前的話，每一次「額度滿了、複製失敗」都會白白吃掉一個客戶編號，
 * 客戶編號從此跳號，而且完全查不出來那幾號去了哪裡——這就是「不留半成品」的實際內容。
 * 客戶列與 plans 則同生共死（同一個 db.batch）：只有客戶沒有規劃的半成品救不回來，
 * 見 lib/clients.ts 的 createClient。
 *
 * 快照（healthGrade / netWorth）**照抄不重算**：
 * 複製出來的內容跟範本一模一樣，教練預期看到的數字也一樣。重算的話，只要引擎版本
 * 在範本存檔之後動過，複製出來那份的等級／淨值就會跟他剛剛翻給客戶看的畫面不同，
 * 而他無從判斷是自己按錯還是系統壞了。真正需要新數字的時候，教練一存檔就會重算。
 */
export async function copyTemplateToCoach(coachId: string, templateId: string): Promise<CopyTemplateOutcome> {
  // 身分：額度是「這位教練的」，所以必須拿到他的職級與上限覆寫值。
  // 順帶擋掉「替別人複製」——這支只服務登入中的本人。
  const me = await ensureCoach();
  if (!me || me.status !== "active" || me.id !== coachId) {
    return { ok: false, error: "沒有權限複製這份範本。" };
  }

  const [template] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, templateId), templateClient()))
    .limit(1);
  if (!template) return { ok: false, error: "找不到這份示範範本，可能已經下架了。" };

  try {
    await requireClientQuota(me);
  } catch (e) {
    // 額度滿：回傳值，而且此時**一個字都還沒寫進資料庫**（號也還沒發）。
    if (e instanceof QuotaFullError) return { ok: false, error: e.message };
    throw e;
  }

  const srcPlans: PlanRow[] = await db.select().from(plans).where(eq(plans.clientId, templateId));

  const clientId = randomUUID();
  // 這一位是真正的客戶：發真實客戶編號（規則見 lib/codes.ts）。
  const code = await allocCode("client");
  // 名稱與標籤都要讓教練一眼看出來源。三個月後他回頭看清單時，
  // 「王大明」與「雙薪育兒家庭（範本複製）」是完全不同的兩件事。
  const name = `${template.name}（範本複製）`;

  const insertClient = db.insert(clients).values({
    id: clientId,
    coachId,
    clientUserId: null,
    name,
    // ⚠️ 落地即為一般客戶：is_template 必須是 false，範本專屬欄位一律不帶過來。
    isTemplate: false,
    templateLabel: null,
    templateOrder: 0,
    lifeStage: template.lifeStage,
    birthDate: template.birthDate,
    // 聯絡方式不複製：範本上的（若有）不是這位教練的客戶的。
    contact: {},
    source: "示範範本",
    tags: [...(template.tags ?? []), TEMPLATE_COPY_TAG],
    status: "active",
    code,
  });

  if (srcPlans.length === 0) {
    await db.batch([insertClient]);
    return { ok: true, clientId };
  }

  const planValues = srcPlans.map((p) => ({
    clientId,
    year: p.year,
    // track 維持原樣：範本若含一份客戶軌（人生護照）示範，複製過去也該還是那一軌，
    // 換成 coach 軌會撞 plans_client_id_year_track_uidx。
    track: p.track,
    label: p.label,
    status: "draft",
    basedOnDate: p.basedOnDate,
    data: deepCopy(p.data),
    healthGrade: p.healthGrade,
    netWorth: p.netWorth,
  }));

  await db.batch([insertClient, db.insert(plans).values(planValues)]);
  return { ok: true, clientId };
}
