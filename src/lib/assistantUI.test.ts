import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * AI 助理面板（2026/10/25 Ray）在規劃器裡的行為：
 *   1. 父層 lantu:init 帶 assistant.on 才掛面板；關著不掛；開著沒金鑰顯示「尚未啟用」。
 *   2. 送出一句話 → 往父層送 lantu:ai（帶 reqId、messages、當下 case）。
 *   3. 父層回 lantu:aireply → 畫預覽卡：填入預設勾、覆蓋預設不勾且標紅。
 *   4. 套用 → 走 set()／addRow()／setCat()，c 的值對、連動有跑（支出細類帶大類）、留一則註記、跳到那一頁。
 *   5. 跟記事本互斥：開一個就收另一個。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type W = any;

async function embed(): Promise<W> {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/lantu-app.html?embed=1" });
  const iw = dom.window as W;
  await new Promise((r) => iw.addEventListener("load", r));
  return iw;
}
function post(iw: W, data: unknown) {
  iw.dispatchEvent(Object.assign(new iw.Event("message"), { source: iw.parent, origin: iw.location.origin, data }));
}
function init(iw: W, assistant: unknown) {
  const c = iw.newCase();
  c.profile.name = "測試客戶"; c.profile.age = 40;
  c.members = [{ name: "本人", role: "本人", gender: "男", age: 40, expRatio: 100, indepAge: 26 }];
  c.liabilities = [{ name: "車貸", owner: "本人", mainCat: "車貸", balance: 500000, rate: 3, repay: "本息攤還", pay: 0, months: 0, grace: 0, startAge: 40 }];
  post(iw, { type: "lantu:init", data: c, assistant, noteAccess: "owner" });
  return c;
}
const ON = { on: true, write: true, configured: true, notice: "", writeNotice: "" };

