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

describe("點人員框＝編輯小視窗", () => {
  const edit = (mid: string, v: Record<string, unknown>) => {
    w._treeEdit = { mid };
    w.treeEditCommit({ name: null, gender: null, age: null, role: null, ...v });
  };

  it("點下去＝選取＋底下換成他的資料卡（2026/09/26 起不再跳小視窗）；編輯視窗仍可直接開", () => {
    const sp = add(self().mid, "sp", { name: "太太", age: "39" });
    w.app.activeTab = "data"; w.app.dataTab = "family";
    w.treeSel(sp.mid);
    expect(w.app.treeSel).toBe(sp.mid);
    expect(w.document.getElementById("treeAddMask"), "點人不再跳小視窗").toBeNull();
    expect(w.document.querySelector(".pcard")?.id).toBe("pc-" + sp.mid);
    expect(w.document.querySelectorAll(".pcard").length, "底下只出一張卡").toBe(1);
    w.treeEditOpen(sp.mid);
    const mk = w.document.getElementById("treeAddMask");
    expect(mk).toBeTruthy();
    expect(w.document.getElementById("treeAddName").value).toBe("太太");
    expect(w.document.getElementById("treeAddAge").value).toBe("39");
    expect(w.document.getElementById("treeAddRole").value).toBe("配偶");
    expect(mk.textContent).toContain("刪除");
    w.treeAddClose();
    expect(w.document.getElementById("treeAddMask")).toBeNull();
    expect(w.app.treeSel).toBe(sp.mid);
  });

  it("本人：寫進 c.profile、角色鎖定、沒有刪除鈕", () => {
    w.treeEditOpen(self().mid);
    const mk = w.document.getElementById("treeAddMask");
    expect(w.document.getElementById("treeAddRole")).toBeNull();
    expect(mk.textContent).not.toContain("刪除");
    w.treeAddClose();
    edit(self().mid, { name: "王大明", gender: "男", age: "42" });
    expect(c().profile.name).toBe("王大明");
    expect(c().profile.age).toBe(42);
  });

  it("改名會連帶更新以姓名為外鍵的欄位（走 set() 的 renameMemberRefs）", () => {
    const sp = add(self().mid, "sp", { name: "太太" });
    c().incomes = [{ name: "薪資", owner: "太太", type: "工作", amount: 100 }];
    edit(sp.mid, { name: "林小美", gender: "女", age: "38", role: "配偶" });
    expect(sp.name).toBe("林小美");
    expect(sp.age).toBe(38);
    expect(c().incomes[0].owner).toBe("林小美");
  });

  it("可以改角色", () => {
    const k = add(self().mid, "ch", { name: "小孩" });
    edit(k.mid, { role: "其他" });
    expect(k.role).toBe("其他");
  });

  it("有生日的人年齡鎖住（由生日換算）", () => {
    const sp = add(self().mid, "sp", { name: "太太" });
    sp.birth = "1987-03-01";
    w.treeEditOpen(sp.mid);
    expect(w.document.getElementById("treeAddAge")).toBeNull();
    expect(w.document.getElementById("treeAddMask").textContent).toContain("由生日");
    w.treeAddClose();
  });

  it("刪除：成員消失、指向他的父母連線一併解除；本人刪不掉", () => {
    const fa = add(self().mid, "pA", { name: "爸" });
    expect(self().parentA).toBe(fa.mid);
    w.confirm = () => true;
    w.treeDelete(fa.mid);
    expect(c().members.find((m: { mid: string }) => m.mid === fa.mid)).toBeUndefined();
    expect(self().parentA).toBe("");
    w.treeDelete(self().mid);
    expect(c().members).toHaveLength(1);
  });
});
