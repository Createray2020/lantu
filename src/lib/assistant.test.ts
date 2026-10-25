import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { newCase } from "./engine";
import {
  resolveOps, buildGrounding, systemPrompt, askAssistant, assistantConfigured, monthlyCap, bizGateLevel, rowLabel,
  type RawOp,
} from "./assistant";
import { arrayDef } from "./assistantFields";
import type { FinCatPayload } from "./financeCategories";

/**
 * AI 助理的後端純函式。模型本身不在測試裡（mock 一個 client），釘的是：
 *   - 模型回的路徑 → 預覽卡（填入／覆蓋、年化、週期、細類、保護列、唯讀）全部要對；
 *   - 無金鑰優雅停用；
 *   - grounding 不倒原始 JSON、口徑說明在裡面；
 *   - 企業主合規閘紅燈／未判定時系統提示有限制句。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type C = any;

const CATS: FinCatPayload = {
  income: [{ label: "薪資", parent: "工作" }, { label: "租金收入", parent: "理財" }],
  expense: [{ label: "餐食", parent: "生活" }, { label: "汽車貸款", parent: "貸款" }, { label: "孝親費", parent: "孝親" }],
  saving: [],
  asset: [{ label: "活期存款", parent: "自用資產", liq: "流動" }, { label: "股票", parent: "可投資資產", risk: true, liq: "流動" }],
  liability: [{ label: "汽車貸款", parent: "車貸" }, { label: "信用貸款", parent: "信貸", consumer: true }],
};

function mkCase(): C {
  const c = newCase() as C;
  c.profile.name = "王小明"; c.profile.age = 35; c.profile.retireAge = 65; c.profile.monthlySalary = 60000;
  c.members = [{ name: "王小明", role: "本人", gender: "男", age: 35, expRatio: 60, indepAge: 26 }, { name: "林小美", role: "配偶", gender: "女", age: 33, expRatio: 40, indepAge: 26 }];
  c.incomes = [
    { name: "薪資", owner: "王小明", type: "工作", subType: "薪資", period: "月", amount: 720000, salaryAuto: true, start: 35, end: 65 },
    { name: "房租收入", owner: "王小明", type: "理財", subType: "租金收入", period: "月", amount: 240000, start: 35, end: 85 },
  ];
  c.expenses = [{ name: "餐食", cat: "生活", subCat: "餐食", period: "月", amount: 180000, infl: true, start: 35, end: 85, cut: 0 }];
  c.liabilities = [{ name: "車貸", owner: "王小明", mainCat: "車貸", balance: 500000, rate: 3, repay: "本息攤還", pay: 0, months: 0, grace: 0, startAge: 35 }];
  c.assets = [{ name: "活存", owner: "王小明", mainCat: "自用資產", type: "活期存款", cls: "流動", value: 300000, ret: 0, income: "", currency: "台幣", fxRate: 1 }];
  c.policies = [];
  c.goals = [];
  return c;
}

describe("resolveOps：模型路徑 → 預覽卡", () => {
  it("set 既有列：空白格＝填入、有值＝覆蓋，原值新值都看得到", () => {
    const c = mkCase();
    const raw: RawOp[] = [
      { op: "set", arr: "liabilities", index: 0, field: "pay", value: 18000 },      // 原 0 → 填入
      { op: "set", arr: "liabilities", index: 0, field: "months", value: "36" },    // 原 0 → 填入
      { op: "set", arr: "liabilities", index: 0, field: "balance", value: "550,000" }, // 原 500000 → 覆蓋
    ];
    const { ops, rejected } = resolveOps(c, raw, { canWrite: true, cats: CATS });
    expect(rejected).toEqual([]);
    expect(ops).toHaveLength(1); // 同一列併成一張卡
    const card = ops[0];
    expect(card.op).toBe("set");
    expect(card.arrLabel).toBe("負債");
    expect(card.tab).toBe("finance");
    const by = Object.fromEntries(card.fields.map((f) => [f.field, f]));
    expect(by.pay.mode).toBe("fill"); expect(by.pay.value).toBe(18000); expect(by.pay.type).toBe("num");
    expect(by.months.mode).toBe("fill"); expect(by.months.value).toBe(36);
    expect(by.balance.mode).toBe("overwrite"); expect(by.balance.old).toBe("500,000"); expect(by.balance.shown).toBe("550,000");
  });

  it("金額依 period 年化：每月 15,000 的支出存 180,000；改週期時先寫 period 再寫金額", () => {
    const c = mkCase();
    c.expenses.push({ name: "停車費", cat: "生活", period: "年", amount: 0, start: 35, end: 85 });
    const { ops, rejected } = resolveOps(c, [{ op: "set", arr: "expenses", index: 1, field: "amount", value: 15000, period: "月" }], { canWrite: true, cats: CATS });
    expect(rejected).toEqual([]);
    const f = ops[0].fields;
    expect(f.map((x) => x.field)).toEqual(["period", "amount"]);
    expect(f[1].value).toBe(180000);
    expect(f[1].shown).toBe("15,000/月");
  });

  it("add 新列：金額年化、細類走 setCat、列名可辨識", () => {
    const c = mkCase();
    const { ops, rejected } = resolveOps(c, [
      { op: "add", arr: "expenses", row: { name: "孝親費", subCat: "孝親費", period: "月", amount: 10000 } },
    ], { canWrite: true, cats: CATS });
    expect(rejected).toEqual([]);
    expect(ops[0].op).toBe("add");
    const by = Object.fromEntries(ops[0].fields.map((f) => [f.field, f]));
    expect(by.amount.value).toBe(120000);
    expect(by.subCat.via).toBe("cat");
    expect(by.name.mode).toBe("fill");
    expect(ops[0].rowLabel).toContain("孝親費");
    expect(ops[0].rowLabel).toContain("10,000/月");
  });

  it("自動列（salaryAuto）不能改；不存在的欄位、不存在的列、不合法選項都退回並說明", () => {
    const c = mkCase();
    const { ops, rejected } = resolveOps(c, [
      { op: "set", arr: "incomes", index: 0, field: "amount", value: 100 },
      { op: "set", arr: "incomes", index: 1, field: "nope", value: 1 },
      { op: "set", arr: "incomes", index: 9, field: "amount", value: 1 },
      { op: "set", arr: "liabilities", index: 0, field: "repay", value: "隨便還" },
      { op: "set", arr: "assets", index: 0, field: "type", value: "比特幣" },
      { op: "add", arr: "profile", row: { name: "x" } },
      { op: "set", arr: "companies", index: 0, field: "name", value: "x" },
    ], { canWrite: true, cats: CATS });
    expect(ops).toEqual([]);
    expect(rejected).toHaveLength(7);
    expect(rejected[0].reason).toContain("自動列");
    expect(rejected[1].reason).toContain("nope");
    expect(rejected[2].reason).toContain("找不到第 9 列");
    expect(rejected[3].reason).toContain("沒有「隨便還」");
    expect(rejected[4].reason).toContain("細類");
    expect(rejected[5].reason).toContain("不能新增列");
    expect(rejected[6].reason).toContain("不是助理能填的資料面");
  });

  it("profile 是單一物件：index 為 null 也能改；日期會正規化", () => {
    const c = mkCase();
    const { ops, rejected } = resolveOps(c, [
      { op: "set", arr: "profile", index: null, field: "retireAge", value: "60" },
      { op: "set", arr: "profile", field: "birth", value: "1991/3/5" },
    ], { canWrite: true, cats: CATS });
    expect(rejected).toEqual([]);
    expect(ops).toHaveLength(1);
    const by = Object.fromEntries(ops[0].fields.map((f) => [f.field, f]));
    expect(by.retireAge.mode).toBe("overwrite"); expect(by.retireAge.old).toBe("65");
    expect(by.birth.value).toBe("1991-03-05"); expect(by.birth.mode).toBe("fill");
  });

  it("保單險種走 setPolicySub、成員關係走 setMemberRole、布林接受是／否", () => {
    const c = mkCase();
    c.policies.push({ pid: "p1", insured: "王小明", name: "", subtype: "終身壽險", bigCat: "人身", premium: 0, payMode: "年繳" });
    const { ops, rejected } = resolveOps(c, [
      { op: "set", arr: "policies", index: 0, field: "subtype", value: "實支實付" },
      { op: "set", arr: "members", index: 1, field: "role", value: "配偶" },
      { op: "set", arr: "expenses", index: 0, field: "infl", value: "否" },
    ], { canWrite: true, cats: CATS });
    expect(rejected).toEqual([]);
    expect(ops[0].fields[0].via).toBe("polsub");
    expect(ops[1].fields[0].via).toBe("memrole");
    expect(ops[2].fields[0].value).toBe(false); expect(ops[2].fields[0].type).toBe("bool"); expect(ops[2].fields[0].mode).toBe("overwrite");
  });

  it("唯讀（協作教練）：ops 全退回並說明，不是靜默吞掉", () => {
    const { ops, rejected } = resolveOps(mkCase(), [{ op: "set", arr: "profile", field: "age", value: 1 }], { canWrite: false });
    expect(ops).toEqual([]);
    expect(rejected[0].reason).toContain("唯讀");
  });

  it("不是陣列／空陣列 → 什麼都不做、不丟例外", () => {
    expect(resolveOps(mkCase(), null as unknown as RawOp[], { canWrite: true })).toEqual({ ops: [], rejected: [] });
    expect(resolveOps(null, [], { canWrite: true })).toEqual({ ops: [], rejected: [] });
  });
});

describe("grounding 與系統提示", () => {
  it("摘要含姓名、引擎數字、列清單（帶 index）、細類選項、口徑說明；不倒 JSON", () => {
    const g = buildGrounding(mkCase(), CATS);
    expect(g).toContain("王小明");
    expect(g).toMatch(/年收入 [\d,]+/);
    expect(g).toContain("incomes[1] 房租收入");
    expect(g).toContain("（自動列，不可改）");
    expect(g).toContain("liabilities[0] 車貸");
    expect(g).toContain("expense: 生活［餐食］");
    expect(g).not.toContain('"profile"');
    expect(g).not.toContain("salaryAuto");
    const sys = systemPrompt({ canWrite: true, grounding: g });
    expect(sys).toContain("不等於『缺口』");
    expect(sys).toContain("整裝期／啟程期");
    expect(sys).toContain("## liabilities");
    expect(sys).toContain("一萬八＝18000");
  });

  it("唯讀時系統提示叫模型不要給 ops", () => {
    const sys = systemPrompt({ canWrite: false, grounding: "x" });
    expect(sys).toContain("唯讀");
    expect(sys).not.toContain("op:'add'");
  });

  it("企業主合規閘：紅燈／未判定時 grounding 帶限制句；沒有公司就不提", () => {
    const c = mkCase();
    expect(bizGateLevel(c)).toBeNull();
    expect(buildGrounding(c, null)).not.toContain("企業主");
    c.companies = [{ cid: "c1", name: "小明有限公司" }];
    expect(bizGateLevel(c)).toBe("na");
    expect(buildGrounding(c, null)).toContain("不得回答資產配置");
    const ans: Record<string, string> = {};
    for (let i = 0; i < 10; i++) ans[String(i)] = "是";
    c.bizGate = { ans };
    expect(bizGateLevel(c)).toBe("green");
    ans["3"] = "否";
    expect(bizGateLevel(c)).toBe("red");
  });

  it("列清單超過上限會截斷並說還有幾列；空資料也不會炸", () => {
    const c = mkCase();
    c.goals = Array.from({ length: 70 }, (_, i) => ({ name: `目標${i}`, type: "其他", present: 1000, start: 40 }));
    const g = buildGrounding(c, null);
    expect(g).toContain("…還有 10 列");
    expect(() => buildGrounding({}, null)).not.toThrow();
    expect(() => buildGrounding(null, null)).not.toThrow();
  });

  it("rowLabel 把金額依週期換回每月顯示", () => {
    const def = arrayDef("incomes")!;
    expect(rowLabel(def, { name: "房租", owner: "王小明", subType: "租金收入", period: "月", amount: 240000 })).toBe("房租・王小明・租金收入・金額 20,000/月");
  });
});

describe("askAssistant：金鑰與模型", () => {
  const env = { ...process.env };
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; delete process.env.AI_MONTHLY_TOKEN_CAP_PER_COACH; });
  afterEach(() => { process.env = { ...env }; });

  it("沒金鑰 → not_configured，不呼叫模型、不丟例外", async () => {
    expect(assistantConfigured()).toBe(false);
    const r = await askAssistant({ data: mkCase(), messages: [{ role: "user", content: "hi" }], canWrite: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_configured");
  });

  it("月上限：沒設或 0 ＝不限", () => {
    expect(monthlyCap()).toBe(0);
    process.env.AI_MONTHLY_TOKEN_CAP_PER_COACH = "300000";
    expect(monthlyCap()).toBe(300000);
    process.env.AI_MONTHLY_TOKEN_CAP_PER_COACH = "abc";
    expect(monthlyCap()).toBe(0);
  });

  it("有金鑰：把模型回的 tool_use 解成 answer＋預覽卡＋用量；unsupported 進 rejected", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const create = vi.fn(async (_req: unknown) => ({
      content: [{ type: "tool_use", id: "t1", name: "reply", input: {
        answer: "幫你把車貸月付填好了。",
        ops: [{ op: "set", arr: "liabilities", index: 0, field: "pay", value: 18000 }],
        unsupported: ["公司股權"],
      } }],
      usage: { input_tokens: 1234, output_tokens: 56 },
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = { messages: { create } } as any;
    const r = await askAssistant({ data: mkCase(), messages: [{ role: "user", content: "車貸每月一萬八" }], canWrite: true, cats: CATS }, client);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.answer).toBe("幫你把車貸月付填好了。");
    expect(r.ops).toHaveLength(1);
    expect(r.rejected[0].reason).toContain("公司股權");
    expect(r.usage).toEqual({ input: 1234, output: 56, model: expect.any(String) });
    const call = create.mock.calls[0][0] as unknown as { system: string; tool_choice: { name: string }; messages: unknown[] };
    expect(call.tool_choice).toEqual({ type: "auto" });
    expect((call as unknown as { max_tokens: number }).max_tokens).toBeGreaterThanOrEqual(3000);
    expect(call.system).toContain("王小明");
  });

  it("模型沒呼叫工具、只回文字 → 文字當回答、ops 空", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = { messages: { create: async () => ({ content: [{ type: "text", text: "退休缺口約 120 萬。" }], usage: { input_tokens: 10, output_tokens: 5 } }) } } as any;
    const r = await askAssistant({ data: mkCase(), messages: [{ role: "user", content: "x" }], canWrite: true }, client);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.answer).toBe("退休缺口約 120 萬。"); expect(r.ops).toEqual([]); }
  });

  it("型號不認得 thinking 參數（400）→ 自動退回不帶 thinking 再打一次", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    let calls = 0;
    const create = async (req: { thinking?: unknown }) => {
      calls++;
      if (req.thinking) { const e = new Error("thinking: unsupported") as Error & { status: number }; e.status = 400; throw e; }
      return { content: [{ type: "tool_use", id: "t", name: "reply", input: { answer: "ok" } }], usage: { input_tokens: 1, output_tokens: 1 } };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await askAssistant({ data: mkCase(), messages: [{ role: "user", content: "x" }], canWrite: true }, { messages: { create } } as any);
    expect(calls).toBe(2);
    expect(r.ok && r.answer).toBe("ok");
  });

  it("模型噴錯 → model_error（不把例外丟到 action）", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = { messages: { create: async () => { throw new Error("boom"); } } } as any;
    const r = await askAssistant({ data: mkCase(), messages: [{ role: "user", content: "x" }], canWrite: true }, client);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("model_error");
    spy.mockRestore();
  });

  it("最後一則不是 user（或沒有訊息）→ bad_request", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = { messages: { create: async () => ({ content: [], usage: { input_tokens: 0, output_tokens: 0 } }) } } as any;
    const r = await askAssistant({ data: mkCase(), messages: [{ role: "assistant", content: "x" }], canWrite: true }, client);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("bad_request");
  });
});
