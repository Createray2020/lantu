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
  name, rankLabel, headline, bio, specialties, photoUrl, yearsExp, prevRole,
  credentials, serviceModes, areas, compact = false,
}: {
  name: string;
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
          <div className="font-serif text-lg text-tx">{name}</div>
          {rankLabel && <div className="text-xs text-tx2">{rankLabel}</div>}
          {headline && <p className="text-sm text-brand2 mt-1.5 leading-snug">{headline}</p>}
          <div className="text-11 text-tx3 mt-1 space-x-2">
            {yearsExp !== null && !Number.isNaN(yearsExp) && <span>年資 {yearsExp} 年</span>}
            {prevRole && <span>· {prevRole}</span>}
          </div>
        </div>
      </div>

      {/* 第一個＝主專長（教練在「我的檔案」拖曳決定），用顏色點出來；其餘維持中性。 */}
      {specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {specialties.map((s, i) => (
            <SpecialtyChip key={s} name={s} primary={i === 0}
              title={i === 0 ? "主專長" : undefined}
              className="px-2.5 py-1 text-11" />
          ))}
        </div>
      )}

      {bio && (
        <p className={`text-sm text-tx2 mt-3 leading-relaxed whitespace-pre-wrap ${compact ? "line-clamp-4" : ""}`}>
          {bio}
        </p>
      )}

      {(credentials.length > 0 || serviceModes.length > 0 || areas.length > 0) && (
        <div className="mt-3 pt-3 border-t border-line text-11 text-tx3 space-y-1">
          {credentials.length > 0 && <div>證照：{credentials.join("、")}</div>}
          {serviceModes.length > 0 && <div>服務方式：{serviceModes.join("、")}</div>}
          {areas.length > 0 && <div>服務地區：{areas.join("、")}</div>}
        </div>
      )}
    </div>
  );
}
