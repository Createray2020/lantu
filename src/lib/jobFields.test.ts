import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 工作三欄：公司名稱 / 職務 / 工作摘要（2026/08/24 Ray 要求）。
 *
 * 為什麼要有測試：這三欄不進任何計算，所以壞掉不會有任何數字對不上，
 * 只會安靜地存不進去。而它們正是「三個月後回頭看，這位客戶是誰」的唯一線索。
 *
 * 釘住三件事：
 *   ① 舊資料（沒有這三個 key）補得起來，而且公司名稱允許留空
 *   ② 本人存在 c.profile、其他賺薪成員存在 members[i] —— 跟 jobType 同一套規矩
 *   ③ 存檔時不整頁 render（自由輸入欄，重繪會把游標踢掉）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;
const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");

beforeAll(async () => {
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
  w.app.activeTab = "data";
  w.app.dataTab = "family";
});
function fresh() {
  const c = w.migrateCase(w.sampleCase());
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.render();
  return c;
}
const pane = () => w.document.querySelector("#app").innerHTML as string;

describe("工作三欄", () => {
  it("舊資料補得起來，三欄預設空字串（公司名稱可以一直空著）", () => {
    const c = fresh();
    delete c.profile.jobCompany;
    delete c.profile.jobTitle;
    delete c.profile.jobNote;
    w.ensureJobFields(c);
    expect(c.profile.jobCompany).toBe("");
    expect(c.profile.jobTitle).toBe("");
    expect(c.profile.jobNote).toBe("");

    const m = { role: "配偶", name: "王太太" };
    w.ensureMemberJob(m);
    expect(m).toMatchObject({ jobCompany: "", jobTitle: "", jobNote: "" });
  });

  it("三個欄位都畫在『工作與投保』區塊裡（不是拆到別頁）", () => {
    fresh();
    const h = pane();
    expect(h).toContain("工作與投保");
    expect(h).toContain("公司名稱");
    expect(h).toContain("職務");
    expect(h).toContain("工作摘要・補充紀錄");
    // 摘要要在工作類別後面，不能飄到成員卡最下面的背景補充那一區
    expect(h.indexOf("工作摘要・補充紀錄")).toBeGreaterThan(h.indexOf("工作類別"));
    expect(h.indexOf("工作摘要・補充紀錄")).toBeLessThan(h.indexOf("備註・背景補充"));
  });

  it("本人寫進 c.profile，配偶寫進 members[i]", () => {
    const c = fresh();
    w.setJobText("jobCompany", "嵐途科技");
    w.setJobText("jobTitle", "產線品保工程師");
    w.setJobText("jobNote", "三班制，去年調到品保");
    expect(c.profile.jobCompany).toBe("嵐途科技");
    expect(c.profile.jobTitle).toBe("產線品保工程師");
    expect(c.profile.jobNote).toContain("品保");

    w.setMemberJobText(1, "jobCompany", "某某醫院");
    w.setMemberJobText(1, "jobTitle", "護理師");
    expect(c.members[1].jobCompany).toBe("某某醫院");
    expect(c.members[1].jobTitle).toBe("護理師");
    expect(c.profile.jobCompany).toBe("嵐途科技"); // 沒有互相汙染
  });

  it("打字時不整頁 render（游標不能被踢掉）", () => {
    const c = fresh();
    const before = pane();
    w.setJobText("jobTitle", "X");
    expect(pane()).toBe(before);       // 畫面沒被重繪
    expect(c.profile.jobTitle).toBe("X"); // 但資料已經進去了
  });
});

describe("報告書：一行講完他在做什麼", () => {
  it("類別｜公司｜職務 依序串起來，空欄直接略過", () => {
    const c = fresh();
    c.profile.jobType = "一般就業者";
    c.profile.jobCompany = "";
    c.profile.jobTitle = "自由接案設計";
    expect(w.jobLineText(c, null, true)).toBe("一般就業者　｜　自由接案設計");
    c.profile.jobCompany = "嵐途科技";
    expect(w.jobLineText(c, null, true)).toBe("一般就業者　｜　嵐途科技　｜　自由接案設計");
  });

  it("工作類別選『其他』時印自填的字，不是印「其他」", () => {
    const c = fresh();
    c.profile.jobType = "其他";
    c.profile.jobTypeOther = "進修中";
    c.profile.jobCompany = "";
    c.profile.jobTitle = "";
    expect(w.jobLineText(c, null, true)).toBe("進修中");
  });

  it("企業主沒自填公司名稱時，退回公司主檔的名字", () => {
    const c = fresh();
    c.profile.jobType = "企業主";
    c.profile.jobCompany = "";
    c.profile.jobTitle = "負責人";
    c.companies = [{ name: "嵐途實業", sharePct: 100 }];
    expect(w.jobLineText(c, null, true)).toContain("嵐途實業");
  });

  it("報告書印得出工作那一列與工作摘要，成員表多一欄「工作」", () => {
    const c = fresh();
    c.profile.jobCompany = "嵐途科技";
    c.profile.jobTitle = "產線品保工程師";
    c.profile.jobNote = "三班制，去年調到品保";
    const r = w.reportHTML(c) as string;
    expect(r).toContain("產線品保工程師");
    expect(r).toContain("工作摘要");
    expect(r).toContain("三班制，去年調到品保");
    expect(r).toContain("<th>工作</th>");
  });

  it("沒填摘要就不要印空的「工作摘要」列", () => {
    const c = fresh();
    c.profile.jobNote = "   ";
    expect(w.reportHTML(c)).not.toContain("工作摘要");
  });
});
