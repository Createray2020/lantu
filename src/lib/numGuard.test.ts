import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 數字欄守衛（public/numguard.js）：注音輸入法開著也能直接在數字欄打數字。
 *
 * 三道保險各守一條：keydown 攔截（macOS）、compositionend 對應回數字（Windows）、
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
function key(el: HTMLInputElement, init: Record<string, unknown>) {
  const ev = new w.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(ev);
  return ev.defaultPrevented;
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

describe("keydown 攔截（macOS：輸入法把數字鍵接走）", () => {
  it("key=Process 的 Digit3 → 擋掉輸入法、塞 3、派 input", () => {
    const { el, log } = mk('type="text" inputmode="numeric" value="12"');
    el.focus();
    el.setSelectionRange(2, 2);
    expect(key(el, { code: "Digit3", key: "Process", keyCode: 229 })).toBe(true);
    expect(el.value).toBe("123");
    expect(log).toEqual(["input:123"]);
  });
  it("key 已經是注音符號也算被接走；插在游標處", () => {
    const { el } = mk('type="text" inputmode="decimal" value="19"');
    el.focus();
    el.setSelectionRange(1, 1);
    expect(key(el, { code: "Digit5", key: "ㄓ" })).toBe(true);
    expect(el.value).toBe("159");
  });
  it("key 本來就是數字（英數模式）不插手", () => {
    const { el, log } = mk('type="text" inputmode="numeric" value="1"');
    expect(key(el, { code: "Digit2", key: "2" })).toBe(false);
    expect(el.value).toBe("1");
    expect(log).toEqual([]);
  });
  it("有 Ctrl/Cmd、或非數字欄，不插手", () => {
    const a = mk('type="text" inputmode="numeric" value=""');
    expect(key(a.el, { code: "Digit1", key: "Process", metaKey: true })).toBe(false);
    const b = mk('type="text" value=""');
    expect(key(b.el, { code: "Digit1", key: "Process" })).toBe(false);
    expect(b.el.value).toBe("");
  });
  it("小數點鍵：金額欄擋掉不塞、decimal 欄塞「.」", () => {
    const a = mk('type="text" inputmode="numeric" value="1"');
    expect(key(a.el, { code: "Period", key: "ㄡ" })).toBe(true);
    expect(a.el.value).toBe("1");
    const b = mk('type="text" inputmode="decimal" value="1"');
    b.el.focus(); b.el.setSelectionRange(1, 1);
    key(b.el, { code: "Period", key: "ㄡ" });
    expect(b.el.value).toBe("1.");
  });
  it("type=number 也接得住（塞在尾端）", () => {
    const { el } = mk('type="number" value="4"');
    key(el, { code: "Numpad2", key: "Process", keyCode: 229 });
    expect(el.value).toBe("42");
  });
});

describe("compositionend 回填（Windows：輸入法在 keydown 前就吃掉按鍵）", () => {
  it("組字結束時用組字前的值 ＋ 對應後的數字重寫，並派 input", () => {
    const { el, log } = mk('type="text" inputmode="numeric" value="1,000"');
    el.focus();
    el.setSelectionRange(5, 5);
    el.dispatchEvent(new w.CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    expect(G.isComposing(el)).toBe(true);
    el.value = "1,000ㄅㄉ"; // 瀏覽器在組字期間把注音塞進欄位
    el.dispatchEvent(new w.CompositionEvent("compositionend", { bubbles: true, data: "ㄅㄉ" }));
    expect(G.isComposing(el)).toBe(false);
    expect(el.value).toBe("1,00012");
    expect(log).toEqual(["input:1,00012"]);
  });
  it("組出來全是非數字 → 清掉、值回到組字前", () => {
    const { el } = mk('type="text" inputmode="numeric" value="7"');
    el.focus(); el.setSelectionRange(1, 1);
    el.dispatchEvent(new w.CompositionEvent("compositionstart", { bubbles: true, data: "" }));
    el.value = "7你好";
    el.dispatchEvent(new w.CompositionEvent("compositionend", { bubbles: true, data: "你好" }));
    expect(el.value).toBe("7");
  });
});

describe("onchange 欄位不漏存", () => {
  it("守衛塞過值、離開欄位時原生 change 沒來 → 補發一次 change", () => {
    const { el, log } = mk('type="number" value=""');
    key(el, { code: "Digit8", key: "Process", keyCode: 229 });
    el.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
    expect(log).toEqual(["input:8", "change:8"]);
  });
  it("原生 change 已經來過就不重複", () => {
    const { el, log } = mk('type="number" value=""');
    key(el, { code: "Digit8", key: "Process", keyCode: 229 });
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
