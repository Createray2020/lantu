import { describe, it, expect } from "vitest";
import {
  licenseState, addPeriod, diffDays, todayISO, clientCapOf, quotaState,
  canBePicked, RANK_CLIENT_CAPS, INTERN_MONTHS, PICK_MIN_RANK,
} from "./license";

// 使用期限的地基語意：**沒設定期限＝不檢查**，不是「已過期」。
// 把 null 當過期會在正式收費上線那天把全公司鎖死 —— 這條測試就是為了擋住那個改動。

describe("licenseState", () => {
  const at = (iso: string) => new Date(`${iso}T04:00:00Z`); // 台北中午

  it("沒設定期限 → 不管理、可寫入", () => {
    const s = licenseState({ status: "active" }, at("2026-08-22"));
    expect(s.managed).toBe(false);
    expect(s.expired).toBe(false);
    expect(s.canWrite).toBe(true);
    expect(s.daysLeft).toBeNull();
  });

  it("到期日當天仍可用（daysLeft=0）", () => {
    const s = licenseState({ status: "active", licenseUntil: "2026-08-22" }, at("2026-08-22"));
    expect(s.expired).toBe(false);
    expect(s.canWrite).toBe(true);
    expect(s.daysLeft).toBe(0);
    expect(s.warn).toBe(true);
  });

  it("隔天就唯讀鎖定", () => {
    const s = licenseState({ status: "active", licenseUntil: "2026-08-22" }, at("2026-08-23"));
    expect(s.expired).toBe(true);
    expect(s.canWrite).toBe(false);
    expect(s.daysLeft).toBe(-1);
  });

  it("剩 31 天不提醒、剩 30 天開始提醒", () => {
    expect(licenseState({ licenseUntil: "2026-09-22" }, at("2026-08-22")).warn).toBe(false);
    expect(licenseState({ licenseUntil: "2026-09-21" }, at("2026-08-22")).warn).toBe(true);
  });

  it("停權的人即使期限還在也不能寫", () => {
    const s = licenseState({ status: "suspended", licenseUntil: "2027-01-01" }, at("2026-08-22"));
    expect(s.expired).toBe(false);
    expect(s.canWrite).toBe(false);
  });

  it("待審核的人也不能寫", () => {
    expect(licenseState({ status: "pending" }, at("2026-08-22")).canWrite).toBe(false);
  });

  // 台北 UTC+8：台灣時間 08/23 早上七點，UTC 還是 08/22 23:00。
  // 用 UTC 的今天會讓到期日 08/22 的人在台灣時間 08/23 一整天還能寫（或反過來提早鎖）。
  it("以台北時區的今天為準，不是 UTC 的今天", () => {
    const tpeMorning = new Date("2026-08-22T23:00:00Z"); // ＝台北 08/23 07:00
    expect(todayISO(tpeMorning)).toBe("2026-08-23");
    expect(licenseState({ licenseUntil: "2026-08-22" }, tpeMorning).expired).toBe(true);
  });
});

describe("addPeriod：起日 + N 期 − 1 天", () => {
  it("買一個月＝用到下個月同日的前一天", () => {
    expect(addPeriod("2026-08-22", "month", 1)).toBe("2026-09-21");
  });

  it("買一年", () => {
    expect(addPeriod("2026-08-22", "year", 1)).toBe("2027-08-21");
  });

  it("實習教練半年", () => {
    expect(addPeriod("2026-08-22", "month", INTERN_MONTHS)).toBe("2027-02-21");
  });

  it("月底溢位往前收：1/31 + 1 個月＝2/28 的前一天", () => {
    expect(addPeriod("2026-01-31", "month", 1)).toBe("2026-02-27");
  });

  it("跨閏年 2/29", () => {
    expect(addPeriod("2028-02-29", "year", 1)).toBe("2029-02-27");
  });

  it("連續兩期不會重疊也不會有空隙", () => {
    const end1 = addPeriod("2026-08-22", "month", 1);          // 2026-09-21
    const next = addPeriod(end1, "month", 0);                   // 前一天…用 diffDays 驗接續
    expect(next).toBe("2026-09-20");
    expect(diffDays("2026-08-22", end1)).toBe(30);
  });
});

