// 「邀請客戶填投資風險屬性測驗」那一則待辦的標題。
//
// ⚠️ 為什麼要抽成常數而不是各寫各的：createActionItems() 靠**標題**判重
//    （同一個標題不重複建），教練端與客戶端只要有一邊字不一樣，重按邀請就會多一則。
// ⚠️ 這支檔案刻意不放在 actions.ts 裡——"use server" 檔案的每一個 export
//    都必須是 async function，匯出一個字串常數會讓整個模組變成「沒有任何 export」，
//    而且只有 next build 抓得到。
export const RISK_QUIZ_TODO = "完成投資風險屬性測驗（12 題，約 5 分鐘）";
