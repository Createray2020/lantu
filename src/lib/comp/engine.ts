// 業務制度：分潤引擎（純函式，不碰 DB、不碰 React）。
//
// 對應辦法第三、五、六、七條。唯一輸入是「一個版本的制度參數 CompParams」＋「一筆案件情境」，
// 所以同一支引擎同時服務後台試算器與案件實際分潤，兩邊不可能算出不同答案。
//
// 差％的基本形：
//   執案者（或推廣者）先拿自己職級的分潤率；輔導鏈由下往上，每一層拿
//   「自身分潤率 − 下層已計分潤率」，算到頂或算完為止；剩下的歸公司。
//   推廣端與執案端各算一次、互不影響（第六條第一項）。
//
// 「未設定」的處理：分潤率或區塊比例留空時，該層以 0 計並在 warnings 說明，
// 而不是丟例外——後台本來就允許把制度留白，畫面要能顯示「這裡還沒設定」。

import type { CompParams, CompSettings, ModuleRow, RankRow } from "./types";
import { flag } from "./types";

export type ChainNode = {
  /** 顧問 id；試算器用假 id 也可以 */
  id: string;
  name?: string;
  rankCode: string;
};

export type SplitInput = {
  fee: number;
  /** 公司派案（第六條第五項）：推廣端全數歸公司 */
  isCompanyLead?: boolean;
  /** 推廣者；公司派案時可為 null */
  promoter?: ChainNode | null;
  executor: ChainNode;
  /** 推廣者的輔導鏈，由下而上、不含本人（代管情境請直接傳「代管後的有效鏈」） */
  promoterChain?: ChainNode[];
  /** 執案者的輔導鏈，由下而上、不含本人 */
  executorChain?: ChainNode[];
};

export type LineKind =
  | "advisor"
  | "company_ops"
  | "company_lead"
  | "company_remainder";

export type PayoutLine = {
  /** 公司列為 null */
  payeeId: string | null;
  name: string;
  rankCode: string | null;
  kind: LineKind;
  /** 這個人在本案的身分描述（推廣＋執案／直屬主管・平階…） */
  role: string;
  promoPct: number;
  execPct: number;
  bonusPct: number;
  totalPct: number;
  amount: number;
  /** 逐項計算說明，供「查明細」展開 */
  trace: string[];
};

export type SplitResult = {
  lines: PayoutLine[];
  totalPct: number;
  totalAmount: number;
  /** 加總是否為 100%（容許浮點誤差） */
  balanced: boolean;
  warnings: string[];
};

type Side = "promo" | "exec";

type SideEntry = {
  node: ChainNode;
  pct: number;
  kind: "holder" | "diff" | "bonus";
  role: string;
  trace: string;
};

type SideResult = {
  entries: SideEntry[];
  remainder: number;
  warnings: string[];
};

const EPS = 1e-6;

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function rankMap(ranks: RankRow[]): Map<string, RankRow> {
  return new Map(ranks.map((r) => [r.code, r]));
}

function pctOf(r: RankRow | undefined, side: Side): number | null {
  if (!r) return null;
  return num(side === "promo" ? r.promoPct : r.execPct);
}

function sideMaxOf(s: CompSettings, side: Side): number | null {
  return num(side === "promo" ? s.splitPromoPct : s.splitExecPct);
}

function label(n: ChainNode): string {
  return n.name || n.rankCode || n.id;
}

