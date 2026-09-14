/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 公司行事曆（2026/09/14 Ray）。
 *
 * ⚠️⚠️ 這支測試的存在理由：**可見層級的過濾必須下推到 SQL**。
 *    「撈全部再在畫面上藏」在瀏覽器上看起來一模一樣，但 RSC payload 會把整個陣列
 *    序列化進網頁原始碼——教練打開檢視原始碼就讀得到「僅核心成員」那幾場的標題。
 *    所以這裡驗的不是「回傳結果對不對」，是「查詢當下有沒有帶 visibility 條件」。
 */
const h = vi.hoisted(() => {
  const state: any = { org: [] as any[], training: [] as any[], wheres: [] as any[], inserted: [] as any[] };

  const builder = () => {
    const b: any = { table: null };
    b.from = (t: any) => { b.table = t?._n ?? null; return b; };
    for (const m of ["leftJoin", "orderBy", "limit", "set", "returning"]) b[m] = () => b;
    b.values = (v: any) => { state.inserted.push(v); return b; };
    b.where = (w: any) => { state.wheres.push(w); return b; };
    b.then = (res: any, rej: any) => {
      const rows = b.table === "org_events" ? state.org
        : b.table === "comp_training_sessions" ? state.training
        : b.table === "__insert" ? [{ id: "new-id" }] : [];
      return Promise.resolve(rows).then(res, rej);
    };
    return b;
  };
  const db = {
    select: () => builder(),
    insert: (t: any) => { const b = builder(); b.from(t); b.table = "__insert"; return b; },
    update: () => builder(),
    delete: () => builder(),
  };
  return { state, db };
});

vi.mock("@/Shared/db", () => ({ db: h.db }));
vi.mock("drizzle-orm", () => ({
  and: (...p: any[]) => ({ op: "and", parts: p.filter(Boolean) }),
  asc: (c: any) => ({ op: "asc", c }),
  desc: (c: any) => ({ op: "desc", c }),
  eq: (c: any, v: any) => ({ op: "eq", c, v }),
  gte: (c: any, v: any) => ({ op: "gte", c, v }),
  lte: (c: any, v: any) => ({ op: "lte", c, v }),
  inArray: (c: any, v: any) => ({ op: "inArray", c, v }),
}));
vi.mock("@/Shared/db/schema", () => ({
  orgEvents: {
    _n: "org_events",
    id: { _c: "id" }, eventDate: { _c: "event_date" }, visibility: { _c: "visibility" },
  },
  compTrainingSessions: {
    _n: "comp_training_sessions",
    id: { _c: "id" }, heldOn: { _c: "held_on" }, topic: { _c: "topic" }, mode: { _c: "mode" },
    hours: { _c: "hours" }, note: { _c: "note" }, speakerId: { _c: "speaker_id" },
  },
  coaches: { _n: "coaches", id: { _c: "id" }, name: { _c: "name" }, displayName: { _c: "display_name" } },
}));
vi.mock("./license", () => ({
  todayISO: () => "2026-09-14",
  addDaysISO: (iso: string, days: number) =>
    new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + days * 86400000)
      .toISOString().slice(0, 10),
}));

import {
  listEvents, upcomingEvents, listMonth, listPastEvents, getEvent,
  visibleLevels, normalizeTime, normalizeKind, normalizeVisibility,
  monthRange, addDaysISO, updateEvent, deleteEvent, createEvent,
} from "./orgEvents";

/** 在 where 樹裡找 visibility 那條 inArray。找不到＝過濾沒下推到 SQL。 */
function visFilter(w: any): string[] | null {
  if (!w) return null;
  if (w.op === "inArray" && w.c?._c === "visibility") return w.v;
  if (w.op === "and") {
    for (const p of w.parts) { const hit = visFilter(p); if (hit) return hit; }
  }
  return null;
}

const org = (over: any = {}) => ({
  id: "e1", eventDate: "2026-09-20", startTime: "19:30", endTime: "21:00",
  kind: "meeting", title: "月會", place: "台中", visibility: "all",
  body: null, minutes: null, createdBy: null, ...over,
});

beforeEach(() => {
  h.state.org = []; h.state.training = []; h.state.wheres = []; h.state.inserted = [];
});

