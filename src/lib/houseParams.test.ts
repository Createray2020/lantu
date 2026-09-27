import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  defaultHousePrices, housePriceLookup, houseAgeRatio, houseEstimate, normCity, isCondition, defaultHouseSettings,
} from "./houseParams";
import { TW_DISTRICTS, TW_CITIES } from "./twDistricts";
import { HOUSE_CITY_BASE, HOUSE_PAY_DEFAULT, HOUSE_MIN_SPEC_DEFAULT } from "./houseParams.defaults";

/**
 * 購屋模組①②（2026/09/27 Ray）：地區到行政區、後台參數表、估值三層 fallback。
 * 這裡是純函式層；HTML 那一份逐字對拍見 houseParams.drift.test.ts。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

describe("地區表", () => {
  it("22 縣市 368 鄉鎮市區，全站用「台」不用「臺」", () => {
    expect(TW_CITIES.length).toBe(22);
    expect(Object.values(TW_DISTRICTS).reduce((a, d) => a + d.length, 0)).toBe(368);
    expect(TW_CITIES.some((c) => c.includes("臺"))).toBe(false);
    expect(TW_DISTRICTS["新北市"]).toContain("板橋區");
    expect(Object.keys(HOUSE_CITY_BASE).sort()).toEqual([...TW_CITIES].sort());
  });
  it("normCity：臺→台、去空白", () => {
    expect(normCity(" 臺北市 ")).toBe("台北市");
    expect(isCondition("預售")).toBe(true);
    expect(isCondition("成屋")).toBe(false);
  });
});

describe("估值", () => {
  const prices = defaultHousePrices();
  const settings = defaultHouseSettings();
  it("起手值：22 縣市 × 3 屋況；預售≈新成屋×1.1、中古≈×0.72", () => {
    expect(prices.length).toBe(66);
    const tp = Object.fromEntries(prices.filter((p) => p.city === "台北市").map((p) => [p.condition, p.unitPrice]));
    expect(tp["新成屋"]).toBe(95);
    expect(tp["預售"]).toBeCloseTo(104.5, 1);
    expect(tp["中古"]).toBeCloseTo(68.4, 1);
    expect(prices.every((p) => p.builtin && p.district === "")).toBe(true);
  });
  it("查價三層：行政區列 → 縣市列 → 沒有", () => {
    expect(housePriceLookup(prices, "新北市", "板橋區", "新成屋").level).toBe("city");
    const withDist = [...prices, { city: "新北市", district: "板橋區", condition: "新成屋" as const, unitPrice: 68, parkingPrice: 0, source: "", basis: "" }];
    const r = housePriceLookup(withDist, "新北市", "板橋區", "新成屋");
    expect(r.level).toBe("district"); expect(r.row?.unitPrice).toBe(68);
    expect(housePriceLookup(prices, "火星", "", "新成屋").level).toBe("none");
  });
  it("估值＝均價×屋型×屋齡×坪數＋車位；行政區列沒車位價就沿用縣市層；屋齡只對中古生效", () => {
    const withDist = [...prices, { city: "新北市", district: "板橋區", condition: "中古" as const, unitPrice: 50, parkingPrice: 0, source: "", basis: "" }];
    const e = houseEstimate(withDist, settings, { city: "新北市", district: "板橋區", condition: "中古", type: "公寓", ping: 30, parking: 1, age: 20 });
    // 50 × 0.7（公寓）× 0.8（16–30 年）= 28 萬/坪 × 30 坪 = 840 萬；車位沿用新北縣市層 200 萬
    expect(e.unit).toBe(28);
    expect(e.parts.price).toBe(8_400_000);
    expect(e.parts.parking).toBe(2_000_000);
    expect(e.total).toBe(10_400_000);
    expect(e.level).toBe("district");
    expect(houseAgeRatio(settings.ageRatio, 20, "新成屋")).toBe(1);
    expect(houseAgeRatio(settings.ageRatio, 40, "中古")).toBe(0.7);
    expect(houseEstimate(prices, settings, { city: "", condition: "新成屋", ping: 30 }).total).toBe(0);
  });
  it("付款範本：預售 訂簽開 15％／工程期款 10％ 分 3 年、中古有仲介費；最低標準起手＝電梯大樓 3 房 30 坪", () => {
    expect(HOUSE_PAY_DEFAULT["預售"]).toMatchObject({ deposit: 15, progress: 10, progressYears: 3 });
    expect(HOUSE_PAY_DEFAULT["中古"].agentFee).toBe(2);
    expect(HOUSE_MIN_SPEC_DEFAULT).toMatchObject({ type: "電梯大樓", rooms: 3, ping: 30 });
  });
});

describe("雙實作對拍：houseParams.ts ↔ lantu-app.html", () => {
  it("地區表、起手值、倍率、範本逐字一致", () => {
    const grab = (src: string, name: string) => {
      const m = src.match(new RegExp("const " + name + "[^=]*=\\s*([\\s\\S]*?);\\n"));
      return m ? m[1].replace(/\s+/g, "") : null;
    };
    const tw = readFileSync(new URL("./twDistricts.ts", import.meta.url), "utf8");
    const d = readFileSync(new URL("./houseParams.defaults.ts", import.meta.url), "utf8");
    const htmlVar = (name: string) => { const m = HTML.match(new RegExp("var " + name + "=([\\s\\S]*?);\\n")); return m ? m[1].replace(/\s+/g, "") : null; };
    expect(htmlVar("TW_DISTRICTS")).toBe(grab(tw, "TW_DISTRICTS"));
    for (const k of ["HOUSE_CITY_BASE", "HOUSE_COND_RATIO", "HOUSE_TYPE_RATIO_DEFAULT", "HOUSE_AGE_RATIO_DEFAULT", "HOUSE_PAY_DEFAULT", "HOUSE_MIN_SPEC_DEFAULT"]) {
      expect(htmlVar(k), k).toBe(grab(d, k));
    }
  });
  it("估值公式兩邊同一段", () => {
    expect(HTML).toContain(" var unit=row.unitPrice*(settings.typeRatio[spec.type||'電梯大樓']||1)*houseAgeRatio(settings.ageRatio,n(spec.age||0),spec.condition);");
    expect(HTML).toContain(" if(r.district===district&&district)return {row:r,level:'district'};");
  });
});
