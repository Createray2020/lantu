// 共同執案的唯讀橫幅。與「期限到期」那條（紅色 ReadOnlyBanner）刻意分開：
// 協作教練不該看到「請聯繫管理員延長期限」這句與他無關的話。
export const COLLAB_READONLY_MESSAGE =
  "你是這位客戶的協作教練：可以看到全部資料與報告書，但不能修改。需要調整請聯繫主責教練。";

export default function CollabBanner() {
  return (
    <div className="bg-[#3b82f6]/12 border-b border-[#3b82f6]/40 text-[#cfe0ff] px-4 sm:px-6 py-2 text-sm">
      <b className="text-[#8fb8ff]">共同執案 · 唯讀</b>
      <span className="ml-2">{COLLAB_READONLY_MESSAGE}</span>
    </div>
  );
}
