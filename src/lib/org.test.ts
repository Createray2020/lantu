import { describe, it, expect } from "vitest";
import { downlineIds, visibleCoachIds, teamsUnder, rankOf, type CoachRow } from "./org";

// 建小型組織樹：
// owner(o) → mgrA, mgrB
// mgrA → m1, m2 ; m1 → m1a
// mgrB → m3
function c(id: string, orgRank: string, uplineId: string | null): CoachRow {
  return { id, orgRank, uplineId, name: id } as unknown as CoachRow;
}
const all: CoachRow[] = [
  c("o", "owner", null),
  c("mgrA", "manager", "o"),
  c("mgrB", "manager", "o"),
  c("m1", "member", "mgrA"),
  c("m2", "member", "mgrA"),
  c("m1a", "member", "m1"),
  c("m3", "member", "mgrB"),
];

describe("rankOf", () => {
  it("非法值退回 member", () => {
    expect(rankOf({ orgRank: "owner" })).toBe("owner");
    expect(rankOf({ orgRank: "xxx" })).toBe("member");
    expect(rankOf({ orgRank: null })).toBe("member");
  });
});

describe("downlineIds", () => {
  it("含自己與整個子樹", () => {
    expect(downlineIds("mgrA", all).sort()).toEqual(["m1", "m1a", "m2", "mgrA"]);
    expect(downlineIds("m1", all).sort()).toEqual(["m1", "m1a"]);
  });
});

describe("visibleCoachIds", () => {
  it("owner 看全部", () => {
    expect(visibleCoachIds(c("o", "owner", null), all).sort()).toEqual(all.map((x) => x.id).sort());
  });
  it("manager 看自己＋下線子樹", () => {
    expect(visibleCoachIds(c("mgrA", "manager", "o"), all).sort()).toEqual(["m1", "m1a", "m2", "mgrA"]);
  });
  it("member 只看自己", () => {
    expect(visibleCoachIds(c("m1", "member", "mgrA"), all)).toEqual(["m1"]);
  });
});

describe("teamsUnder", () => {
  it("以 owner 直屬下線為隊長，成員為其下線（不含隊長）", () => {
    const teams = teamsUnder("o", all);
    expect(teams.map((t) => t.manager.id).sort()).toEqual(["mgrA", "mgrB"]);
    const a = teams.find((t) => t.manager.id === "mgrA")!;
    expect(a.memberIds.sort()).toEqual(["m1", "m1a", "m2"]);
    const b = teams.find((t) => t.manager.id === "mgrB")!;
    expect(b.memberIds).toEqual(["m3"]);
  });
});
