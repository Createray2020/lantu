// 客戶端首頁「我的現況」——把 engine.overview() 包一層形狀檢查（plans.data 是無型別 jsonb）。
// 算不出來就回 null，首頁那張卡整塊不出現；絕不讓引擎的例外把首頁炸掉。
import { overview, overviewVisionText } from "./engine";

export type ClientOverview = {
  stage: string;
  grade: string | null;
  desc: string;
  task: string;
  good: string[];
  todo: string[];
  visionText: string;
};

function looksLikeCase(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  return !!c.profile && typeof c.profile === "object";
}

export function clientOverviewOf(data: unknown): ClientOverview | null {
  if (!looksLikeCase(data)) return null;
  try {
    const ov = overview(data);
    return {
      stage: String(ov.stage ?? "未評估"),
      grade: (ov.grade ?? null) as string | null,
      desc: String(ov.desc ?? ""),
      task: String(ov.task ?? ""),
      good: (ov.good ?? []) as string[],
      todo: (ov.todo ?? []) as string[],
      visionText: String(overviewVisionText(ov) ?? ""),
    };
  } catch (e) {
    console.error("[clientOverviewOf] 無法計算", e);
    return null;
  }
}
