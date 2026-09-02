// 報聘（教練申請）的純函式層：路線、欄位、聲明、審核檢核表。
// 不碰 DB、不 import drizzle —— client component（申請表單、後台面板）要直接 import 這一支。
//
// 2026/08/31 Ray 拍板的形狀：
//   · 報聘有**兩條路線**：介紹人推薦（referral）與直接申請（direct）。
//     直接申請就是「直接送出、不需要任何人先確認」；介紹人推薦要先讓介紹人按確認。
//   · 介紹人就是原本的「推薦人」（同一個人、同一個 sponsor_id），核准時自動當上線。
//   · 核准時一次帶齊：職級預設 C1、上線＝介紹人、使用期限預設一年。
//   · 審核者的判斷做成後台可設定的一組預設值＋檢核表，逐項打勾才放行。
//
// ⚠️ 專案沒有檔案儲存服務（學習區的教材一律外部連結、logo 是 dataURL 特例），
//    所以「證明」一律是結構化欄位＋勾選式聲明，不收上傳檔。

export const APPLY_ROUTES = [
  {
    key: "referral",
    label: "介紹人推薦",
    desc: "由現職嵐途教練介紹。填入介紹人的教練編號，送出後由他確認推薦，再進入審核。",
    needsIntroducer: true,
  },
  {
    key: "direct",
    label: "直接申請",
    desc: "沒有介紹人也可以。直接送出申請，由嵐途直接審核。",
    needsIntroducer: false,
  },
] as const;

export type ApplyRoute = (typeof APPLY_ROUTES)[number]["key"];

export const DEFAULT_ROUTE: ApplyRoute = "referral";

export function isApplyRoute(v: unknown): v is ApplyRoute {
  return typeof v === "string" && APPLY_ROUTES.some((r) => r.key === v);
}

export function routeMeta(route: string | null | undefined) {
  return APPLY_ROUTES.find((r) => r.key === route) ?? APPLY_ROUTES[0];
}

/** 介紹人確認的狀態機。direct 路線一律 skipped（不是「跳過確認」，是這條路線本來就沒有這一關）。 */
export type IntroducerState = "pending" | "confirmed" | "declined" | "skipped";

export const INTRODUCER_STATE_LABEL: Record<IntroducerState, string> = {
  pending: "等待介紹人確認",
  confirmed: "介紹人已確認",
  declined: "介紹人未確認",
  skipped: "無需介紹人確認",
};

// ── 報聘進度（唯一真相）──────────────────────────────────────
// 「已送出 → 介紹人確認 → 嵐途審核」這三段，教練端的待開通頁與客戶端首頁都要畫。
// ⚠️ 兩邊各寫一份就是第二份實作：介紹人那一關是**只有推薦路線才存在**的（不是「跳過」而是
//    「這條路線沒有這一關」），任何一邊漏掉這個條件，直接申請的人就會永遠看到一段停在灰色的
//    「等待介紹人確認」——而畫面上完全看不出是 bug。所以抽到純函式層，兩邊吃同一支。
export type ApplyProgressInput = {
  route: string | null | undefined;
  introducerState: string | null | undefined;
  introducerName: string | null | undefined;
};

export type ApplyStep = { label: string; done: boolean; bad: boolean };

export function applySteps(p: ApplyProgressInput): ApplyStep[] {
  const st = (p.introducerState ?? "skipped") as IntroducerState;
  const needsIntro = routeMeta(p.route).needsIntroducer;
  return [
    { label: "已送出報聘申請", done: true, bad: false },
    ...(needsIntro
      ? [
          {
            label: p.introducerName
              ? `${INTRODUCER_STATE_LABEL[st]}（${p.introducerName}）`
              : INTRODUCER_STATE_LABEL[st],
            done: st === "confirmed",
            bad: st === "declined",
          },
        ]
      : []),
    { label: "嵐途審核（含費用確認）", done: false, bad: false },
  ];
}

