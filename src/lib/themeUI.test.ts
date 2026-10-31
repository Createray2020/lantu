import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 深色／淺色主題的護欄。
 *
 * 這個功能會不會活下來，取決的不是「有沒有一顆切換鈕」，而是三件事——所以這裡釘的是那三件：
 *
 *   1. 顏色只有一個真相。任何人再寫一次 bg-[#0d2b45] 就等於在淺色版挖一個洞，
 *      而且**不會噴任何錯**，只會在切過去的時候看到一塊沒翻過來的深藍。
 *      ⚠️ 這正是改版前的狀態：2,565 處手打色碼、81 個不同 hex，同一個「次要文字」
 *         同時有 #a9bccf 和 #a7bacb。
 *   2. 兩套主題都要在 :root 定義完整。只定義在 [data-theme] 區塊裡的顏色，
 *      在屬性還沒掛上去的那一瞬間（首次繪製）等於不存在。
 *   3. 規劃器是獨立文件，父層的 CSS 變數進不去，只能靠 postMessage —— 那條線斷了
 *      會變成「外框是淺色、規劃器還是深色」，而且一樣不噴錯。
 */

const SRC = new URL("../", import.meta.url).pathname;
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const planner = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if ((p.endsWith(".tsx") || p.endsWith(".ts")) && !p.includes(".test.")) out.push(p);
  }
  return out;
}

