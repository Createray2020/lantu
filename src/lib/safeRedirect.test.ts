import { describe, it, expect } from "vitest";
import { safeBackPath } from "./safeRedirect";

describe("safeBackPath", () => {
  it("站內路徑放行（含 query）", () => {
    expect(safeBackPath("/dashboard")).toBe("/dashboard");
    expect(safeBackPath("/portal/join?code=abc")).toBe("/portal/join?code=abc");
    expect(safeBackPath("/")).toBe("/");
  });
  it("protocol-relative 與反斜線一律擋", () => {
    expect(safeBackPath("//evil.com/x")).toBeUndefined();
    expect(safeBackPath("/\\evil.com")).toBeUndefined();
    expect(safeBackPath("https://evil.com")).toBeUndefined();
    expect(safeBackPath("javascript:alert(1)")).toBeUndefined();
  });
  it("沒帶、空字串、含控制字元都當沒帶", () => {
    expect(safeBackPath(undefined)).toBeUndefined();
    expect(safeBackPath("")).toBeUndefined();
    expect(safeBackPath("/a\nb")).toBeUndefined();
  });
});