describe("可見層級（往上包含）", () => {
  it("教練只看得到全體；主管多一層；核心成員三層都看得到", () => {
    expect(visibleLevels("member")).toEqual(["all"]);
    expect(visibleLevels("manager")).toEqual(["all", "manager"]);
    expect(visibleLevels("owner")).toEqual(["all", "manager", "owner"]);
  });

  it("⚠️ 過濾下推到 SQL：每一種查法的 where 都帶 visibility 條件", async () => {
    await listEvents("member", "2026-09-01", "2026-09-30");
    expect(visFilter(h.state.wheres[0])).toEqual(["all"]);

    h.state.wheres = [];
    await listMonth("manager", "2026-09");
    expect(visFilter(h.state.wheres[0])).toEqual(["all", "manager"]);

    h.state.wheres = [];
    await upcomingEvents("owner", 7);
    expect(visFilter(h.state.wheres[0])).toEqual(["all", "manager", "owner"]);

    h.state.wheres = [];
    await listPastEvents("member");
    expect(visFilter(h.state.wheres[0])).toEqual(["all"]);

    h.state.wheres = [];
    await getEvent("manager", "e1");
    expect(visFilter(h.state.wheres[0])).toEqual(["all", "manager"]);
  });

  it("getEvent 看不到的那一筆回 null，而不是丟不同的錯（不要洩漏存在與否）", async () => {
    h.state.org = [];           // 教練的查詢帶了 visibility 條件 → 查不到
    expect(await getEvent("member", "e1")).toBeNull();
  });
});

describe("教育訓練場次唯讀投影", () => {
  beforeEach(() => {
    h.state.training = [{
      id: "t1", heldOn: "2026-09-18", topic: "客戶入場問卷操作", mode: "online",
      hours: 2, note: null, speakerName: "邱浩軍", speakerDisplay: null,
    }];
  });

  it("投影進行事曆、帶前綴 id、唯讀、而且沒有會議紀錄這回事", async () => {
    const rows = await listEvents("member", "2026-09-01", "2026-09-30");
    const t = rows.find((r) => r.kind === "training")!;
    expect(t.id).toBe("training:t1");
    expect(t.readOnly).toBe(true);
    expect(t.canMinute).toBe(false);
    expect(t.minutes).toBeNull();
    expect(t.visibility).toBe("all");
    expect(t.place).toBe("線上");
    expect(t.body).toContain("邱浩軍");
    expect(t.body).toContain("2 小時");
  });

  it("⚠️ 訓練場次改不動也刪不掉——時數與維持資格綁在 comp_training_sessions", async () => {
    await expect(updateEvent("training:t1", { date: "2026-09-18", title: "x" })).rejects.toThrow("read_only");
    await expect(deleteEvent("training:t1")).rejects.toThrow("read_only");
  });
});

describe("同一天的排序", () => {
  it("全天排最前，其餘依開始時間", async () => {
    h.state.org = [
      org({ id: "b", startTime: "14:00", title: "下午" }),
      org({ id: "c", startTime: null, endTime: null, title: "全天" }),
      org({ id: "a", startTime: "09:00", title: "早上" }),
    ];
    const rows = await listEvents("member", "2026-09-01", "2026-09-30");
    expect(rows.map((r) => r.title)).toEqual(["全天", "早上", "下午"]);
  });
});

describe("寫入前的正規化", () => {
  it("時間吃 HH:MM 與 HH:MM:SS，垃圾與空字串一律當全天", () => {
    expect(normalizeTime("9:5")).toBeNull();
    expect(normalizeTime("09:05")).toBe("09:05");
    expect(normalizeTime("9:05")).toBe("09:05");
    expect(normalizeTime("19:30:00")).toBe("19:30");
    expect(normalizeTime("")).toBeNull();
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeTime(undefined)).toBeNull();
  });

  it("類型與可見層級都收斂到白名單（沒有 training 這個選項）", () => {
    expect(normalizeKind("training")).toBe("meeting");
    expect(normalizeKind("activity")).toBe("activity");
    expect(normalizeVisibility("boss")).toBe("all");
    expect(normalizeVisibility("owner")).toBe("owner");
  });

  it("全天事件不留結束時間；結束早於開始就當沒填，不要存一段負的區間", async () => {
    await createEvent({ date: "2026-09-20", title: "A", start: "", end: "21:00" }, "c1");
    expect(h.state.inserted[0].startTime).toBeNull();
    expect(h.state.inserted[0].endTime).toBeNull();

    await createEvent({ date: "2026-09-20", title: "B", start: "19:30", end: "09:00" }, "c1");
    expect(h.state.inserted[1].endTime).toBeNull();
  });

  it("日期格式不對、標題空白，寧可丟錯也不要存一列壞資料", async () => {
    await expect(createEvent({ date: "2026/09/20", title: "A" }, "c1")).rejects.toThrow("bad_date");
    await expect(createEvent({ date: "2026-09-20", title: "   " }, "c1")).rejects.toThrow("no_title");
  });
});

describe("日期工具（純 UTC，不吃伺服器時區）", () => {
  it("跨月與跨年都對", () => {
    expect(addDaysISO("2026-09-28", 7)).toBe("2026-10-05");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29"); // 閏年
  });
  it("monthRange 給的是整月，2 月與 31 天的月份都要對", () => {
    expect(monthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});
