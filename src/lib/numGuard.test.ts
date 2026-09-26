import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 數字欄守衛（public/numguard.js）：注音輸入法開著也能直接在數字欄打數字。
 *
 * 組字一開始就收掉並對應回數字（macOS／Windows 同一條路）、compositionend 自己來也對應、
 * inputmode 讓手機直接彈數字鍵盤。另外守「兩側都有掛」——lantu-app.html 的 <script src>
 * 與 layout 的 next/script，漏一邊就有一邊的使用者又得切輸入法。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let G: any;
const SRC = readFileSync(new URL("../../public/numguard.js", import.meta.url), "utf8");

beforeAll(() => {
  const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", url: "https://lantu.test/" });
  w = dom.window;
  w.eval(SRC);
  G = w.LantuNumGuard;
});

function mk(attrs: string) {
  w.document.body.innerHTML = `<input ${attrs}>`;
  const el = w.document.body.firstElementChild as HTMLInputElement;
  const log: string[] = [];
  el.addEventListener("input", () => log.push("input:" + el.value));
  el.addEventListener("change", () => log.push("change:" + el.value));
  return { el, log };
}

describe("mapText：注音鍵位對應回數字", () => {
  it("ㄅㄉˇˋㄓˊ˙ㄚㄞㄢ → 1234567890、全形 → 半形", () => {
    expect(G.mapText("ㄅㄉˇˋㄓˊ˙ㄚㄞㄢ", "numeric")).toBe("1234567890");
    expect(G.mapText("１２３", "numeric")).toBe("123");
  });
  it("金額（numeric）不收小數點；decimal／number 收", () => {
    expect(G.mapText("ㄅㄡㄉ", "numeric")).toBe("12");
    expect(G.mapText("ㄅㄡㄉ", "decimal")).toBe("1.2");
    expect(G.mapText("1。5", "number")).toBe("1.5");
  });
  it("其他字元一律丟掉", () => {
    expect(G.mapText("ㄅ中文ㄉ", "numeric")).toBe("12");
  });
});

describe("fieldKind：哪些欄位歸守衛管", () => {
  it("number / inputmode numeric / decimal 管；純 text、readonly、disabled 不管", () => {
    expect(G.fieldKind(mk('type="number"').el)).toBe("number");
    expect(G.fieldKind(mk('type="text" inputmode="numeric"').el)).toBe("numeric");
    expect(G.fieldKind(mk('type="text" inputmode="decimal"').el)).toBe("decimal");
    expect(G.fieldKind(mk('type="text"').el)).toBeNull();
    expect(G.fieldKind(mk('type="number" readonly').el)).toBeNull();
    expect(G.fieldKind(mk('type="number" disabled').el)).toBeNull();
  });
});

function comp(el: HTMLInputElement, type: string, data: string) {
  el.dispatchEvent(new w.CompositionEvent(type, { bubbles: true, data }));
}
const tick = () => new Promise<void>((r) => setTimeout(r, 5));

