import SpecialtyChip from "./SpecialtyChip";

/**
 * 教練卡片。編輯預覽（我的檔案）、官網列表 /coaches、單人頁、首頁浮層共用同一個元件——
 * 所見即所得不是靠人工同步。
 *
 * ⚠️ 這個檔案原本住在 `app/dashboard/profile/ProfileEditor.tsx` 裡。搬出來的理由是實質的：
 *    官網首頁（server component）要用這張卡，若從編輯器那個 "use client" 檔案 import，
 *    整包 PhotoCropper、裁圖 canvas 與 saveMyProfileAction 都會被拉進**官網首頁**的 bundle。
 *    卡片本身不需要任何 hook，所以這裡刻意不標 "use client"，兩邊都能用。
 */
export default function CoachCard({
  name, code = null, rankLabel, headline, bio, specialties, photoUrl, yearsExp, prevRole,
  credentials, serviceModes, areas, compact = false,
}: {
  name: string;
  /**
   * 教練編號（FC+YYMM+三碼）。印在名字後面——客戶要「指定這一位」時抄的就是它，
   * ⚠️ 2026/09/13 從各頁卡片外的右下角搬進來（Ray）：擺在卡片角落像系統流水號，
   *    貼著名字才讀得出「這是他的代號」。搬進共用卡片後四個頁面自動一致。
   */
  code?: string | null;
  /**
   * 對外只印制度職級（認證教練／資深教練／首席教練／實習教練）。
   * ⚠️ 這裡刻意不是 `title`：教練自填的職稱（「執行長」那種）是對內稱謂，
   *    Ray 2026/08/24 拍板一律不上官網。要改回顯示頭銜之前先跟他確認。
   */
  rankLabel: string | null;
  headline: string | null; bio: string | null;
  specialties: string[]; photoUrl: string | null; yearsExp: number | null;
  prevRole: string | null; credentials: string[]; serviceModes: string[]; areas: string[];
  /** true＝自我介紹只印四行（列表用）。false＝全文，浮層與單人頁用。 */
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-5 shadow-e1">
      <div className="flex items-start gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={name} className="w-20 h-20 rounded-xl object-cover border border-line2 shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-panel2 border border-line grid place-items-center text-2xl text-brand shrink-0 shadow-e1">
            {name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-serif text-lg text-tx">{name}</span>
            {code && (
              <span className="font-mono text-11 tracking-wider text-tx3" title="教練編號">{code}</span>
            )}
          </div>
          {rankLabel && <div className="text-xs text-tx2">{rankLabel}</div>}
          {headline && <p className="text-sm text-brand2 mt-1.5 leading-snug">{headline}</p>}
          <div className="text-11 text-tx3 mt-1 space-x-2">
            {yearsExp !== null && !Number.isNaN(yearsExp) && <span>年資 {yearsExp} 年</span>}
            {prevRole && <span>· {prevRole}</span>}
          </div>
        </div>
      </div>

      {/* 順序＝教練在「我的檔案」拖曳決定的，第一個是他想先被看到的那一項。
          ⚠️ 但一律不上色：把第一個標出顏色會讀成「他只會這一項」（Ray 2026/09/10）。 */}
      {specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {specialties.map((s) => (
            <SpecialtyChip key={s} name={s} className="px-2.5 py-1 text-11" />
          ))}
        </div>
      )}

      {bio && (
        <p className={`text-sm text-tx2 mt-3 leading-relaxed whitespace-pre-wrap ${compact ? "line-clamp-4" : ""}`}>
          {bio}
        </p>
      )}

      {/* 學經歷區塊。
          ⚠️ 改版前是 11px 灰字、全部用頓號串成一行（Ray 2026/09/13：「很像備註」）——
             一個人的碩士、特許資格、專欄作家身分被壓成同一條註腳，讀者根本不會停下來看。
             現在走視覺層級：欄名 11px/600/字距（L4）、內容 13px tx2（L3），證照一項一列。
          ⚠️ 兩欄是 sm 以上才給：手機上兩欄會讓「政治大學與德明財經科大《理財顧問學程》業界講師」
             這種長項目一項折三行，反而更難讀。 */}
      {(credentials.length > 0 || serviceModes.length > 0 || areas.length > 0) && (
        <div className="mt-4 pt-4 border-t border-line space-y-3">
          {credentials.length > 0 && (
            <div>
              <div className="text-11 font-semibold tracking-[0.12em] text-tx3">學經歷與證照</div>
              <ul className="mt-2 grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
                {credentials.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-13 text-tx2 leading-relaxed">
                    <span aria-hidden className="mt-[0.55em] w-1 h-1 rounded-full bg-brand shrink-0" />
                    <span className="min-w-0">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(serviceModes.length > 0 || areas.length > 0) && (
            <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
              {serviceModes.length > 0 && (
                <div>
                  <div className="text-11 font-semibold tracking-[0.12em] text-tx3">服務方式</div>
                  <div className="text-13 text-tx2 mt-1 leading-relaxed">{serviceModes.join("、")}</div>
                </div>
              )}
              {areas.length > 0 && (
                <div>
                  <div className="text-11 font-semibold tracking-[0.12em] text-tx3">服務地區</div>
                  <div className="text-13 text-tx2 mt-1 leading-relaxed">{areas.join("、")}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
