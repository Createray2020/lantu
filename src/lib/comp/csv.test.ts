import { describe, it, expect } from "vitest";
import { csvToObjects, normalizeDate, normalizeNumber, parseCsv, toCsv } from "./csv";
import { IMPORT_HEADERS, validateImport, type Peer } from "./importCases";
import { V4_MODULES } from "./preset";

describe("toCsv", () => {
  it("加上 BOM，否則 Excel 開中文會變亂碼", () => {
    expect(toCsv(["姓名"], [["王小明"]]).startsWith("﻿")).toBe(true);
  });

  it("含逗號、引號、換行的欄位會被正確包起來", () => {
    const csv = toCsv(["a"], [['他說 "好"'], ["含,逗號"], ["換\n行"]]);
    expect(csv).toContain('"他說 ""好"""');
    expect(csv).toContain('"含,逗號"');
    expect(csv).toContain('"換\n行"');
  });

  it("null／undefined 輸出空字串而不是 'null'", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toContain("\r\n,");
  });
});

describe("parseCsv", () => {
  it("往返一致：寫出去再讀回來要一樣", () => {
    const rows = [["王小明", '他說 "好"', "含,逗號"], ["李小華", "換\n行", ""]];
    const back = parseCsv(toCsv(["a", "b", "c"], rows));
    expect(back[0]).toEqual(["a", "b", "c"]);
    expect(back[1]).toEqual(rows[0]);
    expect(back[2]).toEqual(rows[1]);
  });

  it("吃掉 BOM 與尾端空行", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("csvToObjects 以表頭對應並修掉前後空白", () => {
    const { rows } = csvToObjects("a , b\r\n 1 , 2 ");
    expect(rows).toEqual([{ a: "1", b: "2" }]);
  });
});

describe("normalizeDate", () => {
  it("接受 ISO、斜線、點號與民國年", () => {
    expect(normalizeDate("2026-03-01")).toBe("2026-03-01");
    expect(normalizeDate("2026/3/1")).toBe("2026-03-01");
    expect(normalizeDate("2026.3.1")).toBe("2026-03-01");
    expect(normalizeDate("115/3/1")).toBe("2026-03-01"); // 民國 115 年
  });

  it("空字串是「沒填」而不是錯誤；看不懂的才回 null", () => {
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate("三月一日")).toBeNull();
  });
});

describe("normalizeNumber", () => {
  it("去掉千分位、貨幣符號與「元」", () => {
    expect(normalizeNumber("60,000")).toBe(60_000);
    expect(normalizeNumber("$60000")).toBe(60_000);
    expect(normalizeNumber("60000 元")).toBe(60_000);
  });

  it("認不出來回 null 而不是 0（0 是有意義的值）", () => {
    expect(normalizeNumber("六萬")).toBeNull();
    expect(normalizeNumber("")).toBeNull();
    expect(normalizeNumber("0")).toBe(0);
  });
});

describe("validateImport", () => {
  const peers: Peer[] = [
    { id: "c1", email: "a@x.com", name: "小陳", status: "active" },
    { id: "s2", email: "b@x.com", name: "阿凱", status: "active" },
    { id: "p9", email: "p@x.com", name: "待審", status: "pending" },
  ];
  const header = IMPORT_HEADERS.join(",");
  const line = (cols: string[]) => cols.join(",");

  it("正常一列：解析成可建立的案件輸入（金額含千分位時要照 CSV 規則加引號）", () => {
    const csv = [header, line(["王小明", "FULL", '"60,000"', "a@x.com", "a@x.com", "否", "2026/3/1", "", "", ""])].join("\n");
    const { rows } = validateImport(csv, peers, V4_MODULES);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].input).toMatchObject({
      clientName: "王小明", moduleCode: "FULL", fee: 60_000,
      executorId: "c1", promoterId: "c1", signedAt: "2026-03-01",
    });
  });

  it("缺表頭時整批擋下並指出缺哪些", () => {
    const { rows, missingHeaders } = validateImport("客戶姓名,顧問費\n王小明,60000", peers, V4_MODULES);
    expect(rows).toEqual([]);
    expect(missingHeaders).toContain("執案者Email");
  });

  it("逐列報錯：壞的那列 input 為 null，好的那列照樣可匯入", () => {
    const csv = [
      header,
      line(["", "FULL", "abc", "a@x.com", "zzz@x.com", "否", "", "", "", ""]),
      line(["李小華", "FULL", "30000", "a@x.com", "b@x.com", "否", "", "", "", ""]),
    ].join("\n");
    const { rows } = validateImport(csv, peers, V4_MODULES);
    expect(rows[0].input).toBeNull();
    expect(rows[0].errors).toEqual(expect.arrayContaining([
      "客戶姓名必填", "顧問費格式看不懂", expect.stringContaining("找不到顧問"),
    ]));
    expect(rows[1].input).not.toBeNull();
    expect(rows[0].line).toBe(2); // 第 1 列是表頭
  });

  it("未開通的顧問不能當執案者", () => {
    const csv = [header, line(["王小明", "FULL", "60000", "", "p@x.com", "否", "", "", "", ""])].join("\n");
    const { rows } = validateImport(csv, peers, V4_MODULES);
    expect(rows[0].errors.join()).toContain("尚未開通");
  });

  it("不存在的服務模塊擋下", () => {
    const csv = [header, line(["王小明", "GHOST", "60000", "a@x.com", "a@x.com", "否", "", "", "", ""])].join("\n");
    const { rows } = validateImport(csv, peers, V4_MODULES);
    expect(rows[0].errors.join()).toContain("找不到服務模塊");
  });

  it("金額沒加引號的千分位會被當成兩欄——錯誤訊息要看得懂，不能默默吃掉", () => {
    const csv = [header, line(["王小明", "FULL", "60,000", "a@x.com", "a@x.com", "否", "", "", "", ""])].join("\n");
    const { rows } = validateImport(csv, peers, V4_MODULES);
    expect(rows[0].input).toBeNull();
    expect(rows[0].errors.length).toBeGreaterThan(0);
  });

  it("公司派案時忽略推廣者欄位，不會因為填了不存在的 Email 而失敗", () => {
    const csv = [header, line(["王小明", "FULL", "60000", "zzz@x.com", "a@x.com", "是", "", "", "", ""])].join("\n");
    const { rows } = validateImport(csv, peers, V4_MODULES);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].input).toMatchObject({ isCompanyLead: true, promoterId: null });
  });

  it("推廣者留空＝自推自執", () => {
    const csv = [header, line(["王小明", "FULL", "60000", "", "b@x.com", "否", "", "", "", ""])].join("\n");
    const { rows } = validateImport(csv, peers, V4_MODULES);
    expect(rows[0].input).toMatchObject({ executorId: "s2", promoterId: "s2" });
  });
});
