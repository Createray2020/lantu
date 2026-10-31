import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 2026/11/01 Ray：「待我處理，但我要處理什麼？」——卡住的文件要有結案出口（作廢），重複發出的要標出來。
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("待處理文件：作廢出口", () => {
  const list = read("src/components/DocTodoList.tsx");
  it("清單有作廢鈕（只在 canVoid 時出現）並呼叫後台作廢 action", () => {
    expect(list).toContain("voidInstanceAction(r.id, voidReason)");
    expect(list).toMatch(/\{canVoid && !voiding && \(/);
  });
  it("作廢原因必填，重複發出時預填", () => {
    expect(list).toContain("disabled={busy || !voidReason.trim()}");
    expect(list).toContain("重複發出：${r.dupSigned.name} 已於 ${r.dupSigned.at} 簽過同版本");
  });
  it("後台待我處理開了 canVoid；教練端沒有", () => {
    expect(read("src/app/admin/inbox/page.tsx")).toContain("canVoid />");
    expect(read("src/app/dashboard/docs/page.tsx")).not.toContain("canVoid");
  });
  it("listDocTodos 會標出重複發出（同範本同版本已完成）", () => {
    const s = read("src/lib/docsStore.ts");
    expect(s).toContain("await markDupSigned(out);");
    expect(s).toMatch(/r\.key === w\.t\.instance\.templateKey && r\.version === w\.t\.instance\.version && r\.id !== w\.t\.instance\.id/);
  });
});
