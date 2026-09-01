// 生育費用預設參數（2026/08 查證）。全部＝**今日現值·新台幣元**；通膨由引擎另外套。
// 這份只是 seed —— 上線後改數字請走後台 /admin/categories 的「生育費用」分頁，不要回來改程式。
//
// 為什麼要有這一張表：
//   子女教育（edu_cost_params）最早的一段是「幼兒園（3 歲起）」，
//   所以 **懷孕、生產、月子、0–2 歲** 這一整段在系統裡原本是完全的真空——
//   一位「還沒出生的小孩」從被規劃到上幼兒園之間的錢，一毛都沒有人算。
//
// 政策前提（會影響數字，改動前先確認法規現況）：
//  - 產檢：111/7 起公費產檢由 10 次擴大到 **14 次**，另加 3 次超音波（含 1 次高層次）。
//    所以這裡的產檢金額是「公費之外，實務上常見的自費加購」——不是產檢總額。
//  - 生產：健保給付住院與接生，自費的是無痛分娩、病房差額、防沾黏、止痛等。
//  - 0–2 歲托育：一般家庭送準公共托嬰／保母有托育補助（第 1 胎 13,000／月），
//    自己帶或送私立則領育兒津貼（第 1 胎 5,000／月，第 2 胎 6,000、第 3 胎以上 7,000）。
//    ⚠️ 下面的 INFANT_CARE_ANNUAL 是**已扣掉補助後的自付額**，不要再扣一次。
export type BirthCostSeed = {
  key: string;
  label: string;
  grp: string;      // 分組：孕產 / 月子 / 育兒
  unit: string;     // 次 = 一次性；月 = 每月；年 = 每年
  amount: number;
  note: string;     // 數字的來歷（後台顯示，避免來歷不明）
};

export const BIRTH_COST_BASIS = "2026-08";

export const BIRTH_COST_DEFAULTS: readonly BirthCostSeed[] = [
  {
    key: "PRENATAL_SELF", label: "產檢自費加購（整個孕期）", grp: "孕產", unit: "次", amount: 20000,
    note: "公費 14 次產檢＋3 次超音波之外的常見自費：初期唐氏症篩檢、高層次超音波、NIPT／羊膜穿刺擇一等；市場行情推估",
  },
  {
    key: "DELIVERY_NATURAL", label: "自然產自付（健保給付外）", grp: "孕產", unit: "次", amount: 25000,
    note: "無痛分娩、單人房差額、產包等自費差額；市場行情推估",
  },
  {
    key: "DELIVERY_CSECTION", label: "剖腹產自付（健保給付外）", grp: "孕產", unit: "次", amount: 50000,
    note: "住院天數較長，另有防沾黏製劑、自控式止痛與病房差額；市場行情推估",
  },
  {
    key: "POSTPARTUM_CENTER_MONTH", label: "月子中心（每月）", grp: "月子", unit: "月", amount: 150000,
    note: "全台一個月約 10–20 萬（台北每日 3,300–6,600 元），取中位；YODEE 2026 台北月子中心費用整理",
  },
  {
    key: "POSTPARTUM_NANNY_MONTH", label: "到宅月嫂（每月）", grp: "月子", unit: "月", amount: 70000,
    note: "比 24 小時全日型居家保母（北部 25,000–27,600／月）高，因含月子餐與產婦照護；市場行情推估",
  },
  {
    key: "NEWBORN_GEAR", label: "新生兒用品（一次性）", grp: "育兒", unit: "次", amount: 60000,
    note: "嬰兒床、汽座、推車、消毒鍋、寢具衣物等一次性採購；市場行情推估",
  },
  {
    key: "PRENATAL_VISIT_FEE", label: "產檢掛號與部分負擔（整個孕期）", grp: "孕產", unit: "次", amount: 6000,
    note: "公費 14 次產檢仍要付掛號費與部分負擔，另有孕婦衛教與抽血項目的自付；市場行情推估",
  },
  {
    key: "MATERNITY_KIT", label: "待產包與孕期用品（一次性）", grp: "孕產", unit: "次", amount: 15000,
    note: "托腹帶、孕婦裝、待產包、產褥墊與哺乳內衣等；市場行情推估",
  },
  {
    key: "POSTPARTUM_MEAL_MONTH", label: "月子餐外送（每月·家人照顧時）", grp: "月子", unit: "月", amount: 30000,
    note: "住月子中心或請月嫂時月子餐已含在內，只有「家人照顧」才會單獨叫餐；市場行情推估",
  },
  {
    key: "POSTPARTUM_RECOVERY", label: "產後修復／體態調理（一次性）", grp: "月子", unit: "次", amount: 30000,
    note: "骨盆與腹直肌修復、中醫調理等療程；市場行情推估",
  },
  {
    key: "NEWBORN_SCREEN", label: "新生兒自費篩檢（一次性）", grp: "育兒", unit: "次", amount: 12000,
    note: "公費 21 項新生兒篩檢之外的自費擴充項目與聽力／心臟超音波等；市場行情推估",
  },
  {
    key: "INFANT_VACCINE", label: "0–2 歲自費疫苗（一次性合計）", grp: "育兒", unit: "次", amount: 30000,
    note: "公費之外常打的輪狀病毒、腸病毒 71 型、流感等自費疫苗合計；市場行情推估",
  },
  {
    key: "BREASTFEED_GEAR", label: "哺乳與擠乳用品（一次性）", grp: "育兒", unit: "次", amount: 10000,
    note: "擠乳器、儲乳設備、奶瓶消毒與哺乳枕等；市場行情推估",
  },
  {
    key: "INFANT_CARE_ANNUAL", label: "0–2 歲育兒費用（每年·已扣補助）", grp: "育兒", unit: "年", amount: 180000,
    note: "托育自付（準公共托嬰 22,000／月 − 補助 13,000；居家保母 15,000–18,000／月）＋尿布奶粉衣物醫療；已扣掉托育補助／育兒津貼",
  },
];

/** 0–2 歲育兒費用要付幾年（幼兒園從 3 歲開始，所以是 0、1、2 三年）。 */
export const INFANT_CARE_YEARS = 3;