describe("① 顏色只有一個真相", () => {
  it("src 底下沒有任何手打的 Tailwind 色碼（bg-[#…] / text-[#…]）", () => {
    const bad: string[] = [];
    for (const f of walk(SRC)) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/[\w-]+-\[(#[0-9a-fA-F]{3,8})\]/g)) {
        bad.push(`${f.replace(SRC, "src/")}：${m[0]}`);
      }
    }
    expect(bad, `改用 globals.css 的語意類名（bg-panel / text-tx2 / border-line）：\n${bad.join("\n")}`)
      .toEqual([]);
  });

  it("除了 canvas 產圖與靜態中繼資料，字串裡也不留色碼", () => {
    // canvas 的 fillStyle 解析不了 CSS 變數；manifest / viewport.themeColor 是靜態值。
    // engine.ts 的 c/cl 是「畫面／列印」兩套印刷色，不屬於介面主題。
    // ThemeToggle 要寫 <meta name="theme-color"> 的實際值——那個標籤吃不到 var()。
    const allow = ["app/manifest.ts", "app/layout.tsx", "admin/BrandSettings.tsx",
                   "profile/PhotoCropper.tsx", "lib/engine.ts", "components/ThemeToggle.tsx"];
    const bad: string[] = [];
    for (const f of walk(SRC)) {
      if (allow.some((a) => f.includes(a))) continue;
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/["'](#[0-9a-fA-F]{6})["']/g)) bad.push(`${f.replace(SRC, "src/")}：${m[1]}`);
    }
    expect(bad, `改用 var(--token)：\n${bad.join("\n")}`).toEqual([]);
  });
});

describe("② 兩套主題都完整", () => {
  // ⚠️ 用 "\n:root {" 而不是 ":root {"：檔頭的說明註解裡也提到這兩個選擇器，
  //    直接 indexOf 會切到註解、切出空字串，而測試會以「什麼都沒找到」的形式假通過。
  const lightAt = css.indexOf('\n:root[data-theme="light"] {');
  const root = css.slice(css.indexOf("\n:root {"), lightAt);
  const light = css.slice(lightAt, css.indexOf("\n@theme inline {"));

  it("深色在裸 :root 定義（沒有 data-theme 屬性時畫面仍然完整）", () => {
    for (const t of ["--canvas", "--panel", "--field", "--line", "--tx", "--tx2", "--brand", "--danger"]) {
      expect(root, `${t} 沒有在裸 :root 定義`).toContain(`${t}:`);
    }
  });

  it("淺色把每一個 token 都覆寫掉——漏掉的那個會在淺色版留一塊深色", () => {
    const names = [...root.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1])
      .filter((n) => n !== "--ui-scale");
    const missing = names.filter((n) => !new RegExp(`\\${n}:`).test(light));
    expect(missing, `淺色沒有覆寫：${missing.join(", ")}`).toEqual([]);
  });

  it("兩套都宣告 color-scheme（不然捲軸與原生下拉不會跟著換）", () => {
    expect(root).toContain("color-scheme: dark");
    expect(light).toContain("color-scheme: light");
  });

  it("邊框不是半透明白——那在淺底上會整片消失", () => {
    expect(root).toMatch(/--line:\s*#/);
    expect(css).not.toMatch(/--line:\s*rgba\(255,\s*255,\s*255/);
  });
});

/* 2026/10/27 Ray：「淺色版色塊跟文字對比不夠，看得很糊」。真因是 --amber2（規劃器用最多的強調色）
   白底只有 2.9:1、--mut2 3.9:1。這裡把兩份淺色 token 的文字色釘在 WCAG AA（白面板 ≥4.5:1），
   而且規劃器與 globals.css 同一個語意要同一個值，不然外框與規劃器兩種金。 */
describe("②b 淺色文字 token 讀得到（白底 ≥4.5:1）", () => {
  const lum = (hex: string) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const tokensOf = (block: string) => Object.fromEntries([...block.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));

  const cssLight = tokensOf(css.slice(css.indexOf('\n:root[data-theme="light"] {'), css.indexOf("\n@theme inline {")));
  const style = planner.slice(0, planner.indexOf("</style>"));
  const pl0 = style.indexOf(':root[data-theme="light"]{');
  const plLight = tokensOf(style.slice(pl0, style.indexOf("}", pl0)));

  it("globals.css 淺色：tx/tx2/tx3/brand/brand2/ok/warn/danger/info/teal 在白面板上 ≥4.5:1", () => {
    const bad = ["--tx", "--tx2", "--tx3", "--brand", "--brand2", "--ok", "--warn", "--danger", "--info", "--teal"]
      .map((k) => [k, ratio(cssLight[k], cssLight["--panel"])] as const)
      .filter(([, r]) => r < 4.5).map(([k, r]) => `${k} ${r.toFixed(2)}`);
    expect(bad, bad.join(", ")).toEqual([]);
  });

  it("規劃器淺色：tx/mut/mut2/amber/amber2/ok/warn/danger/gap2/teal/blue 在白面板上 ≥4.5:1", () => {
    const bad = ["--tx", "--mut", "--mut2", "--amber", "--amber2", "--ok", "--warn", "--danger", "--gap2", "--teal", "--blue"]
      .map((k) => [k, ratio(plLight[k], plLight["--panel"])] as const)
      .filter(([, r]) => r < 4.5).map(([k, r]) => `${k} ${r.toFixed(2)}`);
    expect(bad, bad.join(", ")).toEqual([]);
  });

  it("兩份淺色 token 同一個語意同一個值（外框與規劃器不能兩種金）", () => {
    const pairs: [string, string][] = [["--tx", "--tx"], ["--tx2", "--mut"], ["--tx3", "--mut2"], ["--brand", "--amber"], ["--brand2", "--amber2"], ["--ok", "--ok"], ["--warn", "--warn"], ["--danger", "--danger"], ["--panel", "--panel"]];
    for (const [a, b] of pairs) expect(plLight[b], `${a} ↔ ${b}`).toBe(cssLight[a]);
  });

  it("拉桿旁的數字框不再寫死深底（淺色版會變成深底深字）", () => {
    expect(planner).not.toContain("background:#0b2136");
  });
});

describe("③ 規劃器（獨立文件）也跟得上", () => {
  let w: never & { [k: string]: never };

  beforeAll(async () => {
    const dom = new JSDOM(planner, { runScripts: "dangerously", url: "https://lantu.test/" });
    w = dom.window as never;
    await new Promise<void>((r) => (w as never as Window).addEventListener("load", () => r(), { once: true }));
  });

  it("有淺色覆寫區塊，且邊框改成實色", () => {
    const style = planner.slice(0, planner.indexOf("</style>"));
    expect(style).toContain(':root[data-theme="light"]');
    expect(style).not.toMatch(/--line:rgba\(255,255,255/);
  });

  it("applyTheme 會換屬性，色盤跟著重讀（2026/11/01 起預設淺色）", () => {
    const win = w as never as { applyTheme: (t: string) => void; TPAL: Record<string, string>; document: Document };
    // 預設淺色：文件一載入 <html> 就帶 data-theme="light"（父層還沒送 lantu:theme 前也不會先閃深色）。
    expect(win.document.documentElement.getAttribute("data-theme")).toBe("light");
    const light = win.TPAL.panel;
    win.applyTheme("dark");
    // 深色＝不掛屬性（裸 :root 就是完整的深色版）。
    expect(win.document.documentElement.getAttribute("data-theme")).toBe(null);
    expect(win.TPAL.panel).not.toBe(light);
    win.applyTheme("light");
    expect(win.document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(win.TPAL.panel).toBe(light);
  });

  it("父層的 lantu:theme 與 lantu:init 都接得到", () => {
    expect(planner).toContain("m.type==='lantu:theme'");
    expect(planner).toContain("if(m.theme)applyTheme(m.theme)");
  });

  it("圖表色改讀色盤，不再是寫死的 dark?'#…'", () => {
    expect(planner).not.toMatch(/dark\?'#[0-9a-fA-F]{3,8}'/);
  });
});

describe("④ 切換鈕掛在教練走得到的地方", () => {
  it("三端共用頂欄的頭像選單有主題切換，並且每頁都同步帳號設定（2026/11/01）", () => {
    // 頂欄改版後切換鈕收進頭像選單；平常不掛載，所以「帳號設定蓋回本機」改由頂欄常駐的 useThemeSync 做。
    expect(readFileSync(join(SRC, "components/shell/AccountMenu.tsx"), "utf8")).toContain("<ThemeToggle");
    expect(readFileSync(join(SRC, "components/shell/ShellBar.tsx"), "utf8")).toContain("useThemeSync(theme, persist)");
    for (const f of ["app/dashboard/DashboardHeader.tsx", "app/admin/AdminHeader.tsx", "app/portal/page.tsx"]) {
      expect(readFileSync(join(SRC, f), "utf8"), `${f} 沒有用共用頂欄`).toContain("ShellBar");
    }
    expect(readFileSync(join(SRC, "components/DisplayPrefsFab.tsx"), "utf8")).toContain("ThemeToggle");
  });

  it("官網仍用側邊懸浮鈕（2026/09/25），頂欄不直接放切換", () => {
    const src = readFileSync(join(SRC, "components/LandingView.tsx"), "utf8");
    expect(src).toContain("<DisplayPrefsFab />");
    expect(src).not.toContain("<ThemeToggle");
  });

  it("三支 iframe 容器都把主題灌進規劃器", () => {
    for (const f of ["app/dashboard/plans/[planId]/edit/PlanEditor.tsx",
                     "components/TemplateFrame.tsx", "app/portal/plan/ClientPlanFrame.tsx"]) {
      expect(readFileSync(join(SRC, f), "utf8"), `${f} 的 lantu:init 沒帶 theme`).toContain("theme: currentTheme()");
    }
  });

  it("登入者的選擇會寫回帳號（換裝置才記得住）", () => {
    expect(readFileSync(join(SRC, "app/themeAction.ts"), "utf8")).toContain("coaches");
    expect(readFileSync(join(SRC, "Shared/db/schema.ts"), "utf8")).toContain("theme: text('theme')");
  });
});

describe("⑤ 那三頁不再沒有導覽列", () => {
  it("我的業務／我的公開檔案／業務制度說明都走共用頂欄，容器也置中", () => {
    for (const f of ["app/dashboard/my-business/page.tsx", "app/dashboard/profile/page.tsx",
                     "app/dashboard/handbook/page.tsx"]) {
      const s = readFileSync(join(SRC, f), "utf8");
      expect(s, `${f} 沒有共用頂欄`).toContain("<DashboardHeader {...hp} />");
      expect(s, `${f} 的內容沒有置中`).toMatch(/max-w-\w+ mx-auto/);
    }
  });
});