// ── 說明欄（自述）────────────────────────────────────────────
// 後台的「必填欄位」設定就是用這幾個 key。姓名與手機永遠必填，不進這份清單。
export const APPLY_TEXT_FIELDS = [
  { key: "currentJob", label: "目前工作／現況", placeholder: "例：壽險業務三年／會計事務所／應屆畢業", rows: 1 },
  { key: "motive", label: "報聘動機", placeholder: "為什麼想成為嵐途財務教練？希望為客戶解決什麼？", rows: 4 },
  { key: "experience", label: "相關經歷與可投入時間", placeholder: "過往財務、保險、銀行、業務或其他相關經歷；每週可投入的時間", rows: 4 },
] as const;

export type ApplyTextField = (typeof APPLY_TEXT_FIELDS)[number]["key"];

export const TEXT_FIELD_MAX = 800;

// ── 證照／資歷（結構化，不收檔案）──────────────────────────
export const LICENSE_TYPES = [
  "CFP 國際認證高級理財規劃顧問",
  "AFP 理財規劃顧問",
  "理財規劃人員",
  "信託業業務人員",
  "人身保險業務員",
  "財產保險業務員",
  "投資型保險商品業務員",
  "外幣收付非投資型保險業務員",
  "證券商業務員",
  "投信投顧業務員",
  "記帳士／記帳及報稅代理人",
  "會計師／律師",
  "其他",
] as const;

export type ApplyLicense = {
  /** LICENSE_TYPES 之一；選「其他」時由 name 補充。 */
  type: string;
  /** 「其他」的自填名稱，或證照全名補充。 */
  name?: string;
  /** 取得年月 YYYY-MM。留空不擋（有些舊證照連本人都查不到月份）。 */
  at?: string;
  /** 證書字號。 */
  no?: string;
};

export const LICENSE_MAX = 8;

/** 一列證照要算數，至少要有類別。全空的列在送出前會被丟掉。 */
export function cleanLicenses(rows: ApplyLicense[] | null | undefined): ApplyLicense[] {
  return (rows ?? [])
    .map((r) => ({
      type: (r?.type ?? "").trim().slice(0, 60),
      name: (r?.name ?? "").trim().slice(0, 60) || undefined,
      at: (r?.at ?? "").trim().slice(0, 7) || undefined,
      no: (r?.no ?? "").trim().slice(0, 40) || undefined,
    }))
    .filter((r) => r.type)
    .slice(0, LICENSE_MAX);
}

// ── 勾選式聲明 ──────────────────────────────────────────────
// ⚠️ 這三條不是形式：嵐途的法人身分是一般顧問公司（無金融特許），
//    教練收的是純顧問費、不碰商品佣金（Ray 2026/08/20 拍板）。
//    報聘進來的人多半來自保險或銀行通路，這一關就是把界線在入口講清楚。
export const APPLY_CONSENTS = [
  {
    key: "fee",
    label: "我了解嵐途教練的收入為純顧問費，不來自金融商品佣金，且收費依公司統一價目表。",
  },
  {
    key: "scope",
    label: "我了解嵐途為一般顧問公司（非金融特許事業），不得以嵐途名義從事投資顧問或保險招攬。",
  },
  {
    key: "truth",
    label: "我確認以上填寫的資料與證照資訊屬實，如有不實願接受停權處理。",
  },
] as const;

export type ConsentKey = (typeof APPLY_CONSENTS)[number]["key"];

/** 勾選紀錄：key → 勾選當下的 ISO 時間戳（留時間才是證據，只存 true 等於沒留）。 */
export type Consents = Record<string, string>;

// ── 審核檢核表 ──────────────────────────────────────────────
export type ChecklistItem = {
  key: string;
  label: string;
  /** 必勾才放行；false＝只是提醒。 */
  required: boolean;
  /** 只在這幾條路線出現；留空＝全部路線。 */
  routes?: ApplyRoute[];
};

/** 後台沒設定過時的預設檢核表（2026/08/31 Ray 選的兩項）。 */
export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { key: "credential", label: "證照／資歷已核對", required: true },
  { key: "payment", label: "已確認費用收款", required: true },
];

export type ApplySettings = {
  /** 核准時要帶的職級。null＝不帶（維持未定級）。 */
  defaultRankCode: string | null;
  /** 核准時把上線設成介紹人（原本沒有上線才寫）。 */
  bindUplineToIntroducer: boolean;
  /** 介紹人推薦路線是否一定要介紹人先確認才給核准。 */
  requireIntroducerConfirm: boolean;
  /** 核准時要不要一併開通使用期限。 */
  licenseOn: boolean;
  licenseUnit: "month" | "year";
  licenseQty: number;
  /** 申請表單的必填欄位（姓名與手機不在此列，那兩個永遠必填）。 */
  requiredFields: string[];
  checklist: ChecklistItem[];
};

