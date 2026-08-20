// 官網公開試算 → 註冊 → 存檔，這條動線中間的「草稿」處理（純函式＋瀏覽器儲存，不碰後端）。
//
// 為什麼草稿只放瀏覽器、完全不寫 DB：
// 未登入的訪客在官網填的是年齡、月薪、月存這類財務個資。只要一寫進後端就構成個資蒐集，
// 得先有告知與同意流程。全程留在瀏覽器（純前端計算）就沒有這個問題，
// 官網才能「不用註冊就先玩」。按存檔才進註冊，那時候才蒐集。
import { emptyPassport, computePassport, type PassportInputs } from "./passport";

export const DRAFT_KEY = "lantu.passport.draft.v1";

// Hero 的三格輸入。刻意只有三個：第一屏塞 26 支拉桿會毀掉整個頁面。
export type HeroInputs = {
  curAge: number;
  retireAge: number;
  monthlySave: number; // 萬／月
  salary: number;      // 目前月薪（萬）
};

// 為什麼有第四格：退休可領的錢裡，勞退提撥與勞保年金合計常佔四成以上，
// 而這兩項都是由「月薪」推出來的。少問這一格，等於拿一個訪客沒填過的假設月薪
// 去撐起他看到的四成數字——那不是簡潔，是誤導。
export const HERO_DEFAULT: HeroInputs = { curAge: 35, retireAge: 65, monthlySave: 1, salary: 5 };

// 開始工作的年齡。用來由「退休年齡」推年資，讓 Hero 不必再問第四個問題。
// 這是假設，不是事實，所以結果區一定要把它顯示出來。
export const ASSUMED_WORK_START_AGE = 25;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export function normalizeHero(h: Partial<HeroInputs> | null | undefined): HeroInputs {
  const curAge = clamp(Number(h?.curAge ?? HERO_DEFAULT.curAge), 20, 100);
  // 退休年齡不得早於目前年齡：拉桿可以拉到 50，但 60 歲的人選 50 會算出負的年期。
  const retireAge = clamp(Number(h?.retireAge ?? HERO_DEFAULT.retireAge), Math.max(50, curAge + 1), 100);
  const monthlySave = clamp(Number(h?.monthlySave ?? HERO_DEFAULT.monthlySave), 0, 10);
  const salary = clamp(Number(h?.salary ?? HERO_DEFAULT.salary), 0, 30);
  return { curAge, retireAge, monthlySave, salary };
}

// Hero 三格 → 一份完整的 PassportInputs。
//
// 月存「全額」放進退休，其餘四面向歸零：Hero 問的是退休，而 emptyPassport() 的其他面向
// 各自預設有月存（購房 3 萬、購車 1 萬…）。不歸零的話，訪客從首頁點進完整護照頁，
// 「合計每月應存」會憑空從 1 萬變成 7 萬——同一組輸入在兩個頁面給出不同數字，信任當場沒了。
export function heroToPassport(hero: HeroInputs, baseYear?: number): PassportInputs {
  const h = normalizeHero(hero);
  const p = emptyPassport(baseYear);
  p.retire.curAge = h.curAge;
  p.retire.retireAge = h.retireAge;
  p.retire.monthly = h.monthlySave;
  p.retire.salary = h.salary;
  p.retire.workYears = clamp(h.retireAge - ASSUMED_WORK_START_AGE, 15, 60);
  p.house.monthly = 0;
  p.car.monthly = 0;
  p.support.monthly = 0;
  p.travel.monthly = 0.1; // travel 的拉桿下限就是 0.1，設 0 會讓完整頁一進去就被 clamp 彈動
  return p;
}

// Hero 即時結果：退休後每月可領（自行準備＋勞退＋勞保）。
export function heroResult(hero: HeroInputs) {
  const r = computePassport(heroToPassport(hero)).retire;
  return {
    totalMonthly: r.totalMonthly,
    presentMonthly: r.presentMonthly,
    selfMonthly: r.selfMonthly,
    laborPensionMonthly: r.laborPensionMonthly,
    laborInsMonthly: r.laborInsMonthly,
  };
}

// ---------- 草稿存取（sessionStorage） ----------
// sessionStorage 而非 localStorage：這是一次性的轉換動線，不該在使用者的瀏覽器裡留過夜。
// 同分頁的 redirect（含 Clerk 的 OAuth 來回）會保留，關掉分頁就沒了，正是我們要的生命週期。

type Draft = { inputs: PassportInputs; savedAt: number };

function store(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null; // 無痕模式／被封鎖時 sessionStorage 存取本身就會丟例外
  }
}

export function saveDraft(inputs: PassportInputs, now = Date.now()): boolean {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(DRAFT_KEY, JSON.stringify({ inputs, savedAt: now } satisfies Draft));
    return true;
  } catch {
    return false;
  }
}

export function readDraft(): PassportInputs | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(DRAFT_KEY);
    if (!raw) return null;
    return parseDraft(raw);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    store()?.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

// 抽出來才測得到：草稿是使用者可以在 devtools 隨手改的字串，
// 壞掉的內容要安靜地回 null 走預設值，不能讓整頁炸掉。
export function parseDraft(raw: string): PassportInputs | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  const inputs = (obj as Draft | null)?.inputs as PassportInputs | undefined;
  if (!inputs || typeof inputs !== "object") return null;
  // 五個面向都要在，缺一個就代表格式不是我們寫的，寧可丟掉重來。
  for (const k of ["house", "car", "retire", "support", "travel"] as const) {
    if (!inputs[k] || typeof inputs[k] !== "object") return null;
  }
  return inputs;
}