describe("組字一開始就收掉（macOS／Windows 同一條路）", () => {
  it("compositionupdate 帶 ㄅ → 下一拍 blur/focus、值變成組字前＋1、派 input、游標在數字後", async () => {
    const { el, log } = mk('type="text" inputmode="numeric" value="1,000"');
    el.focus();
    el.setSelectionRange(5, 5);
    comp(el, "compositionstart", "");
    expect(G.isComposing(el)).toBe(true);
    el.value = "1,000ㄅ"; // 瀏覽器在組字期間把注音塞進欄位
    comp(el, "compositionupdate", "ㄅ");
    await tick();
    expect(G.isComposing(el)).toBe(false);
    expect(el.value).toBe("1,0001");
    expect(log).toEqual(["input:1,0001"]);
    expect(w.document.activeElement).toBe(el);
    await tick();
    expect(el.selectionStart).toBe(6);
  });
  it("強制收掉時的 blur 不會補發 change（那不是使用者離開欄位）", async () => {
    const { el, log } = mk('type="number" value=""');
    el.focus();
    comp(el, "compositionstart", "");
    comp(el, "compositionupdate", "ㄉ");
    await tick();
    expect(el.value).toBe("2");
    expect(log).toEqual(["input:2"]);
  });
  it("組字中間插入：游標在中間時數字插在游標處", async () => {
    const { el } = mk('type="text" inputmode="decimal" value="19"');
    el.focus();
    el.setSelectionRange(1, 1);
    comp(el, "compositionstart", "");
    comp(el, "compositionupdate", "ㄓ");
    await tick();
    expect(el.value).toBe("159");
  });
  it("金額欄不收小數點；組出來全是非數字 → 值回到組字前", async () => {
    const a = mk('type="text" inputmode="numeric" value="1"');
    a.el.focus(); a.el.setSelectionRange(1, 1);
    comp(a.el, "compositionstart", "");
    comp(a.el, "compositionupdate", "ㄡ");
    await tick();
    expect(a.el.value).toBe("1");
    const b = mk('type="text" inputmode="numeric" value="7"');
    b.el.focus(); b.el.setSelectionRange(1, 1);
    comp(b.el, "compositionstart", "");
    b.el.value = "7你好";
    comp(b.el, "compositionupdate", "你好");
    await tick();
    expect(b.el.value).toBe("7");
  });
  it("非數字欄不插手", async () => {
    const { el, log } = mk('type="text" value="ab"');
    el.focus();
    comp(el, "compositionstart", "");
    comp(el, "compositionupdate", "ㄅ");
    await tick();
    expect(G.isComposing(el)).toBe(false);
    expect(log).toEqual([]);
  });
});

describe("compositionend 自己來（例如 Enter 送出組字）", () => {
  it("用組字前的值 ＋ 對應後的數字重寫，並派 input", () => {
    const { el, log } = mk('type="text" inputmode="numeric" value="1,000"');
    el.focus();
    el.setSelectionRange(5, 5);
    comp(el, "compositionstart", "");
    el.value = "1,000ㄅㄉ";
    comp(el, "compositionend", "ㄅㄉ");
    expect(G.isComposing(el)).toBe(false);
    expect(el.value).toBe("1,00012");
    expect(log).toEqual(["input:1,00012"]);
  });
});

describe("onchange 欄位不漏存", () => {
  it("守衛塞過值、離開欄位時原生 change 沒來 → 補發一次 change", () => {
    const { el, log } = mk('type="number" value=""');
    comp(el, "compositionstart", "");
    comp(el, "compositionend", "ㄚ");
    el.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
    expect(log).toEqual(["input:8", "change:8"]);
  });
  it("原生 change 已經來過就不重複", () => {
    const { el, log } = mk('type="number" value=""');
    comp(el, "compositionstart", "");
    comp(el, "compositionend", "ㄚ");
    el.dispatchEvent(new w.Event("change", { bubbles: true }));
    el.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
    expect(log).toEqual(["input:8", "change:8"]);
  });
});

describe("兩側都有掛、手機有數字鍵盤", () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  it("lantu-app.html 載入 numguard.js，且 amtKey 在組字中不重排", () => {
    expect(html).toContain('<script src="numguard.js"></script>');
    expect(html).toMatch(/function amtKey\(el\)\{\n if\(el\.__nfComp\)return;/);
  });
  it("React layout 用 next/script 載入同一支", () => {
    expect(layout).toContain('<Script src="/numguard.js"');
  });
  it("lantu-app.html 的 type=number 一律帶 inputmode（手機才會彈數字鍵盤）", () => {
    const bare = html.match(/<input[^>]*type="number"(?![^>]*inputmode=)[^>]*>/g) ?? [];
    expect(bare, bare.join("\n")).toEqual([]);
  });
});