export const DEFAULT_APPLY_SETTINGS: ApplySettings = {
  defaultRankCode: "C1",
  bindUplineToIntroducer: true,
  requireIntroducerConfirm: true,
  licenseOn: true,
  licenseUnit: "year",
  licenseQty: 1,
  requiredFields: ["motive"],
  checklist: DEFAULT_CHECKLIST,
};

/** 這條路線要跑哪幾項檢核。 */
export function checklistFor(settings: ApplySettings, route: string | null | undefined): ChecklistItem[] {
  const r = routeMeta(route).key;
  return (settings.checklist ?? []).filter((it) => !it.routes?.length || it.routes.includes(r));
}

// ── 送出前的檢核（表單與 server action 共用同一份規則）────────
export type ApplyDraft = {
  route: string;
  name: string;
  phone: string;
  introducerCode: string;
  currentJob: string;
  motive: string;
  experience: string;
  licenses: ApplyLicense[];
  consents: string[];
};

export function emptyDraft(defaultName = ""): ApplyDraft {
  return {
    route: DEFAULT_ROUTE,
    name: defaultName,
    phone: "",
    introducerCode: "",
    currentJob: "",
    motive: "",
    experience: "",
    licenses: [],
    consents: [],
  };
}

const FIELD_LABEL: Record<string, string> = {
  name: "姓名",
  phone: "手機",
  introducerCode: "介紹人教練編號",
  ...Object.fromEntries(APPLY_TEXT_FIELDS.map((f) => [f.key, f.label])),
};

/**
 * 送得出去嗎。回傳缺的欄位（給畫面逐項提示），不是一句「請完整填寫」。
 *
 * ⚠️ 這支同時給表單的送出鈕與 server action 用 —— 只擋前端等於沒擋。
 */
export function missingFields(d: ApplyDraft, settings: ApplySettings): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push("name");
  if (!d.phone.trim()) out.push("phone");
  if (routeMeta(d.route).needsIntroducer && !d.introducerCode.trim()) out.push("introducerCode");
  for (const key of settings.requiredFields ?? []) {
    if (!APPLY_TEXT_FIELDS.some((f) => f.key === key)) continue;
    if (!String((d as unknown as Record<string, string>)[key] ?? "").trim()) out.push(key);
  }
  return out;
}

export function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key;
}

/** 三條聲明全部勾了才送得出去（少一條就等於沒有揭露）。 */
export function consentsDone(checked: string[]): boolean {
  return APPLY_CONSENTS.every((c) => checked.includes(c.key));
}

export function canSubmit(d: ApplyDraft, settings: ApplySettings): boolean {
  return missingFields(d, settings).length === 0 && consentsDone(d.consents);
}

// ── 核准前的閘門 ────────────────────────────────────────────
export type ApprovalInput = {
  route: string | null | undefined;
  introducerState: string | null | undefined;
  /** 已勾選的檢核項 key。 */
  checked: string[];
  /** 沒有申請表（舊帳號）＝不套用檢核表，維持舊流程直接核准。 */
  hasApplication: boolean;
};

export type ApprovalGate = { ok: boolean; reasons: string[] };

/**
 * 能不能按「核准開通」。
 *
 * ⚠️ `hasApplication=false` 一律放行：上線前就存在的帳號沒有申請表，
 *    如果讓檢核表擋住他們，後台會出現一批永遠核准不了的帳號。
 */
export function approvalGate(input: ApprovalInput, settings: ApplySettings): ApprovalGate {
  if (!input.hasApplication) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  const needsIntro = routeMeta(input.route).needsIntroducer;
  if (needsIntro && settings.requireIntroducerConfirm && input.introducerState !== "confirmed") {
    reasons.push(input.introducerState === "declined" ? "介紹人未確認推薦" : "介紹人尚未確認");
  }
  for (const it of checklistFor(settings, input.route)) {
    if (it.required && !input.checked.includes(it.key)) reasons.push(`未勾選：${it.label}`);
  }
  return { ok: reasons.length === 0, reasons };
}
