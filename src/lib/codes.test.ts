import { describe, it, expect } from "vitest";
import { formatCode, normalizeCode, parseCode, ymTaipei } from "./codes";

describe("ymTaipei", () => {
  it("取台北時區的年尾兩碼＋月", () => {
    expect(ymTaipei(new Date("2026-09-15T03:00:00Z"))).toBe("2609");
    expect(ymTaipei(new Date("2026-10-05T03:00:00Z"))).toBe("2610");
  });

  it("⚠️ 月初跨日：台灣已經是 9/1，UTC 還停在 8/31 —— 必須算 9 月", () => {
    // 2026-08-31 17:00Z ＝ 台北 2026-09-01 01:00
    expect(ymTaipei(new Date("2026-08-31T17:00:00Z"))).toBe("2609");
    // 對照組：用 UTC 判定就會拿到 2608，那個號在 8 月早就發出去過了
    expect(ymTaipei(new Date("2026-08-31T17:00:00Z"), "UTC")).toBe("2608");
  });

  it("月底跨日：台北還在 8/31 深夜，UTC 已經 9/1", () => {
    // 2026-09-01 01:00Z ＝ 台北 2026-09-01 09:00 → 兩邊都是 9 月
    expect(ymTaipei(new Date("2026-09-01T01:00:00Z"))).toBe("2609");
  });

  it("跨年：2026/12 → 2612，2027/01 → 2701", () => {
    expect(ymTaipei(new Date("2026-12-20T12:00:00Z"))).toBe("2612");
    expect(ymTaipei(new Date("2027-01-02T12:00:00Z"))).toBe("2701");
  });
});

describe("formatCode", () => {
  it("Ray 給的兩個範例", () => {
    // 2026 年九月的第二個報聘的教練
    expect(formatCode("coach", "2609", 2)).toBe("FC2609002");
    // 2026 年 10 月的第五個客戶
    expect(formatCode("client", "2610", 5)).toBe("2610005");
  });

  it("客戶編號不加前綴、教練編號加 FC", () => {
    expect(formatCode("client", "2601", 1)).toBe("2601001");
    expect(formatCode("coach", "2601", 1)).toBe("FC2601001");
  });

  it("超過 999 自然長成四碼，不截斷（寧可號變長也不能兩個人同號）", () => {
    expect(formatCode("client", "2610", 999)).toBe("2610999");
    expect(formatCode("client", "2610", 1000)).toBe("26101000");
    expect(formatCode("coach", "2610", 1234)).toBe("FC26101234");
  });
});

describe("parseCode", () => {
  it("認得教練號與客戶號", () => {
    expect(parseCode("FC2609002")).toEqual({ kind: "coach", ym: "2609", seq: 2 });
    expect(parseCode("2610005")).toEqual({ kind: "client", ym: "2610", seq: 5 });
  });

  it("容忍大小寫、空白與連字號（客戶是用抄的／貼的）", () => {
    expect(parseCode(" fc2609002 ")).toEqual({ kind: "coach", ym: "2609", seq: 2 });
    expect(parseCode("FC-2609-002")).toEqual({ kind: "coach", ym: "2609", seq: 2 });
  });

  it("四碼流水號也解得開", () => {
    expect(parseCode("FC26101234")).toEqual({ kind: "coach", ym: "2610", seq: 1234 });
  });

  it("月份不合法就回 null（2613 不存在）", () => {
    expect(parseCode("FC2613001")).toBeNull();
    expect(parseCode("2600001")).toBeNull();
  });

  it("格式不對回 null，不要硬解", () => {
    expect(parseCode("")).toBeNull();
    expect(parseCode("FC26090")).toBeNull();   // 流水號不足三碼
    expect(parseCode("XX2609002")).toBeNull(); // 不認得的前綴
    expect(parseCode("王小明")).toBeNull();
  });
});

describe("normalizeCode", () => {
  it("去空白、去連字號、轉大寫", () => {
    expect(normalizeCode(" fc-2609 002 ")).toBe("FC2609002");
    expect(normalizeCode("")).toBe("");
  });
});
