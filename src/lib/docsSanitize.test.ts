import { describe, it, expect } from "vitest";
import { sanitizeTemplateHtml } from "./docsSanitize";
import { renderTemplate } from "./docs";

/** 2026/10/28 稽核列出的繞過寫法，一個都不能過。 */
describe("範本 HTML 白名單消毒", () => {
  const bad = [
    `<a href="javascript:alert('1')">x</a>`,
    `<svg/onload=alert(1)>`,
    `<img src="x"/onerror=alert(1)>`,
    `<button formaction="javascript:alert(1)">b</button>`,
    `<base href="https://evil/">`,
    `<a href="&#106;avascript:alert(1)">y</a>`,
    `<a href="java&#9;script:alert(1)">z</a>`,
    `<p style="background:url(javascript:x)">p</p>`,
    `<iframe src="https://evil"></iframe><script>alert(1)</script><link rel=stylesheet href=//evil>`,
  ];
  it("主動內容全部拿掉", () => {
    for (const b of bad) {
      const out = sanitizeTemplateHtml(b);
      expect(out, b).not.toMatch(/javascript:|onload|onerror|formaction|<base|<script|<iframe|<link|url\(/i);
    }
  });
  it("合約會用到的結構留著：標題、段落、表格、樣式白名單、PNG data 圖、佔位符", () => {
    const ok = `<h1>{{title}}</h1><p style="text-align:center;font-weight:bold">{{member.name}} {{sign:member:1}}</p><table><tr><td colspan="2">x</td></tr></table>{{seal}}<img src="data:image/png;base64,iVBORw0KGgo=" class="doc-seal">`;
    const out = sanitizeTemplateHtml(ok);
    expect(out).toContain("<h1>{{title}}</h1>");
    expect(out).toContain('style="text-align:center;font-weight:bold"');
    expect(out).toContain('colspan="2"');
    expect(out).toContain("{{sign:member:1}}");
    expect(out).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(sanitizeTemplateHtml(`<img src="https://x/y.png">`)).not.toContain("https://x");
  });
  it("消毒後再渲染，簽名位與印鑑照常長出來", () => {
    const html = renderTemplate({ html: sanitizeTemplateHtml(`<p>{{sign:client:1}}</p><a href="javascript:x">k</a>`), signers: [{ role: "client", seq: 1 }], useSeal: false }, {});
    expect(html).toContain('data-slot="client:1"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<span>k</span>");
  });
});