describe("clientCapOf：個人覆寫 > 職級表 > 內建級距", () => {
  it("實習與 C1–C3 是 20 位", () => {
    for (const code of ["INTERN", "C1", "C2", "C3"]) {
      expect(clientCapOf({ rankCode: code })).toBe(20);
    }
  });

  it("S1／S2 是 50 位，S3／首席是 100 位", () => {
    expect(clientCapOf({ rankCode: "S1" })).toBe(50);
    expect(clientCapOf({ rankCode: "S2" })).toBe(50);
    expect(clientCapOf({ rankCode: "S3" })).toBe(100);
    expect(clientCapOf({ rankCode: "CHIEF" })).toBe(100);
  });

  it("後台在職級表填了上限就以它為準", () => {
    expect(clientCapOf({ rankCode: "C1" }, { C1: 35 })).toBe(35);
  });

  it("個人覆寫最優先", () => {
    expect(clientCapOf({ rankCode: "C1", clientCapOverride: 5 }, { C1: 35 })).toBe(5);
  });

  it("還沒定級＝不擋（定級是後台的動作，不該由系統擅自給上限）", () => {
    expect(clientCapOf({ rankCode: null })).toBeNull();
    expect(clientCapOf(null)).toBeNull();
  });

  it("內建級距與職級表同一組代號", () => {
    expect(Object.keys(RANK_CLIENT_CAPS).sort()).toEqual(
      ["C1", "C2", "C3", "CHIEF", "INTERN", "S1", "S2", "S3"],
    );
  });
});

describe("quotaState", () => {
  it("沒上限＝永遠不滿", () => {
    expect(quotaState(null, 999)).toEqual({ cap: null, used: 999, left: null, full: false });
  });

  it("剛好額滿", () => {
    expect(quotaState(20, 20)).toEqual({ cap: 20, used: 20, left: 0, full: true });
  });

  it("超額（降級後可能發生）不會出現負的剩餘數", () => {
    expect(quotaState(20, 25)).toEqual({ cap: 20, used: 25, left: 0, full: true });
  });
});

// ── 派案資格（2026/08/24 Ray 拍板）──────────────────────────────
// ⚠️ 這條閘的 null 語意跟 licenseUntil **刻意相反**：未定級＝不可被指定。
//    期限沒設是「還沒開始收費」，職級沒設是「還沒被認可到能收派案」。
describe("canBePicked", () => {
  it("S1 以上可以被直接指定／出現在自動建議", () => {
    expect(canBePicked("S1")).toBe(true);
    expect(canBePicked("S2")).toBe(true);
    expect(canBePicked("S3")).toBe(true);
    expect(canBePicked("CHIEF")).toBe(true);
  });

  it("實習與 C1–C3 不派案（首頁照常呈現，但只能靠輸入編號指定）", () => {
    expect(canBePicked("INTERN")).toBe(false);
    expect(canBePicked("C1")).toBe(false);
    expect(canBePicked("C2")).toBe(false);
    expect(canBePicked("C3")).toBe(false);
  });

  it("未定級（null／空字串）＝不可被指定", () => {
    expect(canBePicked(null)).toBe(false);
    expect(canBePicked(undefined)).toBe(false);
    expect(canBePicked("")).toBe(false);
  });

  it("認不得的職級代號一律當不可指定，不要猜", () => {
    expect(canBePicked("VIP")).toBe(false);
  });

  it("後台自訂職級表的 seq 會蓋掉內建順序", () => {
    // 公司把 C3 的 seq 調到 S1 之上 → C3 就吃得到派案
    expect(canBePicked("C3", { C3: 9, S1: 4 })).toBe(true);
    expect(canBePicked("S1", { C3: 9, S1: 4 })).toBe(true);
  });

  it("門檻常數就是 S1", () => {
    expect(PICK_MIN_RANK).toBe("S1");
  });
});