/** 單邊（推廣端或執案端）的逐層分潤。 */
function computeSide(
  side: Side,
  holder: ChainNode,
  chain: ChainNode[],
  params: CompParams,
): SideResult {
  const s = params.settings;
  const ranks = rankMap(params.ranks);
  const warnings: string[] = [];
  const sideName = side === "promo" ? "推廣端" : "執案端";

  const max = sideMaxOf(s, side);
  if (max === null) warnings.push(`${sideName}比例未設定，以 0 計`);
  const sideMax = max ?? 0;

  // 這一邊的預算就是 sideMax，任何人都不能超支。
  // 模塊可以把區塊比例調得比職級表還低（例如講座模塊推廣端只有 10%，但 C1 的分潤率是 15%），
  // 沒有這個上限鉗制的話總和會超過 100%——制度設定得出來的東西，引擎就得算得出來。
  const clamp = (v: number) => Math.min(v, sideMax);

  const holderRaw = pctOf(ranks.get(holder.rankCode), side);
  if (holderRaw === null) {
    warnings.push(`職級 ${holder.rankCode} 的${sideName}分潤率未設定，以 0 計`);
  } else if (holderRaw > sideMax + EPS) {
    warnings.push(`職級 ${holder.rankCode} 的${sideName}分潤率 ${holderRaw}% 高於${sideName}上限 ${sideMax}%，以上限計`);
  }
  const holderPct = clamp(holderRaw ?? 0);
  let covered = holderPct;

  const entries: SideEntry[] = [
    {
      node: holder,
      pct: covered,
      kind: "holder",
      role: side === "promo" ? "推廣者" : "執案者",
      trace: `${sideName} ${covered}%（職級 ${holder.rankCode} 分潤率・§5）`,
    },
  ];

  // 追溯層數上限：未設定＝追到頂。
  const maxLevels = num(s.chainMaxLevels);
  const walk = maxLevels === null ? chain : chain.slice(0, Math.max(0, maxLevels));

  if (flag(s, "ruleChainDiff")) {
    for (let i = 0; i < walk.length; i++) {
      const u = walk[i];
      const p = pctOf(ranks.get(u.rankCode), side);
      if (p === null) {
        warnings.push(`職級 ${u.rankCode} 的${sideName}分潤率未設定，該層以 0 計`);
      }
      const up = clamp(p ?? 0);
      if (up > covered + EPS) {
        const diff = up - covered;
        entries.push({
          node: u,
          pct: diff,
          kind: "diff",
          role: i === 0 ? "直屬主管" : "輔導鏈上層",
          trace: `${sideName} ${up}% − 下層已計 ${covered}% ＝ ${round(diff)}%（§6-2）`,
        });
        covered = up;
      } else if (flag(s, "ruleInvertedSkip")) {
        // 倒掛或平階：本層不計差％，由更上層依差額續算（§6-3）。
        entries.push({
          node: u,
          pct: 0,
          kind: "diff",
          role: u.rankCode === holder.rankCode ? "直屬主管・平階" : "輔導鏈上層・倒掛",
          trace: `${sideName} 本層分潤率 ${up}% ≤ 下層已計 ${covered}%，不計差％（§6-3）`,
        });
      } else {
        // 關閉「倒掛續算」時，鏈在這一層中斷，其餘差額歸公司。
        warnings.push(`${sideName}於 ${u.rankCode} 中斷（未啟用倒掛續算），其餘差額歸公司`);
        break;
      }
    }
  }

  // 平階輔導獎金（§7）：直屬主管與執案者同職級時，
  // 自「其上一層實際取得差％者」的差％中分得 peerBonusPct%。
  const direct = chain[0];
  const bonusPct = num(s.peerBonusPct);
  if (direct && direct.rankCode === holder.rankCode && bonusPct !== null && bonusPct > 0) {
    const donor = entries.find((e) => e.kind === "diff" && e.pct > EPS);
    if (!donor) {
      if (!flag(s, "peerBonusSkipIfNoDiff")) {
        warnings.push(`${sideName}平階但上層無差％可分，未發放平階輔導獎金`);
      }
    } else {
      const give = donor.pct * (bonusPct / 100);
      donor.pct -= give;
      donor.trace += `；讓出 ${bonusPct}% 予平階直屬主管（§7-1）`;
      entries.push({
        node: direct,
        pct: give,
        kind: "bonus",
        role: "直屬主管・平階輔導獎金",
        trace: `${sideName} 平階輔導獎金＝上層差％ ${round(donor.pct + give)}% × ${bonusPct}% ＝ ${round(give)}%（§7-1）`,
      });
    }
  }

  const used = entries.reduce((a, e) => a + e.pct, 0);
  const remainder = Math.max(0, sideMax - used);
  return { entries, remainder, warnings };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * 計算一筆案件的完整分潤。
 * 回傳每個受分潤人一列（同一人若同時是推廣者與執案者只會有一列），加上公司列。
 */
export function splitCase(input: SplitInput, params: CompParams): SplitResult {
  const s = params.settings;
  const warnings: string[] = [];
  const fee = num(input.fee) ?? 0;

  const promoMax = sideMaxOf(s, "promo") ?? 0;
  const execMax = sideMaxOf(s, "exec") ?? 0;

  type Agg = {
    node: ChainNode;
    promoPct: number;
    execPct: number;
    bonusPct: number;
    roles: string[];
    trace: string[];
    order: number;
  };
  const agg = new Map<string, Agg>();
  let order = 0;
  const put = (node: ChainNode, side: Side, e: SideEntry) => {
    let a = agg.get(node.id);
    if (!a) {
      a = { node, promoPct: 0, execPct: 0, bonusPct: 0, roles: [], trace: [], order: order++ };
      agg.set(node.id, a);
    }
    if (e.kind === "bonus") a.bonusPct += e.pct;
    else if (side === "promo") a.promoPct += e.pct;
    else a.execPct += e.pct;
    if (!a.roles.includes(e.role)) a.roles.push(e.role);
    a.trace.push(e.trace);
  };

  let companyRemainder = 0;
  let companyLead = 0;

  // ── 推廣端 ──
  const companyLeadTakesPromo =
    !!input.isCompanyLead && flag(s, "ruleCompanyLeadTakesPromo");
  if (companyLeadTakesPromo) {
    companyLead = promoMax;
  } else if (input.promoter) {
    const r = computeSide("promo", input.promoter, input.promoterChain ?? [], params);
    r.entries.forEach((e) => put(e.node, "promo", e));
    companyRemainder += r.remainder;
    warnings.push(...r.warnings);
  } else {
    // 沒有推廣者也不是派案：推廣端無人可分，全額歸公司。
    companyRemainder += promoMax;
    warnings.push("未指定推廣者，推廣端全額歸公司");
  }

  // ── 執案端 ──
  const ex = computeSide("exec", input.executor, input.executorChain ?? [], params);
  ex.entries.forEach((e) => put(e.node, "exec", e));
  companyRemainder += ex.remainder;
  warnings.push(...ex.warnings);

  // ── 公司營運（§3）──
  const opsPct = Math.max(0, 100 - promoMax - execMax);

  const lines: PayoutLine[] = [];
  for (const a of [...agg.values()].sort((x, y) => x.order - y.order)) {
    const total = a.promoPct + a.execPct + a.bonusPct;
    lines.push({
      payeeId: a.node.id,
      name: label(a.node),
      rankCode: a.node.rankCode,
      kind: "advisor",
      role: a.roles.join("＋"),
      promoPct: round(a.promoPct),
      execPct: round(a.execPct),
      bonusPct: round(a.bonusPct),
      totalPct: round(total),
      amount: 0,
      trace: a.trace,
    });
  }
  if (companyLead > EPS) {
    lines.push({
      payeeId: null, name: "公司（派案推廣端）", rankCode: null, kind: "company_lead",
      role: "公司派案", promoPct: round(companyLead), execPct: 0, bonusPct: 0,
      totalPct: round(companyLead), amount: 0,
      trace: [`公司派案，推廣端 ${round(companyLead)}% 全數歸公司（§6-5）`],
    });
  }
  if (companyRemainder > EPS) {
    lines.push({
      payeeId: null, name: "公司（未分配差額）", rankCode: null, kind: "company_remainder",
      role: "未分配差額", promoPct: 0, execPct: 0, bonusPct: 0,
      totalPct: round(companyRemainder), amount: 0,
      trace: [`輔導鏈未用罄的差額 ${round(companyRemainder)}% 歸公司（§6-4）`],
    });
  }
  if (opsPct > EPS) {
    lines.push({
      payeeId: null, name: "公司（營運保留）", rankCode: null, kind: "company_ops",
      role: "營運保留", promoPct: 0, execPct: 0, bonusPct: 0,
      totalPct: round(opsPct), amount: 0,
      trace: [`營業稅 ${num(s.taxPct) ?? "—"}%＋行政成本 ${num(s.adminPct) ?? "—"}%（§3）`],
    });
  }

  // 金額：逐列四捨五入，餘數塞回最後一列公司列，確保加總等於顧問費。
  let acc = 0;
  lines.forEach((l) => {
    l.amount = Math.round((fee * l.totalPct) / 100);
    acc += l.amount;
  });
  const expected = Math.round((fee * lines.reduce((a, l) => a + l.totalPct, 0)) / 100);
  const residual = expected - acc;
  if (residual !== 0) {
    const last = [...lines].reverse().find((l) => l.payeeId === null) ?? lines[lines.length - 1];
    if (last) last.amount += residual;
  }

  const totalPct = round(lines.reduce((a, l) => a + l.totalPct, 0));
  return {
    lines,
    totalPct,
    totalAmount: lines.reduce((a, l) => a + l.amount, 0),
    balanced: Math.abs(totalPct - 100) < 1e-4,
    warnings: [...new Set(warnings)],
  };
}

/** 團隊輔導業績歸屬（§8、§13）：這一案會計入哪些人的團隊輔導業績。 */
export function teamCreditIds(input: SplitInput, params: CompParams): string[] {
  const s = params.settings;
  if (!flag(s, "ruleChainDiff") && !s.teamCreditEachLevel) return [];
  const chain = s.teamCreditExecChain === false
    ? (input.promoterChain ?? input.executorChain ?? [])
    : (input.executorChain ?? []);
  // 逐層計入（§13-1）：鏈上每一層主管各自計入；關閉時只計直屬主管。
  return s.teamCreditEachLevel === false
    ? chain.slice(0, 1).map((n) => n.id)
    : chain.map((n) => n.id);
}


// ─────────────────────────────────────────────────────────────────────────────
// 服務模塊
//
// 每種服務內容可以有自己的分潤結構。核心算術（上面的 splitCase）完全不變，
// 這裡只做兩件事：把模塊參數解析成「有效參數」再丟進去，以及提供 flat 這條旁路。
//
// 「留空＝沿用預設」在模塊層再延伸一次：
//   模塊沒填比例 → 用全域 settings；模塊沒有自訂職級表 → 用預設那組（moduleCode 為空）。
// 所以只想調「單點諮詢的執案端拉到 70%」時填那一格就好，其他照舊。
// ─────────────────────────────────────────────────────────────────────────────

export function findModule(params: CompParams, moduleCode?: string | null): ModuleRow | null {
  if (!moduleCode) return null;
  return (params.modules ?? []).find((m) => m.code === moduleCode && m.enabled !== false) ?? null;
}

/** 取某個模塊該用的職級表：有自訂就用自訂，否則用預設表。 */
export function ranksForModule(params: CompParams, moduleCode?: string | null): RankRow[] {
  const own = moduleCode
    ? params.ranks.filter((r) => (r.moduleCode ?? "") === moduleCode)
    : [];
  if (own.length) return own;
  return params.ranks.filter((r) => !(r.moduleCode ?? ""));
}

/** 把模塊設定疊到制度參數上，產出這一案真正要用的參數。 */
export function resolveModuleParams(params: CompParams, moduleCode?: string | null): CompParams {
  const m = findModule(params, moduleCode);
  const ranks = ranksForModule(params, moduleCode);
  if (!m) return { ...params, ranks };
  const settings: CompSettings = { ...params.settings };
  if (num(m.splitPromoPct) !== null) settings.splitPromoPct = m.splitPromoPct!;
  if (num(m.splitExecPct) !== null) settings.splitExecPct = m.splitExecPct!;
  return { ...params, settings, ranks };
}

/**
 * flat 模式：不走差％。執行者與推廣者各拿固定 %，其餘全歸公司。
 * 自推自執時兩者相加（同一人只會出現一列）。
 * 講座、課程這類「沒有輔導鏈概念」的服務走這條。
 */
function splitFlat(input: SplitInput, params: CompParams, m: ModuleRow): SplitResult {
  const fee = num(input.fee) ?? 0;
  const warnings: string[] = [];
  const execPct = num(m.flatExecPct);
  const promoPct = num(m.flatPromoPct);
  if (execPct === null) warnings.push(`模塊「${m.name}」的執行者比例未設定，以 0 計`);

  type Agg = { node: ChainNode; promo: number; exec: number; roles: string[]; trace: string[] };
  const agg = new Map<string, Agg>();
  const put = (node: ChainNode, side: Side, pct: number, role: string, trace: string) => {
    if (pct <= 0) return;
    let a = agg.get(node.id);
    if (!a) { a = { node, promo: 0, exec: 0, roles: [], trace: [] }; agg.set(node.id, a); }
    if (side === "promo") a.promo += pct; else a.exec += pct;
    if (!a.roles.includes(role)) a.roles.push(role);
    a.trace.push(trace);
  };

  // 固定比例也有 100% 的總預算：兩格加起來超過就照順序吃到滿為止，不會生出負數的公司列。
  const execTake = Math.min(Math.max(0, execPct ?? 0), 100);
  const promoTake = Math.min(Math.max(0, promoPct ?? 0), 100 - execTake);
  if ((execPct ?? 0) + (promoPct ?? 0) > 100 + EPS) {
    warnings.push(`模塊「${m.name}」的固定比例合計超過 100%，已依上限截斷`);
  }

  put(input.executor, "exec", execTake, "執案者",
    `固定分潤 ${execTake}%（模塊「${m.name}」不走差％）`);

  const companyLead = !!input.isCompanyLead && flag(params.settings, "ruleCompanyLeadTakesPromo");
  let companyPromo = 0;
  if (promoTake > 0) {
    if (companyLead || !input.promoter) {
      companyPromo = promoTake;
    } else {
      put(input.promoter, "promo", promoTake, "推廣者",
        `固定推廣分潤 ${promoTake}%（模塊「${m.name}」不走差％）`);
    }
  }

  const lines: PayoutLine[] = [];
  for (const a of agg.values()) {
    const total = a.promo + a.exec;
    lines.push({
      payeeId: a.node.id, name: label(a.node), rankCode: a.node.rankCode,
      kind: "advisor", role: a.roles.join("＋"),
      promoPct: round(a.promo), execPct: round(a.exec), bonusPct: 0,
      totalPct: round(total), amount: 0, trace: a.trace,
    });
  }
  const distributed = lines.reduce((x, l) => x + l.totalPct, 0);
  const rest = round(Math.max(0, 100 - distributed));
  if (rest > EPS) {
    lines.push({
      payeeId: null, name: "公司", rankCode: null,
      kind: companyPromo > 0 ? "company_lead" : "company_ops",
      role: companyPromo > 0 ? "公司（含派案推廣端）" : "公司保留",
      promoPct: round(companyPromo), execPct: 0, bonusPct: 0,
      totalPct: rest, amount: 0,
      trace: [`模塊「${m.name}」採固定分潤，未分配的 ${rest}% 歸公司`],
    });
  }

  let acc = 0;
  lines.forEach((l) => { l.amount = Math.round((fee * l.totalPct) / 100); acc += l.amount; });
  const residual = Math.round((fee * lines.reduce((a, l) => a + l.totalPct, 0)) / 100) - acc;
  if (residual !== 0) {
    const last = [...lines].reverse().find((l) => l.payeeId === null) ?? lines[lines.length - 1];
    if (last) last.amount += residual;
  }

  const totalPct = round(lines.reduce((a, l) => a + l.totalPct, 0));
  return {
    lines, totalPct,
    totalAmount: lines.reduce((a, l) => a + l.amount, 0),
    balanced: Math.abs(totalPct - 100) < 1e-4,
    warnings: [...new Set(warnings)],
  };
}

/** 依服務模塊計算分潤。沒指定模塊（或模塊不存在）時＝走全域預設的差％。 */
export function splitForModule(
  input: SplitInput,
  params: CompParams,
  moduleCode?: string | null,
): SplitResult {
  const m = findModule(params, moduleCode);
  if (m?.splitMode === "flat") return splitFlat(input, params, m);
  return splitCase(input, resolveModuleParams(params, moduleCode));
}
