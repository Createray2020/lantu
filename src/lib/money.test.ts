import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  fmtMoney, fmtMoney0, fmtNTD, fmtWan, fmtCompact,
  amtFmt, amtRaw, parseMoney, amtCaret,
} from "./money";

describe("金額格式的標準規格", () => {
  it("整數千分位，不留小數", () => {
    expect(fmtMoney(1200000)).toBe("1,200,000");
    expect(fmtMoney(48000)).toBe("48,000");
    expect(fmtMoney(999)).toBe("999");
    expect(fmtMoney(1000)).toBe("1,000");
    expect(fmtMoney(1234.6)).toBe("1,235"); // 四捨五入到元
    expect(fmtMoney(0)).toBe("0");
  });

  it("負數的逗號從第一位數字之後才開始補", () => {
    expect(fmtMoney(-1234567)).toBe("-1,234,567");
    expect(fmtMoney(-999)).toBe("-999");
  });

  it("「沒有資料」與「真的是 0」不能混為一談", () => {
    expect(fmtMoney(null)).toBe("—");
    expect(fmtMoney(undefined)).toBe("—");
    expect(fmtMoney("")).toBe("—");
    expect(fmtMoney(NaN)).toBe("—");
    // Infinity 不擋的話會把 "Infinity" 原字串印到畫面上（月數 0 的貸款試算）
    expect(fmtMoney(Infinity)).toBe("—");
    expect(fmtMoney0(null)).toBe("0");
  });

  it("已經帶逗號或「元」的字串再進來一次也不會壞", () => {
    expect(fmtMoney("1,200,000")).toBe("1,200,000");
    expect(fmtMoney("1200000 元")).toBe("1,200,000");
  });

  it("fmtNTD 帶前綴、fmtWan 換算成萬且一樣有千分位", () => {
    expect(fmtNTD(1200000)).toBe("NT$1,200,000");
    expect(fmtNTD(null)).toBe("—");
    expect(fmtWan(12340000)).toBe("1,234"); // 破千萬的房貸
    expect(fmtWan(480000)).toBe("48");
    expect(fmtWan(null)).toBe("—");
  });

  it("fmtCompact 給圖表軸用（億／萬）", () => {
    expect(fmtCompact(250000000)).toBe("2.5億");
    expect(fmtCompact(1200000)).toBe("120萬");
    expect(fmtCompact(150000000000)).toBe("1500億");
    expect(fmtCompact(3000)).toBe("3,000");
    expect(fmtCompact(-1200000)).toBe("-120萬");
  });
});

describe("金額輸入欄", () => {
  it("amtFmt 補逗號、amtRaw 拆掉（送進引擎的仍是純數字）", () => {
    expect(amtFmt("1200000")).toBe("1,200,000");
    expect(amtFmt(48000)).toBe("48,000");
    expect(amtFmt("")).toBe("");
    expect(amtFmt("abc")).toBe("");
    expect(amtFmt("-1200")).toBe("-1,200");
    expect(amtFmt("0012")).toBe("12"); // 前導 0 吃掉
    expect(amtRaw("1,200,000")).toBe("1200000");
  });

  it("parseMoney 是唯一該用來取值的入口——Number('1,200') 會是 NaN", () => {
    expect(Number("1,200")).toBeNaN(); // 這就是靜默變 0 的來源
    expect(parseMoney("1,200,000")).toBe(1200000);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney(null)).toBe(0);
    expect(parseMoney("abc")).toBe(0);
  });

  it("邊打邊格式化時游標留在原本那個數字上", () => {
    // "1234|567" → 補逗號後應是 "1,234|,567"（游標仍在第 4 位數之後）
    const r = amtCaret("1234567", 4);
    expect(r.value).toBe("1,234,567");
    expect(r.value.slice(0, r.caret).replace(/[^\d]/g, "")).toBe("1234");
  });

  it("已經是格式化好的字串就不動游標", () => {
    expect(amtCaret("1,234", 5)).toEqual({ value: "1,234", caret: 5 });
  });
});

describe("防漂移：格式化不要再各自為政", () => {
  const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

  it("lantu-app.html 的 fmt/amtFmt 與 money.ts 用同一套 regex", () => {
    // 那個檔案不經打包、沒辦法 import money.ts，只能靠對拍。
    expect(HTML).toContain("v.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g,',')");
    expect(HTML).toContain("function amtRaw(v){return String(v==null?'':v).replace(/,/g,'');}");
  });

  it("cfAxis（圖表軸）兩邊行為一致", () => {
    const m = HTML.match(/function cfAxis\(v\)\{([\s\S]*?)\n/);
    expect(m).toBeTruthy();
    // 億以上一位小數、萬以上取整——與 fmtCompact 相同的門檻
    expect(m![1]).toContain("1e8");
    expect(m![1]).toContain("1e4");
  });

  it("src 底下不應再出現私有的 fmtMoney 實作", () => {
    // 2026/08 盤點時有 14 支各自為政的格式化函式（兩支同名 fmtMoney 實作不同）。
    // 收斂之後只剩 money.ts 一支真的實作，其餘是 re-export。
    const files = [
      "../app/dashboard/format.ts",
      "./comp/view.ts",
    ];
    for (const f of files) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src).toContain('from "@/lib/money"');
      expect(src).not.toMatch(/function fmtMoney\s*\(/);
    }
  });

  it("CSV 匯出與匯入範本必須維持裸值（加了逗號會壞掉來回路徑）", () => {
    const csv = readFileSync(new URL("./comp/csv.ts", import.meta.url), "utf8");
    // 解析端主動剝逗號 ⇒ 產生端就不能加
    expect(csv).toMatch(/replace\(\/\[,\$＄\\s元\]\/g/);
    expect(csv).not.toContain('from "@/lib/money"');
    const tpl = readFileSync(new URL("./comp/importCases.ts", import.meta.url), "utf8");
    expect(tpl).toContain('"60000"'); // 回填範本的顧問費欄
  });
});

describe("MoneyInput（React 側的金額欄）", () => {
  it("渲染成 text + inputmode，值帶逗號", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const MoneyInput = (await import("@/components/MoneyInput")).default;
    const html = renderToStaticMarkup(
      createElement(MoneyInput, { value: 1200000, onChange: () => {} }),
    );
    expect(html).toContain('type="text"');
    expect(html).toMatch(/inputmode="numeric"/i); // renderToStaticMarkup 保留 camelCase
    expect(html).toContain('value="1,200,000"');
    expect(html).not.toContain('type="number"');
  });

  it("null 顯示空白（allowEmpty 的「未設定」語意）", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const MoneyInput = (await import("@/components/MoneyInput")).default;
    const html = renderToStaticMarkup(
      createElement(MoneyInput, { value: null, onChange: () => {}, allowEmpty: true, placeholder: "未設定" }),
    );
    expect(html).toContain('placeholder="未設定"');
    expect(html).not.toMatch(/value="[^"]+"/);
  });
});
