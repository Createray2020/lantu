/**
 * 願景處理流程（2026/09/27，Ray 定案）——步驟常數的 TS 鏡射。
 * 真相來源在 public/lantu-app.html 的 FLOW_STEPS_GAP／FLOW_STEPS_SUR；
 * 這裡給 server／portal 讀 c.flow.step 時翻成人話用，drift test 守兩邊一致。
 *
 * 六條規則：願景不動／收入優先、支出其次／取捨以客戶願景為尺／
 *          後果只呈現、不代決定／報酬率保守假設／同一筆錢只用一次。
 */
export type FlowTrack = "gap" | "surplus";

export const FLOW_STEPS_GAP: ReadonlyArray<readonly [string, string, string]> = [
  ["S0", "判定", "缺口線"],
  ["S1", "缺口呈現", "◇ D1 願景是他要的？"],
  ["S2", "願景鎖定", "客戶排序"],
  ["S2g", "護欄", "保障・預備金"],
  ["S3", "階段目標", "里程碑"],
  ["S4", "選路", "◇ D2 先收入或支出"],
  ["S5A", "增加收入", "工作＋理財 ◇ 補平？"],
  ["S5B", "減少支出", "客戶自己標 ◇ 補平？"],
  ["S6", "後果", "◇ D3 加碼或接受"],
  ["S6x", "行動清單", "→ 執行・回訪"],
];

export const FLOW_STEPS_SUR: ReadonlyArray<readonly [string, string, string]> = [
  ["P0", "判定", "餘裕線"],
  ["P1", "餘裕呈現", "保守重算"],
  ["P2", "願景再確認", "◇ 要升級？（下一輪）"],
  ["P2g", "護欄", "下一輪"],
  ["P3", "餘裕分配", "下一輪"],
  ["P3x", "行動清單", "下一輪"],
];

export const FLOW_LANES: Record<string, string> = {
  "income-work": "收入·工作",
  "income-invest": "收入·理財",
  expense: "支出",
  guard: "護欄",
  surplus: "餘裕",
};

export type FlowState = {
  track: FlowTrack;
  step: string;
  decisions?: Record<string, { at?: string; step?: string; text?: string; sessionId?: string | null }>;
  visionLock?: { at: string; revisionId: string | null; order: string[] };
  reflow?: boolean;
  startedAt?: string;
  updatedAt?: string;
};

export function flowStepName(track: FlowTrack, step: string): string {
  const list = track === "surplus" ? FLOW_STEPS_SUR : FLOW_STEPS_GAP;
  const hit = list.find((s) => s[0] === step);
  return hit ? hit[1] : step;
}

export function flowTrackName(track: FlowTrack): string {
  return track === "surplus" ? "餘裕線" : "缺口線";
}
