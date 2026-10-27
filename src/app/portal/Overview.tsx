// 客戶端首頁「我的現況」：打開就懂的三行——階段、最早受影響的願景、下一步。
// 2026/10/20 Ray：客戶端一直缺一個「第一眼」首屏；這張卡讀 engine.overview()，不另算。
// 語彙跟全站一致：旅程階段（整裝／啟程／前行／遠行），不打分數。
import type { ClientOverview } from "@/lib/clientOverview";

export default function Overview({ ov }: { ov: ClientOverview | null }) {
  if (!ov) return null;
  const next = ov.todo[0];
  return (
    <div className="max-w-2xl mx-auto mb-6 rounded-xl border border-line bg-panel2 overflow-hidden shadow-e1">
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="text-13 font-bold text-brand2">我的現況</span>
        <span className="text-11 text-tx2">教練最近一次更新的規劃</span>
      </div>
      <div className="px-4 pb-4 border-t border-line pt-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-11 text-tx2">財務階段</span>
          <span className="font-serif text-2xl text-brand">{ov.stage}</span>
        </div>
        {ov.desc && <p className="text-13 text-tx2 mt-1 leading-relaxed">{ov.desc}</p>}
        {ov.visionText && (
          <p className="text-13 text-tx mt-3 leading-relaxed border-l-2 border-brand pl-3">{ov.visionText}</p>
        )}
        {next && (
          <p className="text-13 mt-3">
            <span className="text-tx2">下一步：</span>
            <span className="text-tx font-bold">{next}</span>
          </p>
        )}
      </div>
    </div>
  );
}
