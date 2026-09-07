import { describe, it, expect } from "vitest";
import { specialtyColor, primarySpecialty, SPECIALTY_COLOR_VARS } from "./specialtyColor";

// 專長顏色的契約只有兩條，但兩條都是「壞掉也不會噴錯」的那種：
// 顏色要穩定（不然 server / client 兩邊算出不同色＝hydration mismatch），
// 而且一定要落在色盤裡（不然畫面上會出現一顆看不見的色塊）。
describe("specialtyColor", () => {
  it("同一個專長永遠同一色（server 與 client 各算一次也要一致）", () => {
    const a = specialtyColor("退休規劃");
    for (let i = 0; i < 50; i++) expect(specialtyColor("退休規劃")).toBe(a);
  });

  it("前後空白不算不同的專長", () => {
    expect(specialtyColor("  稅務規劃 ")).toBe(specialtyColor("稅務規劃"));
  });

  it("任何輸入都落在色盤裡", () => {
    const names = ["退休規劃", "稅務規劃", "保險規劃", "資產傳承", "教育金", "投資配置",
      "企業主財務", "房產規劃", "現金流管理", "英文 English", "🙂"];
    for (const n of names) {
      expect(SPECIALTY_COLOR_VARS as readonly string[]).toContain(specialtyColor(n));
    }
  });

  it("空字串給中性色，不要去撞色盤", () => {
    expect(specialtyColor("")).toBe("var(--tx3)");
    expect(specialtyColor("   ")).toBe("var(--tx3)");
  });

  it("實務上的專長清單不會整份撞成同一色", () => {
    const list = ["退休規劃", "稅務規劃", "保險規劃", "資產傳承", "教育金", "投資配置"];
    expect(new Set(list.map(specialtyColor)).size).toBeGreaterThanOrEqual(3);
  });
});

// 主專長沒有自己的欄位——就是陣列第一個。這條測試是在釘死「不要再開第二個真相」。
describe("primarySpecialty", () => {
  it("＝第一個，順序改了主專長就跟著改", () => {
    expect(primarySpecialty(["退休規劃", "稅務規劃"])).toBe("退休規劃");
    expect(primarySpecialty(["稅務規劃", "退休規劃"])).toBe("稅務規劃");
  });

  it("沒填就是 null，不是空字串", () => {
    expect(primarySpecialty([])).toBeNull();
    expect(primarySpecialty(null)).toBeNull();
    expect(primarySpecialty(undefined)).toBeNull();
  });
});
