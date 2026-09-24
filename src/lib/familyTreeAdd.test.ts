import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

/**
 * 族譜上直接新增成員（2026/09/25 Ray）。
 *
 * - 本人身邊常駐虛線空位：＋父／＋母（還沒有父母時）、＋配偶（沒配偶時）、＋子女（永遠在）。
 * - 點選任一位成員 → 它身邊長出自己的空位。
 * - 報告書（淺色）與唯讀模式永遠不出現空位。
 * - 配偶一律與本人同一代（補了祖父母之後不會錯開一層）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let w: any;

beforeAll(async () => {
  const HTML = readFileSync(new URL("../../public/lantu-app.html", import.meta.url), "utf8");
  const dom = new JSDOM(HTML, { runScripts: "dangerously", url: "https://lantu.test/" });
  w = dom.window;
  await new Promise<void>((r) => w.addEventListener("load", () => r(), { once: true }));
  w.app.role = "coach";
});

beforeEach(() => {
  const c = w.migrateCase(w.newCase());
  c.profile.name = "測試客戶";
  c.members = [{ name: "測試客戶", role: "本人", gender: "男", age: 41, expRatio: 100, indepAge: "" }];
  w.app.cases = [c];
  w.app.activeId = c.id;
  w.app.treeSel = "";
  w.LANTU_RO = false;
  w.ensureMemberIds(c);
});

const c = () => w.activeCase();
const self = () => c().members[0];
const ghosts = (svg: string) => (svg.match(/treeAddOpen\('[^']+','(pA|pB|sp|ch)'\)/g) || []).map((s) => s.slice(-4, -2));
const add = (mid: string, kind: string, v: Record<string, unknown> = {}) => {
  w._treeAdd = { mid, kind };
  return w.treeAddCommit({ name: "", gender: "", age: "", ...v });
};
const gen = () => w.familyGenerations(c());

describe("空位卡出現的條件", () => {
  it("只有本人時：父、母、配偶、子女四個空位都在", () => {
    expect(ghosts(w.familyTreeSVG(c(), "dark", true)).sort()).toEqual(["ch", "pA", "pB", "sp"]);
  });

  it("報告書淺色版、非互動、唯讀都沒有空位", () => {
    expect(w.familyTreeSVG(c(), "light")).not.toContain("treeAddOpen");
    expect(w.familyTreeSVG(c())).not.toContain("treeAddOpen");
    w.LANTU_RO = true;
    expect(w.familyTreeSVG(c(), "dark", true)).not.toContain("treeAddOpen");
  });

  it("家庭分頁的族譜區塊是互動版", () => {
    expect(w.familyTreeSec(c())).toContain("treeAddOpen");
  });

  it("補了配偶、父、母之後，本人身邊只剩＋子女", () => {
    add(self().mid, "sp", { name: "太太" });
    add(self().mid, "pA", { name: "爸" });
    add(self().mid, "pB", { name: "媽" });
    w.app.treeSel = "";
    expect(ghosts(w.familyTreeSVG(c(), "dark", true))).toEqual(["ch"]);
  });

  it("已有角色「父」的舊資料（沒連線）也算有父親，不會再長出＋父", () => {
    c().members.push({ name: "老爸", role: "父", gender: "男", age: 70 });
    w.ensureMemberIds(c());
    expect(ghosts(w.familyTreeSVG(c(), "dark", true))).not.toContain("pA");
    // 而且族譜會把他當成本人的父親畫線
    expect(w.effParents(c(), self()).map((m: { name: string }) => m.name)).toEqual(["老爸"]);
  });

  it("沒選取時，其他成員身上不長空位；選取後才長", () => {
    const kid = add(self().mid, "ch", { name: "小孩" });
    w.app.treeSel = "";
    const before = w.familyTreeSVG(c(), "dark", true);
    expect(before).not.toContain(`treeAddOpen('${kid.mid}'`);
    w.app.treeSel = kid.mid;
    const after = w.familyTreeSVG(c(), "dark", true);
    // 子女走預設父母（本人＋配偶），所以只給＋子女
    expect(after).toContain(`treeAddOpen('${kid.mid}','ch')`);
    expect(after).not.toContain(`treeAddOpen('${kid.mid}','pA')`);
    expect(after).toContain("↓ 資料卡");
  });
});

describe("新增後的角色與父母連結", () => {
  it("本人＋父 → 角色父、本人.parentA 指向他", () => {
    const m = add(self().mid, "pA", { name: "爸", age: "68" });
    expect(m.role).toBe("父");
    expect(m.gender).toBe("男");
    expect(m.age).toBe(68);
    expect(m.indepAge).toBe("");
    expect(self().parentA).toBe(m.mid);
  });

  it("本人＋子女 → 角色子女、不寫死連結（走本人＋配偶預設）", () => {
    const sp = add(self().mid, "sp", { name: "太太" });
    expect(sp.role).toBe("配偶");
    expect(sp.gender).toBe("女");
    const k = add(self().mid, "ch", { name: "小寶", gender: "女" });
    expect(k.role).toBe("子女");
    expect(k.parentA || "").toBe("");
    expect(w.effParents(c(), k).map((m: { name: string }) => m.name).sort()).toEqual(["太太", "測試客戶"].sort());
  });

  it("配偶的父母記「長輩」並連到配偶", () => {
    const sp = add(self().mid, "sp", { name: "太太" });
    const fil = add(sp.mid, "pB", { name: "岳母" });
    expect(fil.role).toBe("長輩");
    expect(sp.parentB).toBe(fil.mid);
  });

  it("子女的孩子記「其他」並掛在那位子女身上", () => {
    const k = add(self().mid, "ch", { name: "兒子", gender: "男" });
    const gk = add(k.mid, "ch", { name: "孫女", gender: "女" });
    expect(gk.role).toBe("其他");
    expect(gk.parentA).toBe(k.mid);
    expect(gen()[gk.mid]).toBe(gen()[k.mid] + 1);
  });

  it("新增完會選取新成員，並真的存進 members", () => {
    const m = add(self().mid, "sp", { name: "太太" });
    expect(c().members).toHaveLength(2);
    expect(w.app.treeSel).toBe(m.mid);
  });
});

describe("世代排版", () => {
  it("補了祖父母之後，配偶仍與本人同一代", () => {
    const sp = add(self().mid, "sp", { name: "太太" });
    const fa = add(self().mid, "pA", { name: "爸" });
    add(fa.mid, "pA", { name: "爺爺" });
    const g = gen();
    expect(g[sp.mid]).toBe(g[self().mid]);
    expect(g[self().mid]).toBe(g[fa.mid] + 1);
  });

  it("空位卡的父母位置在最上面一代之上也畫得出來（不會跑出畫布）", () => {
    const svg = w.familyTreeSVG(c(), "dark", true);
    const ys = [...svg.matchAll(/<rect x="[\d.]+" y="(-?[\d.]+)"/g)].map((m) => +m[1]);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
  });
});

describe("不重複的空位", () => {
  it("選取配偶時，＋子女只出現一格（本人那格）", () => {
    const sp = add(self().mid, "sp", { name: "太太" });
    w.app.treeSel = sp.mid;
    const g = ghosts(w.familyTreeSVG(c(), "dark", true));
    expect(g.filter((k) => k === "ch")).toHaveLength(1);
  });
});
