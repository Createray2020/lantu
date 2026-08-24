import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { displayNameOf, DISPLAY_NAME_MAX } from "./coachName";

// 教練顯示名稱（2026/08/24 Ray 拍板：教練可以自己改名字，全站都要換）。
//
// 地基語意：`coaches.name` 是 Clerk 鏡像、每次導頁都會被覆寫；教練自填的在 `display_name`。
// 這一支守的是「自填優先、空白退回 Clerk」這條規則，以及純函式版與 SQL 版不能走鐘。

describe("displayNameOf", () => {
  it("有自填就用自填", () => {
    expect(displayNameOf({ displayName: "雷立揚", name: "立揚 雷", email: "a@b.c" })).toBe("雷立揚");
  });

  it("沒自填就退回 Clerk 姓名", () => {
    expect(displayNameOf({ displayName: null, name: "立揚 雷", email: "a@b.c" })).toBe("立揚 雷");
  });

  it("⚠️ 空字串與全空白都算「沒填」——不能讓卡片變成空白名字", () => {
    expect(displayNameOf({ displayName: "", name: "立揚 雷" })).toBe("立揚 雷");
    expect(displayNameOf({ displayName: "   ", name: "立揚 雷" })).toBe("立揚 雷");
    expect(displayNameOf({ displayName: "\t\n", name: "立揚 雷" })).toBe("立揚 雷");
  });

  it("自填會去頭尾空白", () => {
    expect(displayNameOf({ displayName: "  雷立揚  ", name: "x" })).toBe("雷立揚");
  });

  it("Clerk 姓名也可能是空的 → 退到 email", () => {
    expect(displayNameOf({ displayName: null, name: null, email: "ray@lantu.tw" })).toBe("ray@lantu.tw");
    expect(displayNameOf({ displayName: "", name: "  ", email: "ray@lantu.tw" })).toBe("ray@lantu.tw");
  });

  it("全都沒有就回「教練」，永遠不會是空字串或 null", () => {
    expect(displayNameOf({})).toBe("教練");
    expect(displayNameOf(null)).toBe("教練");
    expect(displayNameOf({ displayName: " ", name: " ", email: " " })).toBe("教練");
  });

  it("上限 20 字（Ray：只限長度，其餘不管）", () => {
    expect(DISPLAY_NAME_MAX).toBe(20);
  });
});

describe("純函式版與 SQL 版不能走鐘", () => {
  it("SQL 版就是 coalesce(nullif(display_name,''), name)", () => {
    // 語意對照：nullif(…,'') ＝ 純函式的「空字串算沒填」，coalesce ＝「退回 Clerk 姓名」。
    // ⚠️ SQL 的 nullif 只擋得住空字串、擋不住「全是空白」——純函式有 trim，SQL 沒有。
    //    這是刻意接受的差距：saveDisplayName() 存進去之前一定先 trim，所以 DB 裡不會有全空白值。
    const schema = readFileSync("src/Shared/db/schema.ts", "utf8");
    expect(schema).toContain("coalesce(nullif(${coaches.displayName}, ''), ${coaches.name})");
  });

  it("saveDisplayName 一定先 trim，而且寫的是 display_name 不是 name", () => {
    const src = readFileSync("src/lib/coach.ts", "utf8");
    const fn = src.split("export async function saveDisplayName")[1].split("\n}")[0];
    expect(fn).toContain(".trim()");
    expect(fn).toContain("displayName: v || null");
    // 寫 name 就等於改 Clerk 鏡像，下一次導頁會被蓋回去。
    expect(fn).not.toMatch(/set\(\{[^}]*\bname:/);
  });
});

describe("Coach.name 已經是顯示名（顯示層不用各自處理）", () => {
  const src = readFileSync("src/lib/coach.ts", "utf8");

  it("三支回傳 Coach 的路徑都經過 withDisplayName", () => {
    // ensureCoach / applyAsCoach 共用同一行結尾，listCoaches 走 map。
    const wrapped = src.match(/return withDisplayName\(await withCode\(await syncAdminRole/g) ?? [];
    expect(wrapped.length).toBe(2);
    expect(src).toContain("return rows.map(withDisplayName);");
  });

  it("⚠️ Clerk 同步比對的是 identity() 的原名，不是回傳值的 name", () => {
    // 如果哪天有人把這行改成拿 row.name 去比，顯示名就會被當成 Clerk 名寫回鏡像欄，
    // 教練改一次名字之後 Clerk 的真名就永遠找不回來了。
    expect(src).toContain("row.email !== email || row.name !== name");
    // 而且覆寫發生在同步之後：withDisplayName 包在最外層。
    expect(src).toContain("withDisplayName(await withCode(await syncAdminRole(row, isAdmin)))");
  });
});
