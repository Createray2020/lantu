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
function Canvas({ onDone, disabled, big }: { onDone: (png: string | null) => void; disabled?: boolean; compact?: boolean; big?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  // 依實際 CSS 尺寸×DPR 配置像素，線條才不會糊。
  const fit = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (c.width === Math.round(r.width * dpr) && c.height === Math.round(r.height * dpr)) return;
    // 重配置會清空：把舊圖存起來再貼回去
    const keep = dirty ? c.toDataURL() : null;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#111";
    g.lineWidth = big ? 3.2 : 2.4;
    if (keep) {
      const im = new Image();
      im.onload = () => g.drawImage(im, 0, 0, r.width, r.height);
      im.src = keep;
    }
  }, [dirty, big]);

  useEffect(() => {
    fit();
    const ro = new ResizeObserver(() => fit());
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [fit]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const g = e.currentTarget.getContext("2d")!;
    g.beginPath();
    g.arc(last.current.x, last.current.y, (big ? 3.2 : 2.4) / 2, 0, Math.PI * 2);
    g.fillStyle = "#111";
    g.fill();
    setDirty(true);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e);
    const g = e.currentTarget.getContext("2d")!;
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
  };
  const up = () => {
    drawing.current = false;
    last.current = null;
  };
  const clear = () => {
    const c = ref.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDirty(false);
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
function FullScreen({ onClose, onDone }: { onClose: () => void; onDone: (png: string) => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 能鎖就鎖橫向；不能（iOS Safari）就靠畫面提示。
    try {
      type Lockable = { lock?: (o: string) => Promise<void> };
      (screen.orientation as unknown as Lockable).lock?.("landscape").catch(() => {});
    } catch {}
    return () => {
      document.body.style.overflow = prev;
      try {
        (screen.orientation as unknown as { unlock?: () => void }).unlock?.();
      } catch {}
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[100] bg-canvas text-tx grid grid-rows-[auto_1fr] p-3 gap-2" role="dialog" aria-modal="true" aria-label="放大簽名">
      <div className="flex items-center justify-between">
        <span className="text-sm text-tx2">在框內手寫簽名<span className="portrait:inline hidden">（把手機轉橫會更好寫）</span></span>
        <button type="button" className="text-sm rounded-md border border-line px-3 py-1.5" onClick={onClose}>取消</button>
      </div>
      <div className="min-h-0">
        <Canvas big onDone={(png) => png && onDone(png)} />
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
