import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { ASSISTANT_ARRAYS, registeredKeys } from "./assistantFields";

/**
 * 助理欄位註冊表 vs 規劃器資料結構的 drift 守門。
 *
 * 註冊表是手寫的（收支資債四張表與保單表不走共用 tableSec，沒有可機器讀的欄位定義），
 * 所以用這支測試把它釘在兩個「資料結構的真相」上：
 *   1. addRow() 的新列範本 TPL —— 每個陣列有哪些 key。
 *   2. sampleCase().profile —— profile 有哪些 key。
 * 註冊表裡的 key 必須存在於範本；範本有、註冊表沒有的 key 只列出來（不紅），
 * 因為「還沒開放給助理」是合法狀態。要紅的是「助理會往不存在的欄位寫」。
 */
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

/** 從 addRow 的 TPL 區塊抓出 arr → keys。 */
function templateKeys(): Record<string, string[]> {
  const start = HTML.indexOf("function addRow(arr)");
  expect(start).toBeGreaterThan(0);
  const end = HTML.indexOf("var mk=TPL[arr];", start);
  expect(end).toBeGreaterThan(start);
  const block = HTML.slice(start, end);
  const out: Record<string, string[]> = {};
  // 一列一個範本：`name:function(){return {k:v,...}}`（companies 是 newCompany()，沒有 literal，略過）
  const re = /^\s*([A-Za-z_]\w*):function\(\)\{(?:[^{}]*?)return \{([\s\S]*?)\}\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const keys = Array.from(m[2].matchAll(/(?:^|,)\s*([A-Za-z_]\w*):/g)).map((x) => x[1]);
    out[m[1]] = keys;
  }
  return out;
}

function profileKeys(): string[] {
  const m = HTML.match(/^\s*profile:\{([^}]*)\}/m);
  expect(m).not.toBeNull();
  return Array.from(m![1].matchAll(/(?:^|,)\s*([A-Za-z_]\w*):/g)).map((x) => x[1]);
}

describe("assistantFields 註冊表釘在規劃器資料結構上", () => {
  const tpl = templateKeys();
  const reg = registeredKeys();

  it("TPL 解析得到首波七個陣列", () => {
    for (const arr of ["members", "incomes", "expenses", "assets", "liabilities", "policies", "goals"]) {
      expect(tpl[arr], arr).toBeDefined();
      expect(tpl[arr].length, arr).toBeGreaterThan(3);
    }
  });

  it("每個登記的欄位都存在於 addRow 範本或 CAT_FIELDS（助理不會往不存在的欄位寫）", () => {
    // 細類欄（subCat／subType）不在新列範本裡，是 setCat() 第一次選細類時才長出來的，
    // 它們的真相在 CAT_FIELDS。
    const cf = /var CAT_FIELDS=\{([^\n]*)\};/.exec(HTML)!;
    const catKeys = Array.from(cf[1].matchAll(/(?:sub|parent):'(\w+)'/g)).map((x) => x[1]);
    // 目標表走共用 tableSec，欄位真相是 GOAL_COLS（minPresent／latest 不在新列範本裡，第一次填才長出來）。
    const gc = /var GOAL_COLS=\[([\s\S]*?)\];/.exec(HTML)!;
    const goalKeys = Array.from(gc[1].matchAll(/\['(\w+)',/g)).map((x) => x[1]);
    for (const a of ASSISTANT_ARRAYS) {
      if (a.kind !== "list") continue;
      const have = new Set([
        ...(tpl[a.arr] ?? []),
        ...(a.fields.some((f) => f.cats) ? catKeys : []),
        ...(a.arr === "goals" ? goalKeys : []),
      ]);
      const missing = reg[a.arr].filter((k) => !have.has(k));
      expect(missing, `${a.arr} 登記了範本沒有的欄位`).toEqual([]);
    }
  });

  it("profile 登記的欄位都存在於 sampleCase().profile", () => {
    const have = new Set(profileKeys());
    const missing = reg.profile.filter((k) => !have.has(k));
    expect(missing, "profile 登記了不存在的欄位").toEqual([]);
  });

  it("protectedWhen 指到的 key 是規劃器真的在用的旗標", () => {
    for (const a of ASSISTANT_ARRAYS) {
      for (const k of a.protectedWhen ?? []) {
        // salaryAuto／premAuto／nhiAuto／tag 都在頁面裡被讀來鎖列
        expect(HTML.includes(`x.${k}`) || HTML.includes(`.${k}`), `${a.arr}.${k}`).toBe(true);
      }
    }
  });

  it("每個 tab 都是規劃器真的有的子分頁", () => {
    for (const a of ASSISTANT_ARRAYS) {
      expect(HTML.includes(`'${a.tab}'`), `dataTab ${a.tab}`).toBe(true);
    }
  });

  it("固定選項與頁面一致（險種細分／繳別／關係／工作類別／保單狀態）", () => {
    const sub = /var POLICY_SUB=\{\s*'人身':\[([^\]]*)\],\s*'產物':\[([^\]]*)\]/.exec(HTML);
    expect(sub).not.toBeNull();
    const pageSub = (sub![1] + "," + sub![2]).split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
    const regSub = ASSISTANT_ARRAYS.find((a) => a.arr === "policies")!.fields.find((f) => f.key === "subtype")!.options!;
    // 「其他」兩邊各一個，去重後比
    expect(Array.from(new Set(regSub)).sort()).toEqual(Array.from(new Set(pageSub)).sort());

    const pm = /var PAY_MODES=\[([^\]]*)\]/.exec(HTML)!;
    expect(ASSISTANT_ARRAYS.find((a) => a.arr === "policies")!.fields.find((f) => f.key === "payMode")!.options)
      .toEqual(pm[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")));

    const roles = /var TREE_ROLES=\[([^\]]*)\]/.exec(HTML)!;
    const regRoles = ASSISTANT_ARRAYS.find((a) => a.arr === "members")!.fields.find((f) => f.key === "role")!.options!;
    expect(regRoles.filter((r) => r !== "本人")).toEqual(roles[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")));

    const jobs = /var JOB_TYPES=\[([^\]]*)\]/.exec(HTML)!;
    expect(ASSISTANT_ARRAYS.find((a) => a.arr === "profile")!.fields.find((f) => f.key === "jobType")!.options)
      .toEqual(jobs[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")));

    const st = /var POLICY_STATUS=\[([^\]]*)\]/.exec(HTML)!;
    expect(ASSISTANT_ARRAYS.find((a) => a.arr === "policies")!.fields.find((f) => f.key === "status")!.options)
      .toEqual(st[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")));
  });

  it("細類欄位一律走 setCat（否則大類與 risk／cls／consumerDebt 不會連動）", () => {
    for (const a of ASSISTANT_ARRAYS) {
      for (const f of a.fields) {
        if (f.cats) expect(f.via, `${a.arr}.${f.key}`).toBe("cat");
      }
    }
  });

  it("還沒開放給助理的範本欄位（資訊，不紅）", () => {
    const unregistered: string[] = [];
    for (const a of ASSISTANT_ARRAYS) {
      if (a.kind !== "list") continue;
      const got = new Set(reg[a.arr]);
      for (const k of tpl[a.arr] ?? []) if (!got.has(k)) unregistered.push(`${a.arr}.${k}`);
    }
    expect(Array.isArray(unregistered)).toBe(true);
  });
});
