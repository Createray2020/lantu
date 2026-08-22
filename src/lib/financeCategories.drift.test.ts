import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  DEFAULT_FINANCE_CATEGORIES,
  CAT_PARENTS,
  type CatKind,
} from "./financeCategories.defaults";
import { normalizeCatInput, toPayload, defaultPayload, type FinCatRow } from "./financeCategories";

const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/**
 * 收支資債細類字典的雙實作對拍。
 *
 * 後端 financeCategories.defaults.ts 是 migration 的 seed，
 * public/lantu-app.html 的 CAT_FALLBACK 是「API 抓不到時」的備援清單。
 * 兩份必須一模一樣 —— 不然離線與線上會看到不同的選項，而且旗標（風險性資產／消費性負債）
 * 對不上時，同一筆資產在兩種情境下會被算進不同的分子。
 */
function htmlConst(name: string): unknown {
  const m = new RegExp(`var ${name}=(\\{[^\\n]*\\});`).exec(HTML)          // 單行物件
    ?? new RegExp(`var ${name}=(\\{[\\s\\S]*?\\n\\});`).exec(HTML)      // 多行物件
    ?? new RegExp(`var ${name}=(\\[[\\s\\S]*?\\n\\]);`).exec(HTML);     // 多行陣列
  if (!m) throw new Error(`lantu-app.html 找不到 ${name}`);
  // HTML 裡是 JS 字面值（單引號、鍵沒加引號），不是合法 JSON —— 用 Function 取值。
  // 來源是本 repo 自己的檔案，不是外部輸入。
  return Function(`"use strict";return (${m[1]});`)();
}

type HtmlCat = { label: string; parent: string; risk?: boolean; liq?: string; consumer?: boolean; note?: boolean };

describe("細類字典雙實作對拍：financeCategories.defaults.ts ↔ lantu-app.html", () => {
  const fallback = htmlConst("CAT_FALLBACK") as Record<CatKind, HtmlCat[]>;
  const kinds: CatKind[] = ["income", "expense", "saving", "asset", "liability"];

  it("CAT_PARENTS 兩邊一致（大類是引擎在算的鍵，多一個少一個都會讓比率算錯）", () => {
    const htmlParents = htmlConst("CAT_PARENTS") as Record<CatKind, string[]>;
    for (const k of kinds) {
      expect(htmlParents[k], k).toEqual([...CAT_PARENTS[k]]);
    }
  });

  it.each(["income", "expense", "saving", "asset", "liability"] as CatKind[])(
    "%s：細類清單、大類歸屬與旗標完全一致",
    (kind) => {
      const ts = DEFAULT_FINANCE_CATEGORIES.filter((s) => s.kind === kind).map((s) => ({
        label: s.label,
        parent: s.parent,
        ...(s.risk ? { risk: true } : {}),
        ...(s.liq ? { liq: s.liq } : {}),
        ...(s.consumer ? { consumer: true } : {}),
        ...(s.note ? { note: true } : {}),
      }));
      expect(fallback[kind]).toEqual(ts);
    },
  );

  it("每個細類的 parent 都在該 kind 的合法大類裡", () => {
    for (const s of DEFAULT_FINANCE_CATEGORIES) {
      expect(CAT_PARENTS[s.kind], `${s.kind}/${s.label}`).toContain(s.parent);
    }
  });

  it("同一 kind 內細類不重名（label 就是寫進 plan.data 的字串）", () => {
    for (const k of kinds) {
      const labels = DEFAULT_FINANCE_CATEGORIES.filter((s) => s.kind === k).map((s) => s.label);
      expect(new Set(labels).size, k).toBe(labels.length);
    }
  });

  it("每個 kind 都有一個「其他」收尾，而且會提示補明細", () => {
    // label 不一定剛好是「其他」——同一個 kind 底下有多個大類時會加上大類名
    // （例如支出的「其他貸款支出」、儲蓄的「其他儲蓄投資」），重點是 note 旗標要在。
    for (const k of kinds) {
      const others = DEFAULT_FINANCE_CATEGORIES.filter((s) => s.kind === k && s.label.startsWith("其他"));
      expect(others.length, k).toBeGreaterThan(0);
      expect(others.some((s) => s.note === true), k).toBe(true);
    }
  });

  it("風險性資產旗標涵蓋原本硬寫在引擎裡的那幾種（股票/基金/債券）", () => {
    const risky = DEFAULT_FINANCE_CATEGORIES.filter((s) => s.kind === "asset" && s.risk).map((s) => s.label);
    for (const label of ["股票", "基金", "債券", "ETF", "加密貨幣"]) {
      expect(risky, label).toContain(label);
    }
    // 現金與定存永遠不是風險性資產
    for (const label of ["現金", "定存", "活期存款"]) {
      expect(risky, label).not.toContain(label);
    }
  });
});

describe("normalizeCatInput：大類亂填是硬擋，不是靜默修正", () => {
  const base = { kind: "asset", parent: "可投資資產", label: "加密貨幣" };

  it("正常輸入會過", () => {
    const v = normalizeCatInput({ ...base, riskAsset: true, liquidity: "流動" });
    expect(v.parent).toBe("可投資資產");
    expect(v.riskAsset).toBe(true);
    expect(v.liquidity).toBe("流動");
  });

  it("不合法的 kind / parent / 空白 label 會丟錯", () => {
    expect(() => normalizeCatInput({ ...base, kind: "nope" })).toThrow("invalid-kind");
    expect(() => normalizeCatInput({ ...base, parent: "股票" })).toThrow("invalid-parent");
    expect(() => normalizeCatInput({ ...base, label: "  " })).toThrow("empty-label");
    expect(() => normalizeCatInput({ ...base, liquidity: "半流動" })).toThrow("invalid-liquidity");
  });

  it("旗標只在對應的 kind 生效（支出不會莫名其妙帶到風險性資產旗標）", () => {
    const v = normalizeCatInput({ kind: "expense", parent: "生活", label: "餐食", riskAsset: true, consumer: true });
    expect(v.riskAsset).toBe(false);
    expect(v.consumer).toBe(false);
    expect(v.liquidity).toBeNull();
  });
});

describe("toPayload：停用的細類不會送到前端，但預設清單一定送得出去", () => {
  const row = (over: Partial<FinCatRow>): FinCatRow => ({
    id: "x", kind: "asset", parent: "可投資資產", label: "股票",
    riskAsset: true, liquidity: "流動", consumer: false, needsNote: false,
    sortOrder: 1, active: true, isSystem: true, ...over,
  });

  it("active=false 的不出現", () => {
    const p = toPayload([row({}), row({ id: "y", label: "已停用的", active: false })]);
    expect(p.asset.map((x) => x.label)).toEqual(["股票"]);
  });

  it("defaultPayload 四個 kind 都有內容（表還沒 seed 時後台不會是空白畫面）", () => {
    const p = defaultPayload();
    for (const k of ["income", "expense", "asset", "liability"] as CatKind[]) {
      expect(p[k].length, k).toBeGreaterThan(5);
    }
  });
});
