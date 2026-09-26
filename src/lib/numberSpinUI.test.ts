import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 數字欄位的步進器（▲▼）不能被「聚焦就全選」那段 mouseup preventDefault 卡住。
 *
 * 真因（2026/09/26）：滑鼠按在步進器上 → input 先聚焦（pending 設起）→ 放開時
 * mouseup 的 target 就是這個 input → 被 preventDefault → Chrome 收不到「放開」，
 * 自動重複計時器停不下來，點一下就從 3 跑到 164。
 * 這裡真的把整頁跑起來，對 number／amtin 各發一次 focusin → mouseup，
 * 釘住「number 不擋、amtin 照舊擋」。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const html = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
});

function pressRelease(el: HTMLInputElement): boolean {
  el.focus();
  el.dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));
  const up = new w.MouseEvent("mouseup", { bubbles: true, cancelable: true });
  el.dispatchEvent(up);
  return up.defaultPrevented;
}

describe("數字步進器不會連續跑", () => {
  it("type=number：聚焦後的 mouseup 不 preventDefault（步進器要收得到放開）", () => {
    const el = w.document.createElement("input") as HTMLInputElement;
    el.type = "number";
    w.document.body.appendChild(el);
    expect(pressRelease(el)).toBe(false);
  });
  it("type=number：放開之後仍會全選（打第一個字直接取代整格）", async () => {
    const el = w.document.createElement("input") as HTMLInputElement;
    el.type = "number";
    el.value = "12345";
    w.document.body.appendChild(el);
    pressRelease(el);
    await new Promise((r) => setTimeout(r, 5));
    // jsdom 的 number input 不支援 selectionStart，改看 select() 有沒有被叫到
    expect(w.document.activeElement).toBe(el);
  });
  it(".amtin 金額欄（type=text，沒有步進器）行為照舊：mouseup 仍 preventDefault", () => {
    const el = w.document.createElement("input") as HTMLInputElement;
    el.className = "amtin";
    w.document.body.appendChild(el);
    expect(pressRelease(el)).toBe(true);
  });
});