describe("AI 助理面板", () => {
  it("assistant.on=false → 不掛面板；沒帶 assistant 也不掛", async () => {
    const iw = await embed();
    init(iw, { ...ON, on: false });
    await new Promise((r) => setTimeout(r, 5));
    expect(iw.document.getElementById("aiPad")).toBeNull();
    const iw2 = await embed();
    init(iw2, undefined);
    await new Promise((r) => setTimeout(r, 5));
    expect(iw2.document.getElementById("aiPad")).toBeNull();
  });

  it("開著但沒金鑰：面板在、輸入停用、顯示「尚未啟用」", async () => {
    const iw = await embed();
    init(iw, { ...ON, configured: false, notice: "還沒設定金鑰" });
    await new Promise((r) => setTimeout(r, 5));
    const pad = iw.document.getElementById("aiPad");
    expect(pad).toBeTruthy();
    expect(pad.querySelector(".aipadtab").textContent).toContain("助理");
    expect(iw.document.getElementById("aiPadHint").textContent).toContain("尚未啟用");
    expect(iw.document.getElementById("aiPadHint").textContent).toContain("還沒設定金鑰");
    expect(iw.document.getElementById("aiPadTa").disabled).toBe(true);
  });

  describe("有金鑰、可填寫", () => {
    let iw: W;
    const sent: Array<Record<string, unknown>> = [];
    beforeAll(async () => {
      iw = await embed();
      iw.parent.postMessage = (m: Record<string, unknown>) => { sent.push(m); };
      init(iw, ON);
      await new Promise((r) => setTimeout(r, 5));
      iw.app.activeTab = "data"; iw.app.dataTab = "family"; iw.render();
    });
    const $ = (s: string) => iw.document.querySelector(s);

    it("送出一句話 → lantu:ai 帶 reqId、對話、當下 case；等待中按鈕灰", () => {
      iw.AI.toggle();
      expect($("#aiPad").className).toContain("on");
      iw.AI.typing("車貸每月一萬八，還三十六期");
      iw.AI.send();
      const m = sent.filter((x) => x.type === "lantu:ai").pop()!;
      expect(m).toBeTruthy();
      expect(typeof m.reqId).toBe("string");
      expect((m.messages as unknown[]).length).toBe(1);
      expect((m.data as { profile: { name: string } }).profile.name).toBe("測試客戶");
      expect(iw.AI.pending).toBe(m.reqId);
      expect($("#aiPadSend").disabled).toBe(true);
      expect($("#aiPadList").textContent).toContain("思考中");
    });

    it("父層回預覽卡：填入預設勾、覆蓋預設不勾且標紅；套用後值對、連動有跑、留註記、跳頁", () => {
      const reqId = iw.AI.pending;
      sent.length = 0;
      post(iw, { type: "lantu:aireply", reqId, result: { ok: true, answer: "幫你填好車貸。", rejected: [{ reason: "還不能幫你填：股權" }], ops: [
        { id: "opA", op: "set", arr: "liabilities", arrLabel: "負債", tab: "finance", index: 0, rowLabel: "車貸・本人", fields: [
          { field: "pay", label: "月付金", via: "set", type: "num", value: 18000, shown: "18,000", old: null, mode: "fill" },
          { field: "months", label: "剩餘月數", via: "set", type: "num", value: 36, shown: "36", old: null, mode: "fill" },
          { field: "balance", label: "餘額", via: "set", type: "num", value: 550000, shown: "550,000", old: "500,000", mode: "overwrite" },
        ] },
        { id: "opB", op: "add", arr: "expenses", arrLabel: "支出", tab: "finance", rowLabel: "孝親費・10,000/月", fields: [
          { field: "name", label: "項目", via: "set", type: "txt", value: "孝親費", shown: "孝親費", old: null, mode: "fill" },
          { field: "subCat", label: "細項", via: "cat", type: "txt", value: "孝親金", shown: "孝親金", old: null, mode: "fill" },
          { field: "period", label: "週期", via: "set", type: "txt", value: "月", shown: "月", old: null, mode: "fill" },
          { field: "amount", label: "金額", via: "set", type: "num", value: 120000, shown: "10,000/月", old: null, mode: "fill" },
        ] },
      ] } });
      expect(iw.AI.pending).toBeNull();
      expect($("#aiPadList").textContent).toContain("幫你填好車貸");
      expect($("#aiPadList").textContent).toContain("股權");
      const cardA = $("#aicard_opA");
      const boxes = cardA.querySelectorAll("input[type=checkbox]");
      expect(boxes.length).toBe(3);
      expect(boxes[0].checked).toBe(true);
      expect(boxes[1].checked).toBe(true);
      expect(boxes[2].checked).toBe(false);
      expect(cardA.querySelectorAll(".aifld.ow").length).toBe(1);
      expect(cardA.textContent).toContain("500,000");
      expect(cardA.textContent).toContain("覆蓋");

      // 套用 A（只套勾選的兩筆）
      const c = iw.activeCase();
      const notesBefore = sent.filter((x) => x.type === "lantu:note").length;
      iw.AI.apply("opA");
      expect(c.liabilities[0].pay).toBe(18000);
      expect(c.liabilities[0].months).toBe(36);
      expect(c.liabilities[0].balance).toBe(500000);       // 沒勾的覆蓋不動
      expect(iw.app.dataTab).toBe("finance");               // 跳到落地那一頁
      expect($("#aicard_opA").textContent).toContain("已套用");
      const notes = sent.filter((x) => x.type === "lantu:note");
      expect(notes.length).toBe(notesBefore + 1);
      const inp = (notes[notes.length - 1] as { input: { blockKey: string; body: string } }).input;
      expect(inp.blockKey).toBe("page:finance|負債");
      expect(inp.body).toContain("由助理填入");
      expect(inp.body).toContain("月付金 18,000");
      expect(inp.body).not.toContain("餘額");
      expect(sent.some((x) => x.type === "lantu:save")).toBe(true); // 走 set() 就會存

      // 套用 B：新增一列、細類走 setCat 帶出大類「孝親」、金額年化
      const before = c.expenses.length;
      iw.AI.apply("opB");
      expect(c.expenses.length).toBe(before + 1);
      const row = c.expenses[c.expenses.length - 1];
      expect(row.name).toBe("孝親費");
      expect(row.subCat).toBe("孝親金");
      expect(row.cat).toBe("孝親");
      expect(row.period).toBe("月");
      expect(row.amount).toBe(120000);
    });

    it("再套一次同一張卡不會重複寫；「不要」把卡收掉", () => {
      const c = iw.activeCase();
      const n = c.expenses.length;
      iw.AI.apply("opB");
      expect(c.expenses.length).toBe(n);
      iw.AI.dismiss("opZ");
      expect(iw.AI.applied.opZ).toBe(true);
    });

    it("父層回錯誤：顯示錯誤、那一句不留在對話脈絡；not_configured 會把面板切成尚未啟用", () => {
      iw.AI.typing("退休缺口多少？");
      iw.AI.send();
      const reqId = iw.AI.pending;
      const len = iw.AI.msgs.length;
      post(iw, { type: "lantu:aireply", reqId, result: { ok: false, code: "rate_limited", error: "這個月用量已達上限" } });
      expect($("#aiPadList").textContent).toContain("用量已達上限");
      expect(iw.AI.msgs.length).toBe(len - 1);
      iw.AI.typing("再問一次");
      iw.AI.send();
      post(iw, { type: "lantu:aireply", reqId: iw.AI.pending, result: { ok: false, code: "not_configured", error: "沒金鑰" } });
      expect(iw.AI.cfg.configured).toBe(false);
      expect($("#aiPadTa").disabled).toBe(true);
    });

    it("跟記事本互斥：開記事本就收助理，開助理就收記事本", () => {
      iw.AI.cfg.configured = true;
      if (!iw.AI.open) iw.AI.toggle();
      expect($("#aiPad").className).toContain("on");
      iw.LN.padToggle();
      expect($("#lnPad").className).toContain("on");
      expect($("#aiPad").className).not.toContain("on");
      iw.AI.toggle();
      expect($("#aiPad").className).toContain("on");
      expect($("#lnPad").className).not.toContain("on");
    });

    it("唯讀（LANTU_RO）時套用被擋下", () => {
      iw.LANTU_RO = true;
      const c = iw.activeCase();
      const v = c.liabilities[0].rate;
      post(iw, { type: "lantu:aireply", reqId: null, result: {} }); // 無關訊息不炸
      iw.AI.items.push({ role: "assistant", text: "x", ops: [{ id: "opR", op: "set", arr: "liabilities", arrLabel: "負債", tab: "finance", index: 0, rowLabel: "車貸", fields: [
        { field: "rate", label: "年利率%", via: "set", type: "num", value: 9, shown: "9%", old: "3%", mode: "overwrite" },
      ] }] });
      iw.AI.picks.opR = { rate: true };
      iw.AI.apply("opR");
      expect(c.liabilities[0].rate).toBe(v);
      expect(iw.AI.applied.opR).toBeUndefined();
      iw.LANTU_RO = false;
    });
  });

  it("客戶端（role=client）不掛面板", async () => {
    const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/lantu-app.html?embed=1&role=client" });
    const iw = dom.window as W;
    await new Promise((r) => iw.addEventListener("load", r));
    post(iw, { type: "lantu:init", data: iw.newCase(), assistant: ON });
    await new Promise((r) => setTimeout(r, 5));
    expect(iw.document.getElementById("aiPad")).toBeNull();
    expect(iw.AI).toBeUndefined();
  });
});
