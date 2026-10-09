// 帳務／首頁共用的小圖（伺服器元件可用，純 SVG）。顏色沿用現金流投影那一套 token。
import { fmtMoney0 } from "@/lib/money";
import type { MonthResult } from "@/lib/acctEngine";

const F = fmtMoney0;

/** 損益瀑布：營業額 → 拆分給別人 → 營業毛利 → 固定支出 → 營業稅 → 淨利（與後台本月帳務同一張）。 */
export function WaterfallChart({ r, height = 200 }: { r: MonthResult; height?: number }) {
  const steps: [string, number, string, boolean][] = [
    ["營業額", r.rev, "var(--brand2)", true], ["拆分給別人", -r.split, "var(--danger)", false], ["公司實收", r.gp, "var(--brand2)", true],
    ["固定支出", -r.fixed, "var(--danger)", false], ["營業稅", -r.vat, "var(--danger)", false], ["淨利", r.net, r.net >= 0 ? "var(--ok)" : "var(--danger)", true],
  ];
  const W = 520, H = height, pad = 30, max = Math.max(1, r.rev) * 1.05, sc = (H - pad - 20) / max, bw = 60, gap = (W - pad) / steps.length;
  let y = 0;
  const bars = steps.map(([, v, , sub]) => {
    let top: number, h: number;
    if (sub) { top = H - 20 - Math.max(0, v) * sc; h = Math.abs(v) * sc; y = v; }
    else { const y0 = y, y1 = y + v; top = H - 20 - Math.max(y0, y1) * sc; h = Math.abs(v) * sc; y = y1; }
    return { top, h };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="本月損益瀑布圖">
      {steps.map(([l, v, c, sub], i) => {
        const x = pad + i * gap + 10, { top, h } = bars[i];
        return (
          <g key={l}>
            <rect x={x} y={top} width={bw} height={Math.max(1, h)} rx={3} fill={c} opacity={sub ? 1 : 0.75} />
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--tx3)">{l}</text>
            <text x={x + bw / 2} y={top - 4} textAnchor="middle" fontSize={11} fill="var(--tx)">{F(Math.abs(v))}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 幾個月的長條（實匯／營業額…）：末端標數字，當月實色。 */
export function MonthBars({ rows, current, label }: { rows: { ym: string; v: number }[]; current: string; label?: string }) {
  const W = 520, H = 150, pad = 8, max = Math.max(1, ...rows.map((r) => r.v)) * 1.15, bw = (W - pad * 2) / rows.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label ?? "近幾個月"}>
      {rows.map((r, i) => {
        const h = r.v / max * (H - 40), x = pad + i * bw + 6, y = H - 20 - h;
        return (
          <g key={r.ym}>
            <rect x={x} y={y} width={Math.max(1, bw - 12)} height={Math.max(1, h)} rx={3} fill="var(--brand2)" opacity={r.ym === current ? 1 : 0.45} />
            <text x={x + (bw - 12) / 2} y={y - 4} textAnchor="middle" fontSize={11} fill="var(--tx)">{r.v ? F(r.v) : ""}</text>
            <text x={x + (bw - 12) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--tx3)">{r.ym.slice(2)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 兩條線：營業額 vs 公司實收（末端直接標名字，不靠顏色）。 */
export function TwoLines({ rows }: { rows: { ym: string; a: number; b: number }[] }) {
  const W = 520, H = 160, pad = 10, max = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b))) * 1.1;
  const x = (i: number) => pad + 20 + i * ((W - pad * 2 - 70) / Math.max(1, rows.length - 1));
  const y = (v: number) => H - 24 - v / max * (H - 44);
  const path = (k: "a" | "b") => rows.map((r, i) => `${i ? "L" : "M"}${x(i)} ${y(r[k])}`).join(" ");
  const last = rows[rows.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="營業額與公司實收趨勢">
      <line x1={pad} x2={W - pad} y1={H - 24} y2={H - 24} stroke="var(--line)" />
      <path d={path("a")} fill="none" stroke="var(--brand2)" strokeWidth={2} opacity={0.5} />
      <path d={path("b")} fill="none" stroke="var(--ok)" strokeWidth={2.2} />
      {rows.map((r, i) => (rows.length <= 8 || i % 2) ? <text key={r.ym} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--tx3)">{r.ym.slice(2)}</text> : null)}
      {last && <>
        <text x={x(rows.length - 1) + 6} y={y(last.a) + 4} fontSize={11} fill="var(--brand2)">營業額 {F(last.a)}</text>
        <text x={x(rows.length - 1) + 6} y={y(last.b) + 4} fontSize={11} fill="var(--ok)">公司實收 {F(last.b)}</text>
      </>}
    </svg>
  );
}
