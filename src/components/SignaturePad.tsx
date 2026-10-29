"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 手寫簽名板（2026/10/28 電子簽署）。
 *
 * · 一個 canvas 吃 pointer events：手指、Apple Pencil、滑鼠、觸控板同一套。
 * · 手機上給「放大簽名」——全螢幕、橫向比例的畫布；簽完縮回卡片裡預覽。
 * · 輸出 PNG data URL：裁掉四周空白、等比縮到最長邊 600px，透明底——貼進文件時不會有白框。
 * · 「用我存的簽名」：父層有預存簽名檔就給這顆鈕；選了直接當作本次簽名（仍要勾同意、按確認）。
 *
 * ⚠️ 這個元件只負責「拿到一張圖」，不負責同意、不負責送出。簽署的語意在簽署頁。
 */
export default function SignaturePad({
  value,
  onChange,
  saved,
  disabled = false,
}: {
  value: string | null;
  onChange: (png: string | null) => void;
  saved?: string | null;
  disabled?: boolean;
}) {
  const [full, setFull] = useState(false);
  return (
    <div className="grid gap-2">
      {value ? (
        <div className="rounded-md border border-line bg-white p-2 grid place-items-center">
          <img src={value} alt="你的簽名" className="max-h-28 max-w-full object-contain" />
        </div>
      ) : (
        <Canvas onDone={onChange} disabled={disabled} compact />
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        {value ? (
          <button type="button" className="rounded-md border border-line px-3 py-1.5" disabled={disabled} onClick={() => onChange(null)}>重簽</button>
        ) : (
          <button type="button" className="rounded-md border border-line px-3 py-1.5" disabled={disabled} onClick={() => setFull(true)}>放大簽名</button>
        )}
        {saved && saved !== value && (
          <button type="button" className="rounded-md border border-brand2 text-brand2 px-3 py-1.5" disabled={disabled} onClick={() => onChange(saved)}>用我存的簽名</button>
        )}
      </div>
      {full && (
        <FullScreen
          onClose={() => setFull(false)}
          onDone={(png) => {
            onChange(png);
            setFull(false);
          }}
        />
      )}
    </div>
  );
}

// ── 畫布 ─────────────────────────────────────────────────────────────────────
type Pt = { x: number; y: number };
type Stroke = { pts: Pt[] };

/**
 * ⚠️ LT10（2026/10/29）：筆跡存成座標（畫布的 CSS 座標，不受外層 transform 影響），不是存一張圖。
 *   · 畫布尺寸改變（轉向、網址列收合）時照原比例重畫——舊版存圖再拉伸貼回去，轉向一次字就變形。
 *   · rotated：外層把整個介面轉 90°（直向畫面裡畫一個橫向簽名板）。pointer 的螢幕座標要反轉回畫布座標；
 *     畫布內容本身就是「紙」的方向，輸出不必再旋轉。
 */
function Canvas({ onDone, disabled, big, rotated = false }: { onDone: (png: string | null) => void; disabled?: boolean; compact?: boolean; big?: boolean; rotated?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const base = useRef<{ w: number; h: number } | null>(null); // 第一筆落下時的畫布大小＝紙的大小
  const cur = useRef<Stroke | null>(null);
  const [dirty, setDirty] = useState(false);
  const width = big ? 3.2 : 2.4;

  // 紙座標 → 目前畫布座標：等比縮放、置中（不拉伸）
  const view = useCallback(() => {
    const c = ref.current;
    const W = c?.clientWidth ?? 0, H = c?.clientHeight ?? 0;
    const b = base.current ?? { w: W, h: H };
    const k = b.w && b.h ? Math.min(W / b.w, H / b.h) : 1;
    return { k, ox: (W - b.w * k) / 2, oy: (H - b.h * k) / 2 };
  }, []);

  const redraw = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = c.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#111";
    g.fillStyle = "#111";
    const { k, ox, oy } = view();
    g.lineWidth = width * Math.max(0.6, Math.min(1.5, k));
    for (const st of strokes.current) {
      const P = st.pts.map((p) => ({ x: ox + p.x * k, y: oy + p.y * k }));
      if (P.length === 1) { g.beginPath(); g.arc(P[0].x, P[0].y, g.lineWidth / 2, 0, Math.PI * 2); g.fill(); continue; }
      g.beginPath();
      g.moveTo(P[0].x, P[0].y);
      for (let i = 1; i < P.length; i++) g.lineTo(P[i].x, P[i].y);
      g.stroke();
    }
  }, [view, width]);

  useEffect(() => {
    redraw();
    const ro = new ResizeObserver(() => redraw());
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [redraw]);

  // 螢幕座標 → 紙座標
  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    // rotate(90deg)：畫布的 (0,0) 在螢幕上是外框的右上角；x 沿螢幕往下、y 沿螢幕往左
    const local = rotated ? { x: e.clientY - r.top, y: r.right - e.clientX } : { x: e.clientX - r.left, y: e.clientY - r.top };
    const { k, ox, oy } = view();
    return { x: (local.x - ox) / k, y: (local.y - oy) / k };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const c = e.currentTarget;
    if (!base.current) base.current = { w: c.clientWidth, h: c.clientHeight };
    cur.current = { pts: [pos(e)] };
    strokes.current.push(cur.current);
    setDirty(true);
    redraw();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cur.current) return;
    cur.current.pts.push(pos(e));
    redraw();
  };
  const up = () => {
    cur.current = null;
  };
  const clear = () => {
    strokes.current = [];
    base.current = null;
    cur.current = null;
    setDirty(false);
    redraw();
  };
  const done = () => {
    const c = ref.current;
    if (!c || !dirty) return;
    onDone(exportTrimmed(c));
  };

  return (
    // 全螢幕模式：畫布吃掉所有剩餘高度（父層是 1fr 列、這裡 absolute 撐滿），按鈕列固定在底部——
    // 百分比高度對 canvas 不可靠（會退回 300×150 的固有比例），所以用絕對定位，不用 h-full。
    <div className={big ? "grid grid-rows-[1fr_auto] gap-2 min-h-0 h-full" : "grid gap-2"}>
      <div className={big ? "relative min-h-0" : "contents"}>
      <canvas
        ref={ref}
        className={`${big ? "absolute inset-0 w-full h-full" : "w-full h-40"} rounded-md border border-dashed border-line2 bg-white touch-none select-none ${disabled ? "opacity-50" : "cursor-crosshair"}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        aria-label="簽名區，請在此手寫簽名"
      />
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button type="button" className="rounded-md border border-line px-3 py-1.5" disabled={disabled || !dirty} onClick={clear}>清除</button>
        <button type="button" className="rounded-md bg-brand text-onbrand font-bold px-3 py-1.5 disabled:opacity-40" disabled={disabled || !dirty} onClick={done}>完成簽名</button>
        {!dirty && <span className="text-xs text-tx3">在框內手寫簽名</span>}
      </div>
    </div>
  );
}

// ── 全螢幕（手機橫向）────────────────────────────────────────────────────────
/**
 * ⚠️ LT10：手機開著「直向鎖定」時把手機轉橫，瀏覽器畫面仍是直的——使用者沿長邊寫，存下來就側一邊。
 * 所以畫面是直的時候，整個簽名介面直接畫成橫的（轉 90°），請使用者把手機向左轉橫：
 * 鎖定開著＝畫面不動、介面剛好正過來；鎖定關著＝畫面跟著轉成橫向、改回一般版面——兩種都寫得正、存得正。
 */
function FullScreen({ onClose, onDone }: { onClose: () => void; onDone: (png: string) => void }) {
  const [vp, setVp] = useState<{ w: number; h: number }>(() => ({ w: typeof window === "undefined" ? 0 : window.innerWidth, h: typeof window === "undefined" ? 0 : window.innerHeight }));
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 能鎖就鎖橫向（Android Chrome）；不能（iOS Safari）就靠轉 90° 的版面。
    try {
      type Lockable = { lock?: (o: string) => Promise<void> };
      (screen.orientation as unknown as Lockable).lock?.("landscape").catch(() => {});
    } catch {}
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      try {
        (screen.orientation as unknown as { unlock?: () => void }).unlock?.();
      } catch {}
    };
  }, []);
  const rotated = vp.h > vp.w; // 直向畫面 → 介面轉成橫的
  const box: React.CSSProperties = rotated
    ? { position: "fixed", top: 0, left: vp.w, width: vp.h, height: vp.w, transform: "rotate(90deg)", transformOrigin: "top left" }
    : { position: "fixed", inset: 0 };
  return (
    <div className="z-[100] bg-canvas text-tx grid grid-rows-[auto_1fr] p-3 gap-2" style={box} role="dialog" aria-modal="true" aria-label="放大簽名">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-tx2">{rotated ? "請把手機向左轉成橫向（頂端朝左），在框內手寫簽名" : "在框內手寫簽名"}</span>
        <button type="button" className="text-sm rounded-md border border-line px-3 py-1.5 shrink-0" onClick={onClose}>取消</button>
      </div>
      <div className="min-h-0">
        <Canvas big rotated={rotated} onDone={(png) => png && onDone(png)} />
      </div>
    </div>
  );
}

// ── 輸出：裁白邊、等比縮、透明底 ───────────────────────────────────────────
function exportTrimmed(c: HTMLCanvasElement, maxSide = 600): string {
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return c.toDataURL("image/png");
  const pad = 12;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const scale = Math.min(1, maxSide / Math.max(cw, ch));
  const out = document.createElement("canvas");
  out.width = Math.round(cw * scale);
  out.height = Math.round(ch * scale);
  out.getContext("2d")!.drawImage(c, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
