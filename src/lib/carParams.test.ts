import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  defaultCarPrices, carPriceLookup, carRetention, carEstimate, carRunningCost, defaultCarSettings, carLicenseTax, carFuelTax, carEvLicenseTax, isMode,
} from "./carParams";
import { CAR_BRANDS_DEFAULT, CAR_ORIGINS, CAR_PAY_DEFAULT, CAR_COST_DEFAULT } from "./carParams.defaults";

/**
 * 購車模組①②④（2026/09/27 Ray）：品牌是一級維度、後台參數表、估值三層 fallback、持有成本由規格推。
 * 這裡是純函式層；HTML 那一份逐字對拍在最後一組。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
const settings = defaultCarSettings();
const prices = defaultCarPrices();

describe("品牌表與起手值", () => {
  it("品牌都有等級；等級層 3 級 × 車型 × 4 動力（0 元組合不列）", () => {
    for (const b of Object.values(CAR_BRANDS_DEFAULT)) expect(CAR_ORIGINS).toContain(b.origin);
    expect(prices.length).toBe((4 + 5 + 4) * 4);   // 國產無跑車、豪華無商用
    expect(prices.every((p) => p.builtin && CAR_ORIGINS.includes(p.brand as never))).toBe(true);
    expect(prices.find((p) => p.brand === "國產" && p.segment === "轎車" && p.power === "汽油")?.price).toBe(85);
    expect(prices.find((p) => p.brand === "國產" && p.segment === "轎車" && p.power === "純電")?.price).toBe(Math.round(85 * 1.3));
    expect(isMode("殘值型")).toBe(true); expect(isMode("分期")).toBe(false);
  });
  it("查價三層：品牌列 → 等級層 × 品牌係數 → 沒有", () => {
    const r = carPriceLookup(prices, settings.brands, "Toyota", "轎車", "汽油");
    expect(r.level).toBe("origin"); expect(r.price).toBe(85);
    const lx = carPriceLookup(prices, settings.brands, "Lexus", "休旅SUV", "油電");
    expect(lx.level).toBe("origin"); expect(lx.price).toBeCloseTo(Math.round(300 * 1.15) * 0.85, 6);
    const withBrand = [...prices, { brand: "Toyota", segment: "轎車" as const, power: "汽油" as const, price: 82, source: "", basis: "" }];
    expect(carPriceLookup(withBrand, settings.brands, "Toyota", "轎車", "汽油")).toEqual({ price: 82, level: "brand" });
    expect(carPriceLookup(prices, settings.brands, "Toyota", "跑車", "汽油").level).toBe("none");   // 國產沒有跑車
    expect(carPriceLookup(prices, settings.brands, "火星車", "轎車", "汽油").level).toBe("none");
    expect(carPriceLookup(prices, settings.brands, "進口", "轎車", "汽油")).toEqual({ price: 140, level: "brand" });   // 等級名＝其他該等級品牌，直接命中等級層那一列
  });
  it("保值率：曲線 × 品牌係數、封頂 0.95；新車＝1", () => {
    expect(carRetention(settings, "Toyota", 0)).toBe(1);
    expect(carRetention(settings, "Toyota", 1)).toBeCloseTo(Math.min(0.95, 0.8 * 1.1), 6);
    expect(carRetention(settings, "Audi", 3)).toBeCloseTo(0.64 * 0.75, 6);
    expect(carRetention(settings, "Lexus", 1)).toBeCloseTo(0.92, 6);
    expect(carRetention({ ...settings, brands: { X: { origin: "國產", priceFactor: 1, retention: 1.5, maint: 1 } } }, "X", 1)).toBe(0.95);
    expect(carRetention(settings, "Nobody", 20)).toBe(0.15);
  });
  it("估值：新車＝均價；中古＝新車價 × 保值率(車齡)", () => {
    const e = carEstimate(prices, settings, { brand: "Toyota", segment: "休旅SUV", power: "油電", condition: "新車" });
    expect(e.total).toBe(Math.round(105 * 1.15) * 10000);
    const u = carEstimate(prices, settings, { brand: "Toyota", segment: "休旅SUV", power: "油電", condition: "中古", age: 3 });
    expect(u.newPrice).toBe(e.total);
    expect(u.total).toBe(Math.round(e.total * Math.min(0.95, 0.64 * 1.1)));
    expect(carEstimate(prices, settings, { brand: "", segment: "轎車", power: "汽油" }).total).toBe(0);
  });
});

describe("持有成本由規格推", () => {
  it("稅：牌照稅＋燃料費依排氣量；柴油燃料費不同；電動車免徵到落日、之後依馬力", () => {
    expect(carLicenseTax(1800)).toBe(7120); expect(carFuelTax(1800)).toBe(4800); expect(carFuelTax(1800, true)).toBe(2880);
    expect(carLicenseTax(1801)).toBe(11230); expect(carLicenseTax(99999)).toBe(151200);
    expect(carEvLicenseTax(200)).toBe(28220);
    const ev = { brand: "Tesla", segment: "轎車", power: "純電", hp: 200 };
    expect(carRunningCost(settings, ev, 2_000_000, 1, CAR_COST_DEFAULT.evTaxFreeUntil).tax).toBe(0);
    expect(carRunningCost(settings, ev, 2_000_000, 1, CAR_COST_DEFAULT.evTaxFreeUntil + 1).tax).toBe(28220);
  });
  it("油電：年里程 × 油耗 × 油價；保險＝基本＋車價×車體險率（車齡帶）；保養＝等級起手×品牌×車齡；停車自有＝0", () => {
    const sp = { brand: "Toyota", segment: "轎車", power: "汽油", cc: 1800, kmPerYear: 12000, ownParking: false };
    const r = carRunningCost(settings, sp, 850_000, 1, 2027);
    expect(r.tax).toBe(7120 + 4800);
    expect(r.energy).toBe(Math.round(12000 / 13 * 31));
    expect(r.ins).toBe(Math.round(6500 + 850_000 * 1.5 / 100));
    expect(r.maint).toBe(Math.round(15000 * 0.9 * 0.6));
    expect(r.parking).toBe(36000); expect(r.misc).toBe(8000);
    expect(r.total).toBe(r.tax + r.energy + r.ins + r.maint + r.parking + r.misc);
    const r7 = carRunningCost(settings, { ...sp, ownParking: true }, 850_000, 7, 2033);
    expect(r7.ins).toBe(6500);   // 7 年以上不保車體
    expect(r7.maint).toBe(Math.round(15000 * 0.9 * 1.5));
    expect(r7.parking).toBe(0);
    const hy = carRunningCost(settings, { ...sp, power: "油電" }, 850_000, 1, 2027);
    expect(hy.energy).toBe(Math.round(12000 / (13 * 1.7) * 31));
    const ev = carRunningCost(settings, { brand: "Tesla", segment: "轎車", power: "純電", kmPerYear: 12000 }, 2_000_000, 1, 2027);
    expect(ev.energy).toBe(Math.round(12000 * 0.17 * 6));
  });
  it("四種取得方式範本：全款無貸款、殘值型有尾款、租賃有月租與買斷", () => {
    expect(CAR_PAY_DEFAULT["全款"].loanRatio).toBe(0);
    expect(CAR_PAY_DEFAULT["殘值型"].balloon).toBe(40);
    expect(CAR_PAY_DEFAULT["租賃"]).toMatchObject({ rentRate: 1.6, rentYears: 3, buyout: 45 });
  });
});

describe("雙實作對拍：carParams.ts ↔ lantu-app.html", () => {
  it("品牌表、起手值、倍率、曲線、稅表、參數、範本逐字一致", () => {
    const d = readFileSync(new URL("./carParams.defaults.ts", import.meta.url), "utf8");
    const grab = (name: string) => { const m = d.match(new RegExp("export const " + name + "[^=]*=\\s*([\\s\\S]*?);\\n")); return m ? m[1].replace(/ as const$/, "").replace(/\s+/g, "") : null; };
    const htmlVar = (name: string) => { const m = HTML.match(new RegExp("var " + name + "=([\\s\\S]*?);\\n")); return m ? m[1].replace(/\s+/g, "") : null; };
    for (const k of ["CAR_PRICE_BASIS", "CAR_ORIGINS", "CAR_SEGMENTS", "CAR_POWERS", "CAR_CONDITIONS", "CAR_MODES", "CAR_BRANDS_DEFAULT", "CAR_ORIGIN_BASE", "CAR_POWER_RATIO", "CAR_RETENTION_DEFAULT", "CAR_TRADE_LOSS_DEFAULT", "CAR_LICENSE", "CAR_FUEL", "CAR_EV_LICENSE", "CAR_COST_DEFAULT", "CAR_PAY_DEFAULT", "CAR_CYCLE_DEFAULT"]) {
      expect(htmlVar(k), k).toBe(grab(k));
    }
    // 工具箱那一份稅表是同一份（已改成引用同一個常數）
    expect(HTML.match(/var CAR_LICENSE=/g)?.length).toBe(1);
    expect(HTML.match(/var CAR_FUEL=/g)?.length).toBe(1);
    // 純函式主體逐字一致（去空白後）
    const ts = readFileSync(new URL("./carParams.ts", import.meta.url), "utf8");
    for (const fn of ["carRunningCost", "carEstimate", "carPriceLookup"]) {
      expect(HTML).toContain("function " + fn + "(");
      expect(ts).toContain("export function " + fn + "(");
    }
    // 引擎範本＝程式端範本（fee/loanRatio/loanYears/loanRate/balloon/rentRate/rentYears/buyout）
    const m = HTML.match(/var CAR_PAY_DEFAULT_ENGINE=\{([\s\S]*?)\n\};/);
    expect(m).toBeTruthy();
    for (const mode of ["全款", "貸款", "殘值型", "租賃"] as const) {
      const t = CAR_PAY_DEFAULT[mode];
      expect(m![1]).toContain(`'${mode}':`);
      expect(m![1].replace(/\s+/g, "")).toContain(`'${mode}':{fee:${t.fee},loanRatio:${t.loanRatio},loanYears:${t.loanYears},loanRate:${t.loanRate},balloon:${t.balloon},rentRate:${t.rentRate},rentYears:${t.rentYears},buyout:${t.buyout}}`);
    }
  });
});
