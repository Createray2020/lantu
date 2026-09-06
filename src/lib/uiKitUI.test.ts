import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * 共用元件層的護欄。
 *
 * 這一輪把「同一件事在每支檔案各寫一次」的四樣東西收成單一真相：
 * 輸入框、彈窗、確認框、送出鈕。護欄要釘的不是「元件存在」，而是
 * 「沒有人再繞過它」——因為繞過去完全不會噴錯，只會慢慢長回 22 種寫法。
 */

const SRC = new URL("../", import.meta.url).pathname;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ((p.endsWith(".tsx") || p.endsWith(".ts")) && !p.includes(".test.")) out.push(p);
  }
  return out;
}
const FILES = walk(SRC);
const rel = (f: string) => f.replace(SRC, "src/");

describe("① 表單控制項只有一份定義", () => {
  it("沒有人再自己宣告一份輸入框樣式", () => {
    // 改版前 22 支檔案各自宣告 const field / INPUT / inputCls…，
    // 圓角在 rounded / rounded-md / rounded-lg 之間跳、底色四種、focus 有的有有的沒有。
    const bad: string[] = [];
    for (const f of FILES) {
      if (f.includes("components/ui/Field")) continue;
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/const \w+ =\s*\n?\s*"[^"]*\bbg-(?:field|panel|panel2)\b[^"]*\bborder\b[^"]*"/g)) {
        bad.push(`${rel(f)}：${m[0].slice(0, 60)}…`);
      }
    }
    expect(bad, `改用 components/ui/Field 的 FIELD / FIELD_SM / SELECT_SM：\n${bad.join("\n")}`).toEqual([]);
  });
});

describe("② 確認框不用瀏覽器原生的", () => {
  it("全站沒有 confirm() / alert()", () => {
    // ⚠️ 原生對話框**完全不受 --ui-scale 影響**：把介面調成「特大」的老花使用者，
    //    在「要不要刪掉這筆」這一步看到的還是系統預設字級。它也套不到深／淺主題。
    const bad: string[] = [];
    for (const f of FILES) {
      if (f.includes("components/ui/confirm")) continue;
      const s = readFileSync(f, "utf8");
      // PhotoCropper 有一個叫 confirm 的區域函式，那不是原生對話框
      if (/\bfunction confirm\s*\(/.test(s)) continue;
      if (/(?<![.\w])(?:window\.)?(?:confirm|alert)\s*\(/.test(s)) bad.push(rel(f));
    }
    expect(bad, `改用 confirmDialog()：\n${bad.join("\n")}`).toEqual([]);
  });
});

describe("③ 彈窗都走共用殼", () => {
  it("沒有人再手刻 fixed inset-0 的對話框", () => {
    // 手刻的那四個都缺 role="dialog"、焦點管理，三個連 Esc 都關不掉。
    // 全螢幕的規劃器外框（PlannerFrame / PlanEditor / TemplateFrame / ClientPlanFrame）
    // 不是對話框，是整頁版面，所以排除。
    const allow = ["PlannerFrame", "PlanEditor", "TemplateFrame", "ClientPlanFrame", "components/ui/Modal"];
    const bad: string[] = [];
    for (const f of FILES) {
      if (allow.some((a) => f.includes(a))) continue;
      const s = readFileSync(f, "utf8");
      if (/fixed inset-0[^"]*\bz-\d/.test(s) && !s.includes("components/ui/Modal")) bad.push(rel(f));
    }
    expect(bad, `改用 <Modal>：\n${bad.join("\n")}`).toEqual([]);
  });

  it("共用殼把三件事都做齊（少一件都不會噴錯）", () => {
    const s = readFileSync(join(SRC, "components/ui/Modal.tsx"), "utf8");
    expect(s, "缺 role=dialog").toContain('role="dialog"');
    expect(s, "缺 aria-modal").toContain('aria-modal="true"');
    expect(s, "缺 Esc 關閉").toContain('"Escape"');
    expect(s, "缺焦點歸還").toContain("returnTo.current?.focus");
  });
});

describe("④ 字級只從量表挑", () => {
  it("沒有半像素階，也沒有和具名尺寸重複的 arbitrary 值", () => {
    // 11.5 / 12.5 / 13.5 在螢幕上看不出差別；text-[12px] 和 text-xs 是同一個尺寸兩套寫法。
    const banned = /text-\[(?:\d+\.5px|12px|14px|16px|18px|9px|10px|11px|13px|15px)\]/g;
    const bad: string[] = [];
    for (const f of FILES) {
      for (const m of readFileSync(f, "utf8").matchAll(banned)) bad.push(`${rel(f)}：${m[0]}`);
    }
    expect(bad, `改用量表：text-10 / text-11 / text-xs / text-13 / text-sm / text-15 / …\n${bad.join("\n")}`)
      .toEqual([]);
  });
});

describe("⑤ 後台只剩一套設計系統", () => {
  it("藍色不再當主要動作色（那是「唯讀／共同執案」的狀態語意）", () => {
    const bad: string[] = [];
    for (const f of FILES.filter((x) => x.includes("/admin/"))) {
      const s = readFileSync(f, "utf8");
      if (/bg-info-solid|accent-info-solid/.test(s)) bad.push(rel(f));
    }
    expect(bad, `後台主要動作一律用品牌金：\n${bad.join("\n")}`).toEqual([]);
  });
});

describe("⑥ 規劃器的層級與量表", () => {
  const planner = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const style = planner.slice(0, planner.indexOf("</style>"));

  it("z-index 是一道階梯，不是 12 個各自想出來的數字", () => {
    const vals = [...planner.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]));
    const off = [...new Set(vals)].filter((v) => v % 10 !== 0);
    expect(off, `這些沒有落在十階上：${off.join(", ")}`).toEqual([]);
  });

  it("圓角收成四階", () => {
    const radii = new Set([...style.matchAll(/border-radius:(\d+)px/g)].map((m) => m[1]));
    expect([...radii].sort((a, b) => +a - +b)).toEqual(["4", "8", "12", "999"].sort((a, b) => +a - +b));
  });

  it("沒有半像素字級", () => {
    const half = [...new Set([...style.matchAll(/font-size:([\d.]+)px/g)].map((m) => m[1]))]
      .filter((v) => v.includes("."));
    expect(half, `半像素階：${half.join(", ")}`).toEqual([]);
  });

  it("規劃參數分成三組，不再是 13 個欄位倒進同一格網格", () => {
    expect(planner).toContain("成長假設");
    expect(planner).toContain("模擬設定");
    expect(style).toContain(".pgrp");
  });

  it("鍵盤焦點看得見，而且沒有人再把它關掉", () => {
    expect(style).toContain(":focus-visible");
    expect(style, "還有 outline:none 沒補回焦點樣式").not.toMatch(/:focus\{outline:none/);
  });
});
