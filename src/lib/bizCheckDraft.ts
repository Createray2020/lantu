// /bizcheck 公開頁 → 註冊 → 存檔，這條動線中間的草稿（純瀏覽器儲存，不碰後端）。
//
// 與人生護照同一個理由：未登入的訪客在官網勾的是「公私帳有沒有分開」「扣繳有沒有辦」
// 這類敏感度不低的資訊。只要一寫進後端就構成個資蒐集，得先有告知與同意流程。
// 全程留在瀏覽器就沒有這個問題，官網才能「不用註冊就先玩」；按存檔進註冊，那時候才蒐集。
//
// 用 sessionStorage 而不是 localStorage：這份東西的壽命就該是「這一次逛官網」，
// 不該躺在別人的電腦裡好幾個月。註冊導回同一個分頁時它還在，這樣就夠了。

export const BIZ_DRAFT_KEY = "lantu.bizcheck.draft.v1";

export type BizCheckAnswers = Record<number, "是" | "否">;
type Draft = { ans: BizCheckAnswers; savedAt: number };

function store(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null; // 無痕模式／擋 cookie 的瀏覽器會直接丟例外
  }
}

export function saveBizDraft(ans: BizCheckAnswers): void {
  try {
    store()?.setItem(BIZ_DRAFT_KEY, JSON.stringify({ ans, savedAt: Date.now() } satisfies Draft));
  } catch {
    /* 存不進去就算了，畫面上的答案還在 */
  }
}

export function readBizDraft(): BizCheckAnswers | null {
  try {
    const raw = store()?.getItem(BIZ_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    const out: BizCheckAnswers = {};
    for (const [k, v] of Object.entries(d?.ans ?? {})) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && i < 10 && (v === "是" || v === "否")) out[i] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

export function clearBizDraft(): void {
  try {
    store()?.removeItem(BIZ_DRAFT_KEY);
  } catch {
    /* noop */
  }
}
