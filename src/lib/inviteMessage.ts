// 「複製訊息」的文字（2026/10/29 Ray：「有沒有辦法在頁面上做引導，讓我們不用特別通知，就可以照著流程走」）。
// 教練按一下就複製一段可以直接貼 LINE 的訊息：連結＋步驟＋開通碼都在裡面，客戶照著做就會接上。
// 語氣用「您」（Ray 定案）。按鈕名稱必須跟認領頁上的字一致（CLAIM_BUTTON_*），否則客戶找不到要按哪一顆。

export const CLAIM_BUTTON_DEDICATED = "是我，確認接上";
export const CLAIM_BUTTON_GROUP = "確認連結教練";
export const CLAIM_ENTRY_LABEL = "我有教練給的開通碼";

/** 招呼用的名字：三字中文姓名去掉姓（徐浩恩 → 浩恩）；其他原樣。沒名字回空字串（訊息改成只說「您好」）。 */
export function greetName(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  const chars = [...s];
  if (chars.length === 3 && /^[一-鿿]{3}$/.test(s)) return chars.slice(1).join("");
  return s;
}

const hello = (name: string | null | undefined) => {
  const g = greetName(name);
  return g ? `${g}您好，` : "您好，";
};

/**
 * 一對一（客戶頁「客戶登入」）：教練已經在系統建好這位客戶。
 * ready＝規劃已經整理好；false＝先讓客戶開通帳號，見面討論後才會有內容（不叫他去填人生護照——
 * 掛上教練後護照是教練規劃的投影／沙盒，填了不會存成正式資料）。
 */
export function dedicatedMessage(o: { clientName: string | null; link: string; claimCode: string | null; host: string; ready: boolean }): string {
  const lines = [
    `${hello(o.clientName)}${o.ready ? "您的財務規劃我已經整理好了。" : "先邀請您開通嵐途的客戶帳號。"}`,
    "",
    "請點這個連結，用 Google 或 Email 登入：",
    o.link,
    "",
    o.ready
      ? `登入後按「${CLAIM_BUTTON_DEDICATED}」，就能看到我為您整理的規劃，之後也可以隨時回來看。`
      : `登入後按「${CLAIM_BUTTON_DEDICATED}」。我們討論完之後，我會把規劃整理在這裡，您登入就能看到。`,
  ];
  if (o.claimCode) {
    lines.push("", `如果連結打不開：到 ${o.host} 登入，在首頁點「${CLAIM_ENTRY_LABEL}」，輸入：`, o.claimCode);
  }
  return lines.join("\n");
}

/** 一對多（講座、群組群發）：共用邀請連結，誰點進來就新建一位、連到這位教練，接著填人生護照。 */
export function groupInviteMessage(o: { link: string }): string {
  return [
    "您好，邀請您使用嵐途的財務規劃系統，我們一起來規劃。",
    "",
    "請點這個連結，用 Google 或 Email 建立帳號：",
    o.link,
    "",
    `登入後按「${CLAIM_BUTTON_GROUP}」，接著填寫「人生護照」（大約 10 分鐘），我會從這裡開始幫您規劃。`,
  ].join("\n");
}

// ── 客戶首頁的「我的進度」 ──────────────────────────────────────────────
export type PortalGuideState = "start" | "need_coach" | "waiting" | "fill_passport" | "coach_preparing" | "done";

/**
 * 客戶首頁引導卡要顯示哪一態（純函式，頁面餵資料）。
 *   hasPassport：自己做過人生護照（或看得到教練軌投影）
 *   coachPlan：已接上教練的規劃（plans 有教練軌）
 *   link：與教練的連結狀態（none／pending／linked）
 */
export function portalGuideState(o: { hasPassport: boolean; coachPlan: boolean; link: "none" | "pending" | "linked" }): PortalGuideState {
  if (o.coachPlan) return "done";
  if (o.link === "pending") return "waiting";
  if (o.link === "linked") return o.hasPassport ? "coach_preparing" : "fill_passport";
  return o.hasPassport ? "need_coach" : "start";
}

/**
 * 三步驟進度條（① 建立帳號 ② 連結教練 ③ 看教練的規劃）目前做到第幾步——回「已完成」的步數。
 * 進得了首頁＝帳號一定建好了（≥1）；已連結教練＝2；教練規劃已接上＝3。
 */
export function guideDone(s: PortalGuideState): 1 | 2 | 3 {
  if (s === "done") return 3;
  if (s === "fill_passport" || s === "coach_preparing") return 2;
  return 1;
}
