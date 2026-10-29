import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";
import { DOC_CSS } from "./docs";
import { toTodoRows } from "./docTodoRows";

/**
 * 2026/10/29 回饋 LT01–08 的回歸守門。
 * LT02：工具箱每打一字就重畫＋還原焦點，還原那一下被「聚焦就全選」當成新聚焦 → 整格被選 → 下一個字蓋掉整格（只剩一位數）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
});

function spyInput(type: string, cls = "") {
  const el = w.document.createElement("input") as HTMLInputElement;
  el.type = type;
  if (cls) el.className = cls;
  el.value = "12";
  w.document.body.appendChild(el);
  let selected = 0;
  el.select = () => { selected++; };
  return { el, count: () => selected };
}

describe("LT02 數字欄重畫後還原焦點不全選", () => {
  it("使用者點進來（一般聚焦）仍會全選", async () => {
    const { el, count } = spyInput("number");
    el.focus();
    await new Promise((r) => setTimeout(r, 5));
    expect(count()).toBe(1);
  });
  it("lnRefocus（renderKeepFocus／syncCalcNodes 用的）不全選——number 與金額欄都一樣", async () => {
    for (const [t, c] of [["number", ""], ["text", "amtin"]]) {
      w.document.body.focus();
      const { el, count } = spyInput(t, c);
      w.lnRefocus(el, null, null);
      await new Promise((r) => setTimeout(r, 5));
      expect(w.document.activeElement).toBe(el);
      expect(count()).toBe(0);
    }
  });
  it("renderKeepFocus／syncCalcNodes 都改走 lnRefocus；setTool 留住打到一半的小數點", () => {
    const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
    expect(html.match(/lnRefocus\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("if(el.__lnKeepSel)return;");
    expect(html).toContain("if(el&&v!==''&&n(v)===n(app.tools[g][k]))return;");
    expect(html).toContain("setTool(\\''+g+'\\',\\''+x[0]+'\\',this.value,this)");
  });
});

describe("LT07／LT08 文件樣式", () => {
  it("公司印鑑在 {{seal}} 原位排版（不靠右浮動）", () => {
    const rule = /\.doc-seal\{([^}]*)\}/.exec(DOC_CSS)?.[1] ?? "";
    expect(rule).not.toContain("float");
    expect(rule).toContain("inline-block");
  });
  it("簽名旁的姓名＋日期小字隱藏（紀錄仍在 doc_signers）", () => {
    expect(/\.sign-meta\{display:none\}/.test(DOC_CSS)).toBe(true);
  });
});

describe("LT03 拒簽原因", () => {
  it("需要處理的文件清單帶出拒簽原因", () => {
    const signer = (o: Record<string, unknown>) => ({ coachId: "u1", clientUserId: null, seq: 1, remindCount: 0, ...o });
    const rows = toTodoRows([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { kind: "declined", waitingOn: "阿一", days: 0, instance: { id: "i1", title: "保密同意書", caseType: "coach_doc", expiresAt: null, signers: [signer({ status: "declined", declineReason: "剛剛已經有簽過了，這是重複的文件" })] } as any },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { kind: "stale", waitingOn: "阿二", days: 20, instance: { id: "i2", title: "契約", caseType: "coach_doc", expiresAt: null, signers: [signer({ status: "pending", declineReason: null })] } as any },
    ]);
    expect(rows[0].reason).toBe("剛剛已經有簽過了，這是重複的文件");
    expect(rows[1].reason).toBeNull();
  });
});
